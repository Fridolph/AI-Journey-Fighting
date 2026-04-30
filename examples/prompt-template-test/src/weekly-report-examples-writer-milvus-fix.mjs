/**
 * weekly-report-examples-writer-milvus-fix.mjs
 *
 * 【修复版】周报示例写入 Milvus
 *
 * 核心修复：
 *   原脚本只读 OPENAI_API_KEY / OPENAI_BASE_URL，导致无法区分 Chat 和 Embedding 两套 API。
 *   现在支持 .env 中独立配置 Chat 和 Embedding 的 API 地址与密钥：
 *     - Chat 用 DEEPSEEK_* 或 OPENAI_*
 *     - Embedding 用 EMBEDDINGS_URL + EMBEDDINGS_API_KEY（优先），
 *       未设置时回退到 OPENAI_API_KEY / OPENAI_BASE_URL
 *
 * 其他改进：
 *   1. embedding 模型预检：批量前先发一条测试请求，提前暴露连通性问题
 *   2. 不再硬传 dimensions 参数（第三方 embedding 如 DashScope/千问不支持）
 *   3. 逐条插入 + 容错：某一条失败不影响其余数据
 *   4. 脱敏日志：API key 打印时部分隐藏
 */

import 'dotenv/config';
import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node';
import { OpenAIEmbeddings } from '@langchain/openai';

// ============================================================================
// 第一部分：常量与配置
// ============================================================================

// Milvus 集合名称 —— 后续 example-selector 读取时会用到同一个集合
const COLLECTION_NAME = process.env.MILVUS_COLLECTION_NAME ?? 'weekly_report_examples';

/**
 * embedding 向量维度。
 * 不手动指定，由实际模型调用时返回的维度决定。
 * Milvus 建集合时会用这个值，若与实际不匹配可在预检后调整。
 */
const VECTOR_DIM = 1024;

// Milvus 连接地址
const MILVUS_ADDRESS = process.env.MILVUS_ADDRESS ?? 'localhost:19530';

/**
 * embedding API 配置
 *
 * 优先使用 EMBEDDINGS_URL / EMBEDDINGS_API_KEY（如 DashScope 千问），
 * 若未设置则回退到 OPENAI_API_KEY / OPENAI_BASE_URL（Chat 和 Embedding 共用同一服务）。
 *
 * .env 示例（Chat 用 DeepSeek，Embedding 用千问）：
 *   EMBEDDINGS_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
 *   EMBEDDINGS_MODEL_NAME=text-embedding-v3
 *   EMBEDDINGS_API_KEY=sk-xxx
 */
const EMBEDDINGS_API_KEY = process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY;
const EMBEDDINGS_BASE_URL = process.env.EMBEDDINGS_URL || process.env.OPENAI_BASE_URL;
const EMBEDDINGS_MODEL_NAME = process.env.EMBEDDINGS_MODEL_NAME;

// ============================================================================
// 第二部分：8 条周报示例 —— 不同场景风格
// ============================================================================

/**
 * 每条示例包含两个字段：
 * - scenario：场景描述，用来做语义匹配
 * - report_snippet：该场景下生成的周报片段，作为 few-shot 输出参考
 *
 * 后续 example-selector 会根据用户 input 与 scenario 的语义相似度，
 * 自动选出最相关的几条示例参与 few-shot 提示词组装。
 */
const EXAMPLES = [
  {
    scenario: '支付系统稳定性治理，强调风险防控、告警收敛和应急预案完善。',
    report_snippet:
      `- 本周聚焦支付链路稳定性，共处理 P1 事故 1 起、P2 事故 2 起，均在 SLA 内完成修复；\n` +
      `- 针对历史高频超时问题，完成 3 个关键接口的超时阈值和重试策略优化；\n` +
      `- 优化告警策略，合并冗余告警 10 条，新增 5 条基于 SLO 的告警规则。`,
  },
  {
    scenario: '新功能首发，更多是对外展示亮点，如新看板、新能力上线，适合发给大量跨部门同学。',
    report_snippet:
      `- 上线「运营实时看板」，支持业务实时查看核心转化漏斗；\n` +
      `- 打通埋点 → DWD → 实时服务链路，为后续精细化运营提供基础；\n` +
      `- 组织 2 场跨部门分享，帮助非技术同学理解新能力的业务价值。`,
  },
  {
    scenario: '重大版本发布节奏紧凑，需要对外同步一揽子新能力，强调可视化展示和业务价值。',
    report_snippet:
      `- 正式发布「增长分析 2.0」版本，新增留存分群、活动追踪等 5 项核心能力；\n` +
      `- 与市场同学联合输出发布解读文档，并在周会中向核心干系人进行路演；\n` +
      `- 配合运营梳理了 3 条重点推广场景，推动更多业务线接入新能力。`,
  },
  {
    scenario: '偏向产品体验优化和灰度试点，虽然不是大规模首发，但需要让老板看到长期产品线升级方向。',
    report_snippet:
      `- 针对「自助配置」后台完成一轮体验优化，减少 3 个关键操作步骤，提升整体可用性；\n` +
      `- 在小流量场景下灰度上线「智能推荐」能力，观察首周转化率提升约 3 个百分点；\n` +
      `- 拉通产品、运营和数据同学，对后续两个月的产品升级路线图达成一致。`,
  },
  {
    scenario: '技术债清理为主，核心工作是重构、单测补齐、文档完善，节奏偏稳，不强调对外大新闻。',
    report_snippet:
      `- 对老旧结算模块进行分层重构，拆出 3 个独立子模块，代码结构更加清晰；\n` +
      `- 补齐 25 条关键路径单元测试用例，整体覆盖率从 55% 提升到 68%；\n` +
      `- 完成 2 份系统设计文档补全，方便后续同学接手维护。`,
  },
  {
    scenario: '以老系统拆分和代码瘦身为主，更多是内部质量提升，重点在于风险可控和长期维护成本下降。',
    report_snippet:
      `- 拆分历史「大单体」服务中的账务子模块，沉淀为独立结算服务，减少跨模块耦合；\n` +
      `- 清理 30+ 条废弃接口和配置项，并在网关层加保护，降低后续演进阻力；\n` +
      `- 对关键重构路径补充回滚预案和演练手册，保证发布过程可控。`,
  },
  {
    scenario: '聚焦测试补齐和监控完善，希望通过一轮技术债治理把「隐性风险」暴露并关掉。',
    report_snippet:
      `- 新增 40+ 条端到端回归用例，覆盖主交易链路和高风险边界场景；\n` +
      `- 完成核心链路埋点和监控指标补齐，为后续 SLO 建设打下基础；\n` +
      `- 针对本周发现的 3 个潜在性能瓶颈，拉齐改造方案并排入后续技术债清单。`,
  },
  {
    scenario: '偏向团队协作和流程优化，比如值班轮值、需求评审机制、跨团队沟通等软性建设。',
    report_snippet:
      `- 完成新一轮值班排班和值班手册更新，降低新同学值班心理压力；\n` +
      `- 优化需求评审流程，引入「技术风险清单」模板，帮助更早发现潜在问题；\n` +
      `- 与运维、产品同学一起梳理了故障复盘模板，后续复盘将更聚焦于可执行改进项。`,
  },
];

// ============================================================================
// 第三部分：构建 embedding 实例
// ============================================================================

/**
 * 构建 OpenAIEmbeddings 实例的配置对象。
 *
 * 关键点：
 * - 不传 dimensions：DashScope/千问等第三方 embedding 不支持此参数，会导致 404
 * - apiKey 和 baseURL 优先使用 EMBEDDINGS_* 环境变量
 */
function buildEmbeddingsConfig() {
  return {
    apiKey: EMBEDDINGS_API_KEY,
    model: EMBEDDINGS_MODEL_NAME,
    configuration: {
      baseURL: EMBEDDINGS_BASE_URL,
    },
  };
}

const embeddings = new OpenAIEmbeddings(buildEmbeddingsConfig());

// ============================================================================
// 第四部分：Milvus 客户端初始化
// ============================================================================

const milvusClient = new MilvusClient({
  address: MILVUS_ADDRESS,
});

// ============================================================================
// 第五部分：工具函数
// ============================================================================

/**
 * 脱敏打印 —— 日志中只显示 API key 的前后各 4 位，中间用星号替代
 * 避免密钥完整泄露到终端输出
 */
function maskKey(key) {
  if (!key || key.length <= 8) return '***';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

/**
 * 将单条示例的 scenario + report_snippet 拼接后，获取其向量嵌入
 * 拼接两段文本可以让向量更全面地表达这条示例的语义
 */
async function getEmbedding(text) {
  const result = await embeddings.embedQuery(text);
  return result;
}

/**
 * 【新增】embedding 连通性预检
 *
 * 在批量插入之前，先用一句短文本调用一次 embedding API，
 * 验证模型名、baseURL、API key 三者是否匹配。
 * 如果这一步失败，后续 8 条全都会失败，提前报错可以更快定位问题。
 */
async function precheckEmbedding() {
  const testText = '你好，这是一个连通性测试。';
  console.log(`  测试文本: "${testText}"`);
  const vector = await getEmbedding(testText);
  console.log(`  ✓ embedding API 预检通过，输出向量维度: ${vector.length}`);
  return vector.length;
}

/**
 * 创建 Milvus 集合（如果不存在）
 *
 * 字段设计：
 * - id：主键，VARCHAR 类型，用于唯一标识每条示例
 * - scenario：场景描述文本，最长 2000 字符
 * - report_snippet：周报片段文本，最长 10000 字符
 * - vector：FloatVector 类型，语义嵌入向量
 */
async function ensureCollection() {
  try {
    const hasCollection = await milvusClient.hasCollection({
      collection_name: COLLECTION_NAME,
    });

    if (!hasCollection.value) {
      console.log('创建集合...');
      await milvusClient.createCollection({
        collection_name: COLLECTION_NAME,
        fields: [
          {
            name: 'id',
            data_type: DataType.VarChar,
            max_length: 100,
            is_primary_key: true,
          },
          {
            name: 'scenario',
            data_type: DataType.VarChar,
            max_length: 2000,
          },
          {
            name: 'report_snippet',
            data_type: DataType.VarChar,
            max_length: 10000,
          },
          {
            name: 'vector',
            data_type: DataType.FloatVector,
            // 如果未指定维度，Milvus 需要知道实际维度；首次插入时 Milvus 会自动推断
            // 这里从环境变量取，没取到则使用默认 1024（后续可在预检后动态调整）
            dim: VECTOR_DIM ?? 1024,
          },
        ],
      });
      console.log('  ✓ 集合创建成功');

      // 创建向量索引 —— 后续相似度检索依赖此索引
      console.log('创建索引...');
      await milvusClient.createIndex({
        collection_name: COLLECTION_NAME,
        field_name: 'vector',
        index_type: IndexType.IVF_FLAT,
        metric_type: MetricType.COSINE, // 余弦相似度，适用于语义搜索
        params: { nlist: 1024 },
      });
      console.log('  ✓ 索引创建成功');
    }

    // 确保集合已被加载到内存，才能进行插入和查询
    try {
      await milvusClient.loadCollection({ collection_name: COLLECTION_NAME });
      console.log('  ✓ 集合已加载');
    } catch {
      // 可能已经加载过了，忽略重复加载错误
      console.log('  ✓ 集合已处于加载状态');
    }
  } catch (error) {
    console.error('创建集合时出错:', error.message);
    throw error;
  }
}

/**
 * 【核心】将 8 条周报示例逐条插入 Milvus
 *
 * 与原始版本的区别：
 * - 改为逐条插入（而非批量），每条有独立的 try-catch，某一条失败不阻塞其余
 * - 插入前记录日志，方便追踪进度
 */
async function insertExamples() {
  if (EXAMPLES.length === 0) return 0;

  console.log(`\n开始生成向量并逐条插入 ${EXAMPLES.length} 条周报示例...`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < EXAMPLES.length; i++) {
    const example = EXAMPLES[i];
    const id = `weekly_${i + 1}`;

    try {
      // 拼接 scenario 与 report_snippet 作为 embedding 输入文本
      // 这样生成的向量能同时编码"场景意图"和"报告内容"
      const inputText = example.scenario + example.report_snippet;
      const vector = await getEmbedding(inputText);

      // 插入单条数据到 Milvus
      await milvusClient.insert({
        collection_name: COLLECTION_NAME,
        data: [
          {
            id,
            scenario: example.scenario,
            report_snippet: example.report_snippet,
            vector,
          },
        ],
      });

      successCount++;
      console.log(`  [${i + 1}/${EXAMPLES.length}] ✓ ${id} 插入成功`);
    } catch (error) {
      failCount++;
      console.error(`  [${i + 1}/${EXAMPLES.length}] ✗ ${id} 插入失败: ${error.message}`);
      // 不 throw，继续处理下一条
    }
  }

  return { successCount, failCount, total: EXAMPLES.length };
}

// ============================================================================
// 第六部分：主流程
// ============================================================================

async function main() {
  try {
    console.log('='.repeat(80));
    console.log('周报示例写入 Milvus (修复版)');
    console.log('='.repeat(80));

    // --- 步骤 0：打印当前配置（脱敏）---
    console.log('\n当前配置:');
    console.log(`  Milvus 地址:        ${MILVUS_ADDRESS}`);
    console.log(`  集合名称:           ${COLLECTION_NAME}`);
    console.log(`  Embedding API URL:  ${EMBEDDINGS_BASE_URL}`);
    console.log(`  Embedding 模型:     ${EMBEDDINGS_MODEL_NAME}`);
    console.log(`  Embedding API Key:  ${maskKey(EMBEDDINGS_API_KEY)}`);
    console.log(`  向量维度(建集合用): ${VECTOR_DIM}`);
    console.log(`  示例条数:           ${EXAMPLES.length}`);

    // --- 步骤 1：连接 Milvus ---
    console.log('\n--- 步骤 1：连接 Milvus ---');
    await milvusClient.connectPromise;
    console.log('✓ 已连接');

    // --- 步骤 2：创建 / 加载集合 ---
    console.log('\n--- 步骤 2：准备集合 ---');
    await ensureCollection();

    // --- 步骤 3：【新增】embedding API 预检 ---
    console.log('\n--- 步骤 3：embedding API 预检 ---');
    const actualDim = await precheckEmbedding();

    /**
     * 如果预检返回的维度与创建集合时指定的维度不一致，
     * 说明环境变量 EMBEDDINGS_DIMENSIONS 设置的值与实际模型不匹配，
     * 需要更新 .env 中的 EMBEDDINGS_DIMENSIONS 或删除集合重建。
     */
    if (VECTOR_DIM && actualDim !== VECTOR_DIM) {
      console.warn(
        `  ⚠ 警告：预检返回维度 (${actualDim}) 与 EMBEDDINGS_DIMENSIONS (${VECTOR_DIM}) 不一致！`
      );
      console.warn('  请检查 .env 中 EMBEDDINGS_DIMENSIONS 的值，或删除集合后重建。');
    }

    // --- 步骤 4：逐条插入示例 ---
    console.log('\n--- 步骤 4：插入周报示例 ---');
    const result = await insertExamples();

    // --- 完成 ---
    console.log('\n' + '='.repeat(80));
    console.log(
      `写入完成！成功 ${result.successCount} 条，失败 ${result.failCount} 条，共 ${result.total} 条`
    );
    console.log('='.repeat(80));

    if (result.failCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n致命错误:', error.message);

    // 针对常见错误给出排查建议
    if (error.message?.includes('MODEL_NOT_FOUND') || error.message?.includes('404')) {
      console.error('\n排查建议:');
      console.error(`  1. Embedding API URL: ${EMBEDDINGS_BASE_URL}`);
      console.error(`  2. Embedding 模型名: ${EMBEDDINGS_MODEL_NAME}`);
      console.error('  3. 确认 EMBEDDINGS_URL 和 EMBEDDINGS_API_KEY 是否正确');
      console.error('  4. 确认 EMBEDDINGS_MODEL_NAME 在目标服务上存在');
    } else if (error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
      console.error('\n排查建议:');
      console.error('  1. 确认 Milvus 服务已启动 (docker ps | grep milvus)');
      console.error('  2. 检查 MILVUS_ADDRESS 端口是否正确');
    }

    process.exit(1);
  }
}

main();

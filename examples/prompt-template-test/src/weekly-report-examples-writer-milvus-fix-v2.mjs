import 'dotenv/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Milvus } from '@langchain/community/vectorstores/milvus';

/**
 * 周报示例写入 Milvus（修复版 v2）
 *
 * ● 问题诊断：
 *   原版 weekly-report-examples-writer-milvus.mjs 用原生 Milvus SDK 直接建表+写数据，
 *   自定义字段为 scenario / report_snippet / vector。
 *   但 LangChain 的 Milvus 检索层读取的是 langchain_text 字段（textField），
 *   导致 similaritySearch 返回的 doc.pageContent 为空，FewShot 拿不到示例内容。
 *
 * ● 修复方案：
 *   走 LangChain 的 Milvus.fromDocuments() 建集合 + 写数据：
 *     - pageContent  → 自动存入 vector（embedding）+ langchain_text（原文）
 *     - metadata     → 自动序列化存入 JSON 字段
 *   检索时 doc.pageContent + doc.metadata 均可正常读取。
 */

const COLLECTION_NAME = 'weekly_report_examples';
const VECTOR_DIM = 1024;

const EXAMPLES = [
  {
    scenario: '支付系统稳定性治理，强调风险防控、告警收敛和应急预案完善。',
    report_snippet:
      '- 本周聚焦支付链路稳定性，共处理 P1 事故 1 起、P2 事故 2 起，均在 SLA 内完成修复；\n' +
      '- 针对历史高频超时问题，完成 3 个关键接口的超时阈值和重试策略优化；\n' +
      '- 优化告警策略，合并冗余告警 10 条，新增 5 条基于 SLO 的告警规则。',
  },
  {
    scenario: '新功能首发，更多是对外展示亮点，如新看板、新能力上线，适合发给大量跨部门同学。',
    report_snippet:
      '- 上线「运营实时看板」，支持业务实时查看核心转化漏斗；\n' +
      '- 打通埋点 → DWD → 实时服务链路，为后续精细化运营提供基础；\n' +
      '- 组织 2 场跨部门分享，帮助非技术同学理解新能力的业务价值。',
  },
  {
    scenario: '重大版本发布节奏紧凑，需要对外同步一揽子新能力，强调可视化展示和业务价值。',
    report_snippet:
      '- 正式发布「增长分析 2.0」版本，新增留存分群、活动追踪等 5 项核心能力；\n' +
      '- 与市场同学联合输出发布解读文档，并在周会中向核心干系人进行路演；\n' +
      '- 配合运营梳理了 3 条重点推广场景，推动更多业务线接入新能力。',
  },
  {
    scenario: '偏向产品体验优化和灰度试点，虽然不是大规模首发，但需要让老板看到长期产品线升级方向。',
    report_snippet:
      '- 针对「自助配置」后台完成一轮体验优化，减少 3 个关键操作步骤，提升整体可用性；\n' +
      '- 在小流量场景下灰度上线「智能推荐」能力，观察首周转化率提升约 3 个百分点；\n' +
      '- 拉通产品、运营和数据同学，对后续两个月的产品升级路线图达成一致。',
  },
  {
    scenario: '技术债清理为主，核心工作是重构、单测补齐、文档完善，节奏偏稳，不强调对外大新闻。',
    report_snippet:
      '- 对老旧结算模块进行分层重构，拆出 3 个独立子模块，代码结构更加清晰；\n' +
      '- 补齐 25 条关键路径单元测试用例，整体覆盖率从 55% 提升到 68%；\n' +
      '- 完成 2 份系统设计文档补全，方便后续同学接手维护。',
  },
  {
    scenario: '以老系统拆分和代码瘦身为主，更多是内部质量提升，重点在于风险可控和长期维护成本下降。',
    report_snippet:
      '- 拆分历史「大单体」服务中的账务子模块，沉淀为独立结算服务，减少跨模块耦合；\n' +
      '- 清理 30+ 条废弃接口和配置项，并在网关层加保护，降低后续演进阻力；\n' +
      '- 对关键重构路径补充回滚预案和演练手册，保证发布过程可控。',
  },
  {
    scenario: '聚焦测试补齐和监控完善，希望通过一轮技术债治理把「隐性风险」暴露并关掉。',
    report_snippet:
      '- 新增 40+ 条端到端回归用例，覆盖主交易链路和高风险边界场景；\n' +
      '- 完成核心链路埋点和监控指标补齐，为后续 SLO 建设打下基础；\n' +
      '- 针对本周发现的 3 个潜在性能瓶颈，拉齐改造方案并排入后续技术债清单。',
  },
  {
    scenario: '偏向团队协作和流程优化，比如值班轮值、需求评审机制、跨团队沟通等软性建设。',
    report_snippet:
      '- 完成新一轮值班排班和值班手册更新，降低新同学值班心理压力；\n' +
      '- 优化需求评审流程，引入「技术风险清单」模板，帮助更早发现潜在问题；\n' +
      '- 与运维、产品同学一起梳理了故障复盘模板，后续复盘将更聚焦于可执行改进项。',
  },
];

// embedding 用千问独立配置
const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.EMBEDDINGS_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME,
  configuration: {
    baseURL: process.env.EMBEDDINGS_URL,
  },
  dimensions: VECTOR_DIM,
});

async function main() {
  try {
    console.log('='.repeat(80));
    console.log('周报示例写入 Milvus（LangChain 标准方式）');
    console.log('='.repeat(80));

    // 1. 如果旧集合存在且 schema 不兼容（原生 SDK 自建的），先删除
    const { MilvusClient } = await import('@zilliz/milvus2-sdk-node');
    const client = new MilvusClient({
      address: process.env.MILVUS_ADDRESS ?? 'localhost:19530',
    });

    const hasCollection = await client.hasCollection({
      collection_name: COLLECTION_NAME,
    });

    if (hasCollection.value) {
      console.log('检测到旧集合，删除后由 LangChain 重建...');
      await client.dropCollection({ collection_name: COLLECTION_NAME });
      console.log('✓ 旧集合已删除');
    }

    // 2. 用 LangChain 的 fromDocuments 创建集合并写入数据
    //    pageContent: scenario + report_snippet 拼接 → embedding + langchain_text
    //    metadata: 存原始 scenario 和 report_snippet → JSON 字段
    const { Document } = await import('@langchain/core/documents');
    const docs = EXAMPLES.map((example, index) => {
      // 以 scenario + report_snippet 作为要向量化的文本
      const pageContent = `${example.scenario}\n${example.report_snippet}`;
      return new Document({
        pageContent,
        metadata: {
          scenario: example.scenario,
          report_snippet: example.report_snippet,
        },
      });
    });

    console.log(`\n写入 ${docs.length} 条文档到 Milvus...`);
    const vectorStore = await Milvus.fromDocuments(docs, embeddings, {
      collectionName: COLLECTION_NAME,
      clientConfig: {
        address: process.env.MILVUS_ADDRESS ?? 'localhost:19530',
      },
      // 索引配置：与 example-selector2-fix.mjs 保持一致
      indexCreateOptions: {
        index_type: 'IVF_FLAT',
        metric_type: 'COSINE',
        params: { nlist: 1024 },
      },
    });

    console.log('✓ 文档写入完成');
    console.log('='.repeat(80));

    // 3. 验证：跑一次相似性检索，确认数据可正常读取
    console.log('\n验证检索结果...');
    const results = await vectorStore.similaritySearch(
      '技术债清理：重构订单模块，补齐单测',
      2
    );
    results.forEach((doc, i) => {
      console.log(`\n第 ${i + 1} 名:`);
      console.log(`  pageContent 前80字: ${doc.pageContent.slice(0, 80)}...`);
      console.log(`  metadata.scenario: ${doc.metadata.scenario}`);
      console.log(`  metadata.report_snippet 有值: ${!!doc.metadata.report_snippet}`);
    });

    console.log('\n✓ 数据验证通过，LangChain 可正常读取');
  } catch (error) {
    console.error('\n错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

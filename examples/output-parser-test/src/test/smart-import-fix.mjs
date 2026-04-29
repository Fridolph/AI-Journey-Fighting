import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import mysql from 'mysql2/promise';

const providerBaseUrl = process.env.OPENAI_BASE_URL?.toLowerCase() ?? '';
const modelName = process.env.MODEL_NAME?.toLowerCase() ?? '';

// 初始化模型
const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// 定义单个好友信息的 zod schema，匹配 friends 表结构
const friendSchema = z.object({
  name: z.string().describe('姓名'),
  gender: z.string().describe('性别（男/女）'),
  birth_date: z.string().describe('出生日期，格式：YYYY-MM-DD，如果无法确定具体日期，根据年龄估算'),
  company: z.string().nullable().describe('公司名称，如果没有则返回 null'),
  title: z.string().nullable().describe('职位/头衔，如果没有则返回 null'),
  phone: z.string().nullable().describe('手机号，如果没有则返回 null'),
  wechat: z.string().nullable().describe('微信号，如果没有则返回 null'),
});

// 定义批量好友信息的 schema（数组）
const friendsArraySchema = z.array(friendSchema).describe('好友信息数组');

// 不同 OpenAI 兼容供应商对结构化输出支持不完全一致。
// 这次你实际配的是 DeepSeek 兼容接口，它通常不支持
// response_format: { type: "json_schema" }，直接调用会报：
// "This response_format type is unavailable now"
//
// 所以这里根据当前 provider / model 做一个学习版兼容策略：
// - DeepSeek 兼容端点 / reasoner 类模型：走 jsonMode
// - 其他情况：优先走 functionCalling
const structuredMethod =
  providerBaseUrl.includes('deepseek.com') || modelName.includes('reasoner')
    ? 'jsonMode'
    : 'functionCalling';

const structuredModel = model.withStructuredOutput(friendsArraySchema, {
  method: structuredMethod,
});

// 数据库连接配置
const connectionConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  multipleStatements: true,
};

const databaseName = process.env.MYSQL_DATABASE || 'hello';

function extractTextContent(response) {
  if (typeof response?.content === 'string') {
    return response.content;
  }

  if (Array.isArray(response?.content)) {
    return response.content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item?.text === 'string') return item.text;
        return '';
      })
      .join('');
  }

  return '';
}

function normalizeFriendRecord(record) {
  // DeepSeek 在 jsonMode 下这次真实返回的是中文键名：
  // 姓名 / 性别 / 出生日期 / 公司 / 职位 / 手机号 / 微信号
  //
  // 但我们数据库层和 Zod schema 用的是英文键名：
  // name / gender / birth_date / company / title / phone / wechat
  //
  // 所以这里做一层“字段归一化”：
  // - 如果模型已经返回英文键名，直接沿用
  // - 如果模型返回中文键名，就映射为英文键名
  // 这样脚本既兼容 functionCalling，也兼容 jsonMode。
  return {
    name: record?.name ?? record?.姓名 ?? null,
    gender: record?.gender ?? record?.性别 ?? null,
    birth_date: record?.birth_date ?? record?.出生日期 ?? null,
    company: record?.company ?? record?.公司 ?? null,
    title: record?.title ?? record?.职位 ?? null,
    phone: record?.phone ?? record?.手机号 ?? null,
    wechat: record?.wechat ?? record?.微信号 ?? null,
  };
}

function normalizeContactValue(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeFriendContacts(record) {
  return {
    ...record,
    phone: normalizeContactValue(record.phone),
    wechat: normalizeContactValue(record.wechat),
  };
}

function parseFriendsFromJsonText(text) {
  const trimmed = String(text || '').trim();

  if (!trimmed) {
    throw new Error('模型没有返回可解析的 JSON 内容');
  }

  const startIndex = trimmed.indexOf('[');
  const endIndex = trimmed.lastIndexOf(']');

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`未在模型输出中找到合法 JSON 数组: ${trimmed}`);
  }

  const jsonText = trimmed.slice(startIndex, endIndex + 1);
  const parsed = JSON.parse(jsonText);

  if (!Array.isArray(parsed)) {
    throw new Error('模型返回的 JSON 不是数组');
  }

  return parsed.map(normalizeFriendRecord);
}

function dedupeBatchFriends(records) {
  // 第一层去重：同一次文本抽取结果内部去重。
  // 典型场景：
  // - 文本里重复提到了同一个人
  // - 模型不稳定，返回了两条联系方式完全相同的记录
  //
  // 规则：
  // - 只要 phone 重复，就认为是同一个联系人
  // - 只要 wechat 重复，也认为是同一个联系人
  // - 两者都没有时，不主动去重，避免误伤同名不同人
  const seenPhones = new Set();
  const seenWechats = new Set();
  const kept = [];
  const skipped = [];

  for (const record of records.map(normalizeFriendContacts)) {
    const duplicateReasons = [];

    if (record.phone && seenPhones.has(record.phone)) {
      duplicateReasons.push(`phone 重复: ${record.phone}`);
    }

    if (record.wechat && seenWechats.has(record.wechat)) {
      duplicateReasons.push(`wechat 重复: ${record.wechat}`);
    }

    if (duplicateReasons.length > 0) {
      skipped.push({
        record,
        reason: `结果内重复，已跳过（${duplicateReasons.join('，')}）`,
      });
      continue;
    }

    if (record.phone) {
      seenPhones.add(record.phone);
    }

    if (record.wechat) {
      seenWechats.add(record.wechat);
    }

    kept.push(record);
  }

  return { kept, skipped };
}

async function loadExistingContacts(connection, records) {
  // 第二层去重：和数据库已有记录对比。
  // 这里不直接逐条查库，而是先把 phone / wechat 批量收集起来，一次性查询。
  const phones = [...new Set(records.map((item) => item.phone).filter(Boolean))];
  const wechats = [...new Set(records.map((item) => item.wechat).filter(Boolean))];
  const conditions = [];
  const params = [];

  if (phones.length > 0) {
    conditions.push(`phone IN (${phones.map(() => '?').join(', ')})`);
    params.push(...phones);
  }

  if (wechats.length > 0) {
    conditions.push(`wechat IN (${wechats.map(() => '?').join(', ')})`);
    params.push(...wechats);
  }

  if (conditions.length === 0) {
    return {
      existingPhones: new Set(),
      existingWechats: new Set(),
    };
  }

  const sql = `
    SELECT phone, wechat
    FROM friends
    WHERE ${conditions.join(' OR ')};
  `;
  const [rows] = await connection.execute(sql, params);

  return {
    existingPhones: new Set(rows.map((row) => normalizeContactValue(row.phone)).filter(Boolean)),
    existingWechats: new Set(rows.map((row) => normalizeContactValue(row.wechat)).filter(Boolean)),
  };
}

async function filterExistingFriends(connection, records) {
  const { existingPhones, existingWechats } = await loadExistingContacts(connection, records);
  const kept = [];
  const skipped = [];

  for (const record of records) {
    const duplicateReasons = [];

    if (record.phone && existingPhones.has(record.phone)) {
      duplicateReasons.push(`数据库已存在相同 phone: ${record.phone}`);
    }

    if (record.wechat && existingWechats.has(record.wechat)) {
      duplicateReasons.push(`数据库已存在相同 wechat: ${record.wechat}`);
    }

    if (duplicateReasons.length > 0) {
      skipped.push({
        record,
        reason: `数据库重复，已跳过（${duplicateReasons.join('，')}）`,
      });
      continue;
    }

    kept.push(record);
  }

  return { kept, skipped };
}

function printSkippedRecords(title, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  console.log(`${title}:`);

  items.forEach((item, index) => {
    console.log(
      `${index + 1}. ${item.record.name || '未命名'} | phone=${item.record.phone ?? '-'} | wechat=${item.record.wechat ?? '-'}`
    );
    console.log(`   ${item.reason}`);
  });

  console.log('');
}

async function extractStructuredFriends(prompt) {
  // functionCalling 下，LangChain 能直接帮我们完成 schema 约束和解析。
  if (structuredMethod === 'functionCalling') {
    return structuredModel.invoke(prompt);
  }

  // jsonMode 下，兼容接口往往只能保证“返回 JSON”，
  // 但不一定严格保证字段名和 schema 一致。
  // 所以这里改成：
  // 1. 直接拿原始文本
  // 2. 手动解析 JSON 数组
  // 3. 把中文键名映射为英文键名
  // 4. 再用 Zod 做最终校验
  const response = await model.invoke(prompt);
  const rawText = extractTextContent(response);

  console.log('📦 原始 JSON 输出:');
  console.log(rawText);
  console.log('');

  const normalizedResults = parseFriendsFromJsonText(rawText);
  return friendsArraySchema.parse(normalizedResults);
}

async function extractAndInsert(text) {
  const connection = await mysql.createConnection(connectionConfig);

  try {
    // 切换到目标数据库。
    // 这里仍保留学习版 demo 的默认值 hello，但优先读取 .env。
    await connection.query(`USE \`${databaseName}\`;`);

    // 使用 AI 提取结构化信息
    console.log('🤔 正在从文本中提取信息...\n');
    console.log(`🧩 结构化输出模式: ${structuredMethod}\n`);
    const prompt = `请从以下文本中提取所有好友信息，文本中可能包含一个或多个人的信息。请将每个人的信息分别提取出来，返回一个数组。

${text}

要求：
1. 如果文本中包含多个人，请为每个人创建一个对象
2. 每个对象必须使用以下英文字段名：
   - name：提取文本中的人名
   - gender：提取性别信息（男/女）
   - birth_date：如果能找到具体日期最好，否则根据年龄描述估算（格式：YYYY-MM-DD）
   - company：提取公司名称
   - title：提取职位/头衔信息
   - phone：提取手机号码
   - wechat：提取微信号
3. 如果某个字段在文本中找不到，请返回 null
4. 返回格式必须是一个数组，即使只有一个人也要放在数组中
5. birth_date 必须输出 YYYY-MM-DD 字符串，例如 1995-01-01
6. 只返回结果，不要补充解释说明
7. 不要使用中文字段名，比如“姓名、性别、公司”
8. ${structuredMethod === 'jsonMode' ? '请严格返回 JSON 数组，并确保字段名是 name、gender、birth_date、company、title、phone、wechat。' : '按要求返回结构化结果。'}`;

    const results = await extractStructuredFriends(prompt);

    console.log(`✅ 提取到 ${results.length} 条结构化信息:`);
    console.log(JSON.stringify(results, null, 2));
    console.log('');

    if (results.length === 0) {
      console.log('⚠️  没有提取到任何信息');
      return { count: 0, insertIds: [] };
    }

    const {
      kept: uniqueBatchResults,
      skipped: batchDuplicateResults,
    } = dedupeBatchFriends(results);

    printSkippedRecords('⚠️  结果内重复记录', batchDuplicateResults);

    const {
      kept: insertableResults,
      skipped: dbDuplicateResults,
    } = await filterExistingFriends(connection, uniqueBatchResults);

    printSkippedRecords('⚠️  数据库重复记录', dbDuplicateResults);

    if (insertableResults.length === 0) {
      console.log('⚠️  去重后没有需要新插入的数据');
      return { count: 0, insertIds: [] };
    }

    // 批量插入数据库
    const insertSql = `
      INSERT INTO friends (
        name,
        gender,
        birth_date,
        company,
        title,
        phone,
        wechat
      ) VALUES ?;
    `;

    const values = insertableResults.map((result) => [
      result.name,
      result.gender,
      result.birth_date || null,
      result.company,
      result.title,
      result.phone,
      result.wechat,
    ]);

    const [insertResult] = await connection.query(insertSql, [values]);
    console.log(`✅ 成功批量插入 ${insertResult.affectedRows} 条数据`);
    console.log(`   插入的ID范围：${insertResult.insertId} - ${insertResult.insertId + insertResult.affectedRows - 1}`);

    return {
      count: insertResult.affectedRows,
      insertIds: Array.from({ length: insertResult.affectedRows }, (_, i) => insertResult.insertId + i),
    };
  } catch (err) {
    console.error('❌ 执行出错：', err);
    throw err;
  } finally {
    await connection.end();
  }
}

// 主函数
async function main() {
  // 示例文本（包含多个人的信息）
  const sampleText = `我最近认识了几个新朋友。第一个是张总，女的，看起来30出头，在腾讯做技术总监，手机13800138000，微信是zhangzong2024。第二个是李工，男，大概28岁，在阿里云做架构师，电话15900159000，微信号lee_arch。还有一个是陈经理，女，35岁左右，在美团做产品经理，手机号是18800188000，微信chenpm2024。`;

  console.log('📝 输入文本:');
  console.log(sampleText);
  console.log('');

  try {
    const result = await extractAndInsert(sampleText);
    console.log(`\n🎉 处理完成！成功插入 ${result.count} 条记录`);
    console.log(`   插入的ID：${result.insertIds.join(', ')}`);
  } catch (error) {
    console.error('❌ 处理失败：', error.message);
    process.exit(1);
  }
}

main();

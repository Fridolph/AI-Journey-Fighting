import 'dotenv/config';
import mysql from 'mysql2/promise';

/**
 * 把连接配置放进 .env 更合适，原因有两个：
 * 1. 密码、地址这类环境信息不应该硬编码进学习脚本里
 * 2. 后面你切换本机 / Docker / 远程数据库时，只改 .env 即可
 *
 * 这里仍然给了 localhost / 3306 / root 作为默认值，
 * 这样学习时就算漏配了某个字段，也更容易先跑起来。
 */
function getConnectionConfig() {
  return {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    // 允许空密码，所以这里不能用 ||，要保留空字符串
    password: process.env.MYSQL_PASSWORD ?? '',
    multipleStatements: true,
  };
}

async function main() {
  const connectionConfig = getConnectionConfig();

  console.log('准备连接 MySQL...');
  console.log({
    host: connectionConfig.host,
    port: connectionConfig.port,
    user: connectionConfig.user,
    // 避免把真实密码打印出来，只展示是否已配置
    hasPassword: connectionConfig.password !== '',
  });

  const connection = await mysql.createConnection(connectionConfig);

  try {
    // 1. 先创建数据库。IF NOT EXISTS 的好处是重复执行也不会报错。
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS hello CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    );

    // 2. 切换到 hello 数据库，后续建表和插入都在这个库里执行。
    await connection.query(`USE hello;`);

    // 3. 创建 friends 表，结构和后面 smart-import 要提取的字段保持一致。
    await connection.query(`
      CREATE TABLE IF NOT EXISTS friends (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        gender VARCHAR(10),                -- 性别
        birth_date DATE,                   -- 出生日期
        company VARCHAR(100),              -- 公司
        title VARCHAR(100),                -- 职位
        phone VARCHAR(20),                 -- 当前手机号
        wechat VARCHAR(50)                 -- 微信号
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 4. 插入一条 demo 数据，确认数据库、表、写入链路都正常。
    const insertSql = `
      INSERT INTO friends (
        name,
        gender,
        birth_date,
        company,
        title,
        phone,
        wechat
      ) VALUES (?, ?, ?, ?, ?, ?, ?);
    `;

    const values = [
      '王经理',
      '男',
      '1990-01-01',
      '字节跳动',
      '产品经理/产品总监',
      '18612345678',
      'wangjingli2024',
    ];

    const [result] = await connection.execute(insertSql, values);

    console.log('成功创建数据库和表，并插入 demo 数据。');
    console.log('插入 ID：', result.insertId);
  } catch (err) {
    console.error('执行出错：', err);
    throw err;
  } finally {
    await connection.end();
    console.log('MySQL 连接已关闭。');
  }
}

main().catch((err) => {
  console.error('脚本运行失败：', err.message);
  process.exit(1);
});

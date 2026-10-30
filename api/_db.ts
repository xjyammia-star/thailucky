// 这个文件是"数据库连接工具"，所有接口文件都会用到它。
// DATABASE_URL 这个值，等你在Vercel里创建好Neon数据库之后，
// Vercel会自动帮你设置好，不需要你手动填写密码等信息。

import { neon } from '@neondatabase/serverless';

export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('数据库连接字符串未配置（DATABASE_URL）');
  }
  return neon(connectionString);
}

// 数据库建表工具。
// 所有表都用 "CREATE TABLE IF NOT EXISTS"，意思是"没有才建，有了就跳过"，
// 所以可以放心重复运行，不会覆盖或删除已有数据。
// 以后每一步开发如果需要新的表，我会在这里追加，
// 你只需要在【管理】页点一下"更新数据库结构"即可，不需要手动执行任何SQL。

import type { getDb } from './_db.js';

type Sql = ReturnType<typeof getDb>;

export async function initTables(sql: Sql) {
  // 用户表：登录账号
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // 个人设置表：每个人一行，存生辰信息等
  await sql`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      birth_date DATE,
      birth_hour SMALLINT,
      birth_minute SMALLINT,
      birth_city TEXT,
      birth_longitude NUMERIC(6,2),
      manual_elements TEXT,
      lucky_number SMALLINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

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

  // 开奖结果表：每期一行。多个号码用英文逗号隔开（例如 "692,885"）。
  // 二到五等奖只有在号码数量完整时才保存，数量不对宁可留空，避免对奖出错。
  await sql`
    CREATE TABLE IF NOT EXISTS draws (
      draw_date DATE PRIMARY KEY,
      first_prize TEXT NOT NULL,
      near_first TEXT NOT NULL,
      front3 TEXT NOT NULL,
      back3 TEXT NOT NULL,
      back2 TEXT NOT NULL,
      prize2 TEXT,
      prize3 TEXT,
      prize4 TEXT,
      prize5 TEXT,
      source TEXT NOT NULL DEFAULT 'import',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // 通用小记录表：目前用来记"上次自动同步开奖数据的时间"，防止频繁请求外部接口
  await sql`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

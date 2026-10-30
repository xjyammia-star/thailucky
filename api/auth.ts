// 登录相关接口（合并在一个文件里，用 ?action= 区分，节省Vercel免费版的函数数量）
//
// GET  /api/auth?action=me              查询当前登录状态（也会告诉前端是否需要"首次设置"）
// POST /api/auth?action=setup           首次设置：创建管理员账号并建表（只能做一次）
// POST /api/auth?action=login           登录
// POST /api/auth?action=logout          退出登录
// POST /api/auth?action=change_password 修改自己的密码
// POST /api/auth?action=init_db         （仅管理员）更新数据库结构，以后每次加了新表就点一下

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { getDb } from './_db.js';
import { initTables } from './_schema.js';
import {
  clearSessionCookie,
  createSessionCookie,
  getCurrentUser,
  hashPassword,
  normalizeUsername,
  requireAdmin,
  requireUser,
  validatePassword,
  verifyPassword,
} from './_auth.js';

type Sql = ReturnType<typeof getDb>;

function fail(res: VercelResponse, status: number, error: string) {
  return res.status(status).json({ success: false, error });
}

// 数据库里有几个用户；表还不存在时算0个
async function countUsers(sql: Sql): Promise<number> {
  try {
    const rows = await sql`SELECT COUNT(*)::int AS n FROM users`;
    return rows[0].n as number;
  } catch (err) {
    if ((err as { code?: string }).code === '42P01') return 0;
    throw err;
  }
}

// 一个固定的假密码哈希：用户名不存在时也做一次比对，让"用户名错"和"密码错"耗时一样
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.3gGmLw5hVq1y1m4g2h3v7Yq0uQxy';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  try {
    if (!process.env.DATABASE_URL) {
      return fail(res, 503, '还没有连接数据库：请在 Vercel 项目的 Storage 里创建并连接 Neon 数据库');
    }
    const sql = getDb();

    // ---------- 查询登录状态 ----------
    if (req.method === 'GET' && action === 'me') {
      const user = await getCurrentUser(req);
      if (user) {
        return res.status(200).json({ success: true, user, needsSetup: false });
      }
      const needsSetup = (await countUsers(sql)) === 0;
      const result: Record<string, unknown> = { success: true, user: null, needsSetup };
      if (needsSetup) {
        // 首次设置界面需要知道还缺哪些环境变量，方便提示（只返回变量名，不返回值）
        const missing: string[] = [];
        if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) missing.push('SESSION_SECRET');
        if (!process.env.SETUP_CODE) missing.push('SETUP_CODE');
        result.missing = missing;
      }
      return res.status(200).json(result);
    }

    // ---------- 首次设置 ----------
    if (req.method === 'POST' && action === 'setup') {
      const { setupCode, username, password, displayName } = req.body ?? {};

      const expectedCode = process.env.SETUP_CODE;
      if (!expectedCode) return fail(res, 400, '服务器还没有设置 SETUP_CODE 环境变量');
      const a = Buffer.from(String(setupCode ?? ''));
      const b = Buffer.from(expectedCode);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return fail(res, 403, '设置口令不对');
      }

      if ((await countUsers(sql)) > 0) return fail(res, 400, '已经完成过首次设置，请直接登录');

      const uname = normalizeUsername(username);
      if (!uname) return fail(res, 400, '用户名需要2到30个字符，不能有空格');
      const pwErr = validatePassword(password);
      if (pwErr) return fail(res, 400, pwErr);
      const dname = String(displayName ?? '').trim() || uname;

      await initTables(sql);
      const hash = await hashPassword(password);
      const rows = await sql`
        INSERT INTO users (username, password_hash, display_name, is_admin)
        VALUES (${uname}, ${hash}, ${dname}, true)
        RETURNING id
      `;
      res.setHeader('Set-Cookie', createSessionCookie(rows[0].id as number));
      return res.status(200).json({ success: true });
    }

    // ---------- 登录 ----------
    if (req.method === 'POST' && action === 'login') {
      const { username, password } = req.body ?? {};
      const uname = normalizeUsername(username);
      const rows = uname
        ? await sql`SELECT id, password_hash FROM users WHERE username = ${uname}`
        : [];
      const pw = typeof password === 'string' ? password : '';

      if (rows.length === 0) {
        await verifyPassword(pw, DUMMY_HASH).catch(() => false);
        return fail(res, 401, '用户名或密码不对');
      }
      const ok = await verifyPassword(pw, rows[0].password_hash as string);
      if (!ok) return fail(res, 401, '用户名或密码不对');

      res.setHeader('Set-Cookie', createSessionCookie(rows[0].id as number));
      return res.status(200).json({ success: true });
    }

    // ---------- 退出登录 ----------
    if (req.method === 'POST' && action === 'logout') {
      res.setHeader('Set-Cookie', clearSessionCookie());
      return res.status(200).json({ success: true });
    }

    // ---------- 修改自己的密码 ----------
    if (req.method === 'POST' && action === 'change_password') {
      const user = await requireUser(req, res);
      if (!user) return;
      const { oldPassword, newPassword } = req.body ?? {};
      const pwErr = validatePassword(newPassword);
      if (pwErr) return fail(res, 400, pwErr);

      const rows = await sql`SELECT password_hash FROM users WHERE id = ${user.id}`;
      const ok = await verifyPassword(String(oldPassword ?? ''), rows[0].password_hash as string);
      if (!ok) return fail(res, 400, '原密码不对');

      const hash = await hashPassword(newPassword);
      await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${user.id}`;
      return res.status(200).json({ success: true });
    }

    // ---------- 更新数据库结构（仅管理员） ----------
    if (req.method === 'POST' && action === 'init_db') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      await initTables(sql);
      return res.status(200).json({ success: true });
    }

    return fail(res, 400, '未知操作');
  } catch (err) {
    console.error('auth error:', err);
    return fail(res, 500, err instanceof Error ? err.message : '服务器出错了');
  }
}

// 账号管理接口（仅管理员可用）
//
// GET  /api/users?action=list            账号列表
// POST /api/users?action=create          新建账号  body: { username, password, displayName, isAdmin }
// POST /api/users?action=reset_password  重置某人密码  body: { userId, newPassword }
// POST /api/users?action=delete          删除账号（连同该账号所有数据）  body: { userId }
//
// 注意：管理员只能管理账号本身，看不到别人的生辰八字和选号记录。

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_db.js';
import { hashPassword, normalizeUsername, requireAdmin, validatePassword } from './_auth.js';

function fail(res: VercelResponse, status: number, error: string) {
  return res.status(status).json({ success: false, error });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const sql = getDb();

    if (req.method === 'GET' && action === 'list') {
      const rows = await sql`
        SELECT id, username, display_name, is_admin, created_at FROM users ORDER BY id
      `;
      return res.status(200).json({
        success: true,
        users: rows.map((r) => ({
          id: r.id,
          username: r.username,
          displayName: r.display_name,
          isAdmin: r.is_admin,
          createdAt: r.created_at,
        })),
      });
    }

    if (req.method === 'POST' && action === 'create') {
      const { username, password, displayName, isAdmin } = req.body ?? {};
      const uname = normalizeUsername(username);
      if (!uname) return fail(res, 400, '用户名需要2到30个字符，不能有空格');
      const pwErr = validatePassword(password);
      if (pwErr) return fail(res, 400, pwErr);
      const dname = String(displayName ?? '').trim() || uname;

      const exists = await sql`SELECT 1 FROM users WHERE username = ${uname}`;
      if (exists.length > 0) return fail(res, 400, '这个用户名已经有人用了');

      const hash = await hashPassword(password);
      await sql`
        INSERT INTO users (username, password_hash, display_name, is_admin)
        VALUES (${uname}, ${hash}, ${dname}, ${isAdmin === true})
      `;
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST' && action === 'reset_password') {
      const { userId, newPassword } = req.body ?? {};
      const pwErr = validatePassword(newPassword);
      if (pwErr) return fail(res, 400, pwErr);
      const hash = await hashPassword(newPassword);
      const rows = await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${Number(userId)} RETURNING id`;
      if (rows.length === 0) return fail(res, 404, '找不到这个账号');
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST' && action === 'delete') {
      const userId = Number(req.body?.userId);
      if (!Number.isInteger(userId)) return fail(res, 400, '参数不对');
      if (userId === admin.id) return fail(res, 400, '不能删除自己的账号');

      const target = await sql`SELECT is_admin FROM users WHERE id = ${userId}`;
      if (target.length === 0) return fail(res, 404, '找不到这个账号');
      if (target[0].is_admin) {
        const admins = await sql`SELECT COUNT(*)::int AS n FROM users WHERE is_admin = true`;
        if ((admins[0].n as number) <= 1) return fail(res, 400, '至少要保留一个管理员');
      }
      await sql`DELETE FROM users WHERE id = ${userId}`;
      return res.status(200).json({ success: true });
    }

    return fail(res, 400, '未知操作');
  } catch (err) {
    console.error('users error:', err);
    return fail(res, 500, err instanceof Error ? err.message : '服务器出错了');
  }
}

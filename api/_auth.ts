// 登录相关的内部工具（不是接口）。
// 登录原理：登录成功后，服务器给浏览器一个"加了防伪签名的通行证"（Cookie），
// 之后每次请求浏览器都会带上它，服务器验证签名对不对、有没有过期，就知道你是谁。
// 签名用的密钥来自环境变量 SESSION_SECRET，别人没有它就伪造不出通行证。

import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb } from './_db.js';

const COOKIE_NAME = 'tl_session';
const SESSION_DAYS = 30;

export interface CurrentUser {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
}

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error('服务器还没有设置 SESSION_SECRET（至少16个字符）');
  }
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

// ---------- 密码 ----------

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

// 返回 null 表示密码合格，否则返回不合格的原因
export function validatePassword(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 6) return '密码至少需要6位';
  if (pw.length > 100) return '密码太长了';
  return null;
}

// 用户名统一转成小写、去掉首尾空格；不合格返回 null
export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const u = raw.trim().toLowerCase();
  if (u.length < 2 || u.length > 30) return null;
  if (/\s/.test(u)) return null;
  return u;
}

// ---------- 通行证（Cookie） ----------

export function createSessionCookie(userId: number): string {
  const expires = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  const payload = `${userId}.${expires}`;
  const token = `${payload}.${sign(payload)}`;
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 24 * 3600}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function readCookie(req: VercelRequest, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

// 读取当前登录的用户；没登录、通行证无效或过期，返回 null
export async function getCurrentUser(req: VercelRequest): Promise<CurrentUser | null> {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [idStr, expStr, sig] = parts;
  const expected = sign(`${idStr}.${expStr}`);

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(expStr) < Date.now()) return null;

  const userId = Number(idStr);
  if (!Number.isInteger(userId)) return null;

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, username, display_name, is_admin FROM users WHERE id = ${userId}
    `;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id as number,
      username: r.username as string,
      displayName: r.display_name as string,
      isAdmin: r.is_admin as boolean,
    };
  } catch (err) {
    // 42P01 = 表还不存在（还没做过首次设置），当作"没登录"处理
    if ((err as { code?: string }).code === '42P01') return null;
    throw err;
  }
}

// 要求必须登录；没登录时直接回复401并返回null，调用方遇到null就直接return
export async function requireUser(req: VercelRequest, res: VercelResponse): Promise<CurrentUser | null> {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ success: false, error: '请先登录' });
    return null;
  }
  return user;
}

// 要求必须是管理员
export async function requireAdmin(req: VercelRequest, res: VercelResponse): Promise<CurrentUser | null> {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!user.isAdmin) {
    res.status(403).json({ success: false, error: '只有管理员可以进行此操作' });
    return null;
  }
  return user;
}

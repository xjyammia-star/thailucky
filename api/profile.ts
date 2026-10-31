// 个人设置接口：每个人只能读写自己的资料（管理员也看不到别人的）
//
// GET  /api/profile?action=get   读取自己的设置
// POST /api/profile?action=save  保存自己的设置
//      body: { displayName, birthDate, birthHour, birthMinute, birthCity,
//              birthLongitude, birthTz(自己填城市时), manualElements, luckyNumber }
//      不想填的项传 null 即可

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_db.js';
import { requireUser } from './_auth.js';

const ELEMENTS = ['金', '木', '水', '火', '土'];

function fail(res: VercelResponse, status: number, error: string) {
  return res.status(status).json({ success: false, error });
}

// 把"可能为空"的数字输入整理成 number 或 null；不合法时抛出错误
function optInt(v: unknown, min: number, max: number, label: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label}需要是 ${min} 到 ${max} 之间的整数`);
  return n;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const sql = getDb();

    if (req.method === 'GET' && action === 'get') {
      const rows = await sql`
        SELECT birth_date::text AS birth_date, birth_hour, birth_minute, birth_city,
               birth_longitude::float AS birth_longitude, manual_elements, lucky_number
        FROM profiles WHERE user_id = ${user.id}
      `;
      const r = rows[0];
      return res.status(200).json({
        success: true,
        profile: {
          displayName: user.displayName,
          birthDate: r?.birth_date ?? null,
          birthHour: r?.birth_hour ?? null,
          birthMinute: r?.birth_minute ?? null,
          birthCity: r?.birth_city ? String(r.birth_city).replace(/\|-?\d{1,2}$/, '') : null,
          birthTz: r?.birth_city && /\|-?\d{1,2}$/.test(String(r.birth_city)) ? Number(String(r.birth_city).split('|').pop()) : null,
          birthLongitude: r?.birth_longitude ?? null,
          manualElements: r?.manual_elements ? String(r.manual_elements).split(',').filter(Boolean) : [],
          luckyNumber: r?.lucky_number ?? null,
        },
      });
    }

    if (req.method === 'POST' && action === 'save') {
      const b = req.body ?? {};

      const displayName = String(b.displayName ?? '').trim();
      if (!displayName || displayName.length > 30) return fail(res, 400, '显示名称需要1到30个字符');

      let birthDate: string | null = null;
      if (b.birthDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.birthDate))) return fail(res, 400, '出生日期格式不对');
        const d = new Date(`${b.birthDate}T00:00:00Z`);
        const year = d.getUTCFullYear();
        if (Number.isNaN(d.getTime()) || year < 1900 || d.getTime() > Date.now()) {
          return fail(res, 400, '出生日期不合理');
        }
        birthDate = String(b.birthDate);
      }

      const birthHour = optInt(b.birthHour, 0, 23, '出生小时');
      const birthMinute = optInt(b.birthMinute, 0, 59, '出生分钟');
      const luckyNumber = optInt(b.luckyNumber, 0, 99, '幸运数字');

      let birthLongitude: number | null = null;
      if (b.birthLongitude !== null && b.birthLongitude !== undefined && b.birthLongitude !== '') {
        birthLongitude = Number(b.birthLongitude);
        if (Number.isNaN(birthLongitude) || birthLongitude < -180 || birthLongitude > 180) {
          return fail(res, 400, '经度需要在 -180 到 180 之间');
        }
      }

      let birthCity = b.birthCity ? String(b.birthCity).trim().replace(/\|/g, '').slice(0, 40) : null;
      if (birthCity && b.birthTz !== null && b.birthTz !== undefined && b.birthTz !== '') {
        const tz = Number(b.birthTz);
        if (!Number.isInteger(tz) || tz < -12 || tz > 14) return fail(res, 400, '时区不对');
        birthCity = `${birthCity}|${tz}`;
      }

      const els: string[] = Array.isArray(b.manualElements) ? b.manualElements : [];
      if (!els.every((e) => ELEMENTS.includes(e))) return fail(res, 400, '五行只能是 金木水火土');
      const manualElements = els.length > 0 ? Array.from(new Set(els)).join(',') : null;

      await sql`UPDATE users SET display_name = ${displayName} WHERE id = ${user.id}`;
      await sql`
        INSERT INTO profiles (user_id, birth_date, birth_hour, birth_minute, birth_city,
                              birth_longitude, manual_elements, lucky_number, updated_at)
        VALUES (${user.id}, ${birthDate}, ${birthHour}, ${birthMinute}, ${birthCity},
                ${birthLongitude}, ${manualElements}, ${luckyNumber}, now())
        ON CONFLICT (user_id) DO UPDATE SET
          birth_date = EXCLUDED.birth_date,
          birth_hour = EXCLUDED.birth_hour,
          birth_minute = EXCLUDED.birth_minute,
          birth_city = EXCLUDED.birth_city,
          birth_longitude = EXCLUDED.birth_longitude,
          manual_elements = EXCLUDED.manual_elements,
          lucky_number = EXCLUDED.lucky_number,
          updated_at = now()
      `;
      return res.status(200).json({ success: true });
    }

    return fail(res, 400, '未知操作');
  } catch (err) {
    console.error('profile error:', err);
    // 上面 optInt 抛出的是"用户输入不合法"，返回400；其他当作服务器错误
    const msg = err instanceof Error ? err.message : '服务器出错了';
    const isInput = /需要是 \d+ 到 \d+ 之间的整数/.test(msg);
    return fail(res, isInput ? 400 : 500, msg);
  }
}

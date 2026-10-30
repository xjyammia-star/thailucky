// 选号接口：每个人只能看到、操作自己的号码
//
// GET  /api/numbers?action=bazi           读取自己的八字五行分析
// POST /api/numbers?action=generate       生成一批并保存
//      body: { method: 'random'|'lucky', count, targetDraw, luckyNumber? }
// GET  /api/numbers?action=list           自己的所有批次（新的在前）
// POST /api/numbers?action=mark           标记某个号码"实际购买/取消购买"  body: { pickId, bought }
// POST /api/numbers?action=mark_batch     整批标记  body: { batchId, bought }
// POST /api/numbers?action=delete_batch   删除整批（连同号码）  body: { batchId }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_db.js';
import { requireUser } from './_auth.js';
import { computeBazi } from './_bazi.js';
import type { BaziResult } from './_bazi.js';
import { digitPool, genBatch, genLucky, genRandom } from './_gen.js';

function fail(res: VercelResponse, status: number, error: string) {
  return res.status(status).json({ success: false, error });
}

type Sql = ReturnType<typeof getDb>;

async function loadBazi(sql: Sql, userId: number): Promise<BaziResult | null> {
  const rows = await sql`
    SELECT birth_date::text AS birth_date, birth_hour, birth_minute, birth_city,
           birth_longitude::float AS birth_longitude, manual_elements
    FROM profiles WHERE user_id = ${userId}
  `;
  const r = rows[0];
  if (!r || !r.birth_date) return null;
  return computeBazi({
    birthDate: r.birth_date,
    birthHour: r.birth_hour,
    birthMinute: r.birth_minute,
    birthCity: r.birth_city,
    birthLongitude: r.birth_longitude,
    manualElements: r.manual_elements ? String(r.manual_elements).split(',').filter(Boolean) : [],
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const sql = getDb();

    if (req.method === 'GET' && action === 'bazi') {
      const bazi = await loadBazi(sql, user.id);
      return res.status(200).json({ success: true, bazi });
    }

    if (req.method === 'POST' && action === 'generate') {
      const b = req.body ?? {};
      const method = String(b.method ?? '');
      if (method !== 'random' && method !== 'lucky') return fail(res, 400, '选号方式不对');
      const count = Number(b.count);
      if (!Number.isInteger(count) || count < 1 || count > 20) return fail(res, 400, '一次生成 1 到 20 个号码');
      const targetDraw = String(b.targetDraw ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDraw)) return fail(res, 400, '开奖日期格式不对');

      const bazi = await loadBazi(sql, user.id);
      const pool = bazi ? digitPool(bazi.favorable) : [];

      let numbers: string[];
      let params: Record<string, unknown>;
      if (method === 'random') {
        numbers = genBatch(count, genRandom);
        params = {};
      } else {
        let lucky = b.luckyNumber;
        if (lucky === null || lucky === undefined || lucky === '') {
          const p = await sql`SELECT lucky_number FROM profiles WHERE user_id = ${user.id}`;
          lucky = p[0]?.lucky_number ?? null;
        }
        const n = Number(lucky);
        if (lucky === null || !Number.isInteger(n) || n < 0 || n > 99) {
          return fail(res, 400, '请先指定一个 0 到 99 的数字（可在设置里保存为幸运数字）');
        }
        numbers = genBatch(count, () => genLucky(n, pool));
        params = { lucky: n, favorable: bazi?.favorable ?? [], usedBazi: pool.length > 0 };
      }

      const batch = await sql`
        INSERT INTO batches (user_id, method, target_draw, params)
        VALUES (${user.id}, ${method}, ${targetDraw}, ${JSON.stringify(params)})
        RETURNING id
      `;
      const batchId = Number(batch[0].id);
      for (const num of numbers) {
        await sql`INSERT INTO picks (batch_id, user_id, number) VALUES (${batchId}, ${user.id}, ${num})`;
      }
      return res.status(200).json({ success: true, batchId });
    }

    if (req.method === 'GET' && action === 'list') {
      const batches = await sql`
        SELECT id, method, target_draw::text AS target_draw, params, created_at
        FROM batches WHERE user_id = ${user.id}
        ORDER BY created_at DESC, id DESC LIMIT 50
      `;
      const picks = await sql`
        SELECT p.id, p.batch_id, p.number, p.bought
        FROM picks p JOIN batches b ON b.id = p.batch_id
        WHERE p.user_id = ${user.id} AND b.id = ANY(${batches.map((x) => x.id)})
        ORDER BY p.id
      `;
      const out = batches.map((bt) => ({
        id: Number(bt.id),
        method: bt.method as string,
        targetDraw: bt.target_draw as string,
        params: bt.params ? JSON.parse(String(bt.params)) : {},
        createdAt: new Date(bt.created_at as string).toISOString(),
        picks: picks
          .filter((p) => String(p.batch_id) === String(bt.id))
          .map((p) => ({ id: Number(p.id), number: p.number as string, bought: p.bought as boolean })),
      }));
      return res.status(200).json({ success: true, batches: out });
    }

    if (req.method === 'POST' && action === 'mark') {
      const pickId = Number(req.body?.pickId);
      if (!Number.isInteger(pickId)) return fail(res, 400, '参数不对');
      await sql`UPDATE picks SET bought = ${req.body?.bought === true} WHERE id = ${pickId} AND user_id = ${user.id}`;
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST' && action === 'mark_batch') {
      const batchId = Number(req.body?.batchId);
      if (!Number.isInteger(batchId)) return fail(res, 400, '参数不对');
      await sql`UPDATE picks SET bought = ${req.body?.bought === true} WHERE batch_id = ${batchId} AND user_id = ${user.id}`;
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST' && action === 'delete_batch') {
      const batchId = Number(req.body?.batchId);
      if (!Number.isInteger(batchId)) return fail(res, 400, '参数不对');
      await sql`DELETE FROM batches WHERE id = ${batchId} AND user_id = ${user.id}`;
      return res.status(200).json({ success: true });
    }

    return fail(res, 400, '未知操作');
  } catch (err) {
    console.error('numbers error:', err);
    const code = (err as { code?: string })?.code;
    if (code === '42P01') {
      return fail(res, 500, '数据库还没有更新：请管理员到【管理】页点一下“更新数据库结构”');
    }
    return fail(res, 500, err instanceof Error ? err.message : '服务器出错了');
  }
}

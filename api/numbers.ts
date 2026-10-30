// 选号接口：每个人只能看到、操作自己的号码
//
// GET  /api/numbers?action=bazi           读取自己的八字五行分析
// POST /api/numbers?action=generate       生成一批并保存
//      body: { method: 'random'|'lucky'|'meihua', count, targetDraw, luckyNumber?, nums?: [a,b,c] }
// POST /api/numbers?action=add_manual     手动录入自己实际买的号码（自动标记为已购买）
//      body: { numbers: string | string[], targetDraw }
// GET  /api/numbers?action=list           自己的所有批次（新的在前）
// POST /api/numbers?action=mark           标记某个号码"实际购买/取消购买"  body: { pickId, bought }
// POST /api/numbers?action=mark_batch     整批标记  body: { batchId, bought }
// POST /api/numbers?action=delete_batch   删除整批（连同号码）  body: { batchId }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_db.js';
import { requireUser } from './_auth.js';
import { computeBazi } from './_bazi.js';
import type { BaziResult } from './_bazi.js';
import { checkNumber, findDraw } from './_check.js';
import type { CheckResult } from './_check.js';
import { rowToDraw } from './_draws.js';
import { castMeihua, meihuaBatch, shichenNow } from './_meihua.js';
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
      if (method !== 'random' && method !== 'lucky' && method !== 'meihua') return fail(res, 400, '选号方式不对');
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
      } else if (method === 'meihua') {
        const arr: unknown = b.nums;
        const nums = Array.isArray(arr) ? arr.map((x) => (x === '' || x === null ? NaN : Number(x))) : [];
        if (nums.length !== 3 || !nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 9)) {
          return fail(res, 400, '请输入3个 0 到 9 的数字');
        }
        const sc = shichenNow();
        const m = castMeihua(nums as [number, number, number], sc.num, sc.name);
        numbers = meihuaBatch(m, count, bazi?.favorable ?? []);
        params = { meihua: m, clock: sc.clock, favorable: bazi?.favorable ?? [], usedBazi: pool.length > 0 };
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

    if (req.method === 'POST' && action === 'add_manual') {
      const b = req.body ?? {};
      const raw: string[] = Array.isArray(b.numbers) ? b.numbers.map(String) : String(b.numbers ?? '').split(/[\s,，;；、]+/);
      const numbers = raw.map((x) => x.trim()).filter((x) => x !== '');
      if (numbers.length === 0) return fail(res, 400, '请输入至少一个号码');
      if (numbers.length > 50) return fail(res, 400, '一次最多录入 50 个号码');
      const badNum = numbers.find((x) => !/^\d{6}$/.test(x));
      if (badNum) return fail(res, 400, `“${badNum}”不是6位数字，请检查`);
      const targetDraw = String(b.targetDraw ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDraw)) return fail(res, 400, '开奖日期格式不对');

      const batch = await sql`
        INSERT INTO batches (user_id, method, target_draw, params)
        VALUES (${user.id}, 'manual', ${targetDraw}, '{}')
        RETURNING id
      `;
      const batchId = Number(batch[0].id);
      for (const num of numbers) {
        await sql`INSERT INTO picks (batch_id, user_id, number, bought) VALUES (${batchId}, ${user.id}, ${num}, true)`;
      }
      return res.status(200).json({ success: true, batchId, count: numbers.length });
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
      const drawRows = batches.length
        ? await sql`
            SELECT draw_date::text AS draw_date, first_prize, near_first, front3, back3, back2,
                   prize2, prize3, prize4, prize5
            FROM draws WHERE draw_date >= ${batches.reduce((m, b) => (String(b.target_draw) < m ? String(b.target_draw) : m), '9999-12-31')}::date
          `
        : [];
      const draws = drawRows.map(rowToDraw);
      const bangkokToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

      const sum = {
        bought: { count: 0, checked: 0, winners: 0, total: 0 },
        all: { count: 0, checked: 0, winners: 0, total: 0 },
      };
      const out = batches.map((bt) => {
        const draw = findDraw(String(bt.target_draw), draws);
        const limit = new Date(Date.parse(`${bt.target_draw}T00:00:00Z`) + 5 * 86400000).toISOString().slice(0, 10);
        const state = draw ? 'checked' : bangkokToday > limit ? 'nodata' : 'waiting';
        const items = picks
          .filter((p) => String(p.batch_id) === String(bt.id))
          .map((p) => {
            const result: CheckResult | null = draw ? checkNumber(p.number as string, draw) : null;
            const bought = p.bought as boolean;
            for (const g of bought ? [sum.bought, sum.all] : [sum.all]) {
              g.count++;
              if (result) {
                g.checked++;
                if (result.wins.length > 0) g.winners++;
                g.total += result.total;
              }
            }
            return { id: Number(p.id), number: p.number as string, bought, result };
          });
        return {
          id: Number(bt.id),
          method: bt.method as string,
          targetDraw: bt.target_draw as string,
          drawDate: draw ? draw.date : null,
          state,
          params: bt.params ? JSON.parse(String(bt.params)) : {},
          createdAt: new Date(bt.created_at as string).toISOString(),
          picks: items,
        };
      });
      return res.status(200).json({ success: true, batches: out, summary: sum });
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

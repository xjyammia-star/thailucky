// 开奖数据接口（合并在一个文件里，用 ?action= 区分）
//
// 所有登录用户可用：
//   GET  /api/draws?action=list             开奖列表（摘要，新的在前）
//   GET  /api/draws?action=latest           最近一期（含全部奖号）
//   GET  /api/draws?action=get&date=2026-10-16   某一期的全部奖号
//   POST /api/draws?action=sync             自动获取开奖数据（10分钟内只会真正去取一次；管理员可传 force 跳过限制）
// 仅管理员：
//   GET  /api/draws?action=check_source     检测自动获取的来源是否可用
//   POST /api/draws?action=import_preview   body: { text }  预览 md 文档能识别出什么（不保存）
//   POST /api/draws?action=import           body: { text }  识别并保存 md 文档里的开奖结果
//   POST /api/draws?action=delete           body: { date }  删除某一期（导错了可以用）

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_db.js';
import { requireAdmin, requireUser } from './_auth.js';
import { finalizeDraw, rowToDraw, saveDraw } from './_draws.js';
import type { Draw, RawDraw } from './_draws.js';
import { parseDrawMarkdown } from './_parseMd.js';
import { checkSource, fetchDraw, fetchList } from './_source.js';
import type { ListItem } from './_source.js';
import { HISTORY_FROM } from './_stats.js';

type Sql = ReturnType<typeof getDb>;

const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 自动同步最短间隔：10分钟

function fail(res: VercelResponse, status: number, error: string) {
  return res.status(status).json({ success: false, error });
}

// 泰国当地"半年前"的日期（开奖页只显示最近半年）
function bangkokSixMonthsAgo(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 - 6, d));
  return dt.toISOString().slice(0, 10);
}

// 摘要：列表页只需要主要奖项，减少传输量
function summary(d: Draw) {
  return {
    date: d.date,
    first: d.first,
    near: d.near,
    front3: d.front3,
    back3: d.back3,
    back2: d.back2,
    hasFull: !!(d.prize2 && d.prize3 && d.prize4 && d.prize5),
  };
}

async function readMeta(sql: Sql, key: string): Promise<string | null> {
  const rows = await sql`SELECT value FROM app_meta WHERE key = ${key}`;
  return rows.length > 0 ? (rows[0].value as string) : null;
}

async function writeMeta(sql: Sql, key: string, value: string) {
  await sql`
    INSERT INTO app_meta (key, value, updated_at) VALUES (${key}, ${value}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
}

// 同时最多 n 个任务一起跑（避免一次发太多请求）
async function runPool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return results;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  try {
    const isAdminAction = ['check_source', 'import_preview', 'import', 'delete'].includes(action);
    const user = isAdminAction ? await requireAdmin(req, res) : await requireUser(req, res);
    if (!user) return;
    const sql = getDb();

    // ---------- 开奖列表 ----------
    if (req.method === 'GET' && action === 'list') {
      const rows = await sql`
        SELECT draw_date::text AS draw_date, first_prize, near_first, front3, back3, back2,
               prize2, prize3, prize4, prize5
        FROM draws WHERE draw_date >= ${bangkokSixMonthsAgo()}::date
        ORDER BY draw_date DESC LIMIT 200
      `;
      const info = await sql`SELECT MIN(draw_date)::text AS earliest, COUNT(*)::int AS total FROM draws`;
      const historyComplete = (await readMeta(sql, 'history_from')) === HISTORY_FROM;
      return res.status(200).json({
        success: true,
        draws: rows.map((r) => summary(rowToDraw(r))),
        earliest: info[0]?.earliest ?? null,
        total: info[0]?.total ?? 0,
        historyComplete,
      });
    }

    // ---------- 最近一期 ----------
    if (req.method === 'GET' && action === 'latest') {
      const rows = await sql`
        SELECT draw_date::text AS draw_date, first_prize, near_first, front3, back3, back2,
               prize2, prize3, prize4, prize5
        FROM draws ORDER BY draw_date DESC LIMIT 1
      `;
      const historyComplete = (await readMeta(sql, 'history_from')) === HISTORY_FROM;
      return res.status(200).json({ success: true, draw: rows.length > 0 ? rowToDraw(rows[0]) : null, historyComplete });
    }

    // ---------- 某一期详情 ----------
    if (req.method === 'GET' && action === 'get') {
      const date = String(req.query.date ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 400, '日期格式不对');
      const rows = await sql`
        SELECT draw_date::text AS draw_date, first_prize, near_first, front3, back3, back2,
               prize2, prize3, prize4, prize5
        FROM draws WHERE draw_date = ${date}
      `;
      if (rows.length === 0) return fail(res, 404, '没有这一期的数据');
      return res.status(200).json({ success: true, draw: rowToDraw(rows[0]) });
    }

    // ---------- 自动同步 ----------
    if (req.method === 'POST' && action === 'sync') {
      const force = req.body?.force === true && user.isAdmin; // 管理员可以跳过10分钟限制
      const last = await readMeta(sql, 'last_sync_at');
      if (!force && last && Date.now() - Number(last) < SYNC_INTERVAL_MS) {
        return res.status(200).json({ success: true, skipped: true, added: 0, message: '刚刚同步过，稍后再试' });
      }
      await writeMeta(sql, 'last_sync_at', String(Date.now()));

      const yearStart = HISTORY_FROM;
      const wanted: ListItem[] = [];
      try {
        for (let page = 1; page <= 10; page++) {
          const items = await fetchList(page);
          if (items.length === 0) break;
          let reachedOld = false;
          for (const it of items) {
            if (it.date >= yearStart) wanted.push(it);
            else reachedOld = true;
          }
          if (reachedOld) break;
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return res.status(200).json({
          success: false,
          error: `自动获取开奖数据失败（${reason}）。可以请管理员在【管理】页导入 md 文档。`,
        });
      }

      const existingRows = await sql`SELECT draw_date::text AS d FROM draws`;
      const existing = new Set(existingRows.map((r) => r.d as string));
      const missing = wanted.filter((it) => !existing.has(it.date));
      const todo = missing.slice(0, 250);

      const outcomes = await runPool(todo, 8, async (it) => {
        try {
          const raw: RawDraw = await fetchDraw(it.id);
          const f = finalizeDraw(raw);
          if (!f.draw) return { ok: false, date: it.date, why: f.errors.join('；') };
          await saveDraw(sql, f.draw, 'api');
          return { ok: true, date: it.date, why: '' };
        } catch (err) {
          return { ok: false, date: it.date, why: err instanceof Error ? err.message : String(err) };
        }
      });
      const added = outcomes.filter((o) => o.ok).length;
      if (outcomes.every((o) => o.ok) && missing.length <= todo.length) {
        await writeMeta(sql, 'history_from', HISTORY_FROM); // 近年历史已补齐
      }
      const failed = outcomes.filter((o) => !o.ok);
      let message = added > 0 ? `已获取 ${added} 期新的开奖结果` : '已是最新，没有新的开奖结果';
      if (failed.length > 0) message += `；有 ${failed.length} 期获取失败（${failed[0].date}：${failed[0].why}）`;
      return res.status(200).json({ success: true, added, message });
    }

    // ---------- 检测数据源（管理员） ----------
    if (req.method === 'GET' && action === 'check_source') {
      return res.status(200).json({ success: true, steps: await checkSource() });
    }

    // ---------- 导入 md：预览 / 保存（管理员） ----------
    if (req.method === 'POST' && (action === 'import_preview' || action === 'import')) {
      const text = String(req.body?.text ?? '');
      if (!text.trim()) return fail(res, 400, '没有内容');
      if (text.length > 2_000_000) return fail(res, 400, '文件太大了');

      const blocks = parseDrawMarkdown(text);
      const items = blocks.map((b) => {
        const f = finalizeDraw(b.raw);
        return { title: b.title, finalized: f };
      });

      if (action === 'import_preview') {
        return res.status(200).json({
          success: true,
          items: items.map(({ title, finalized: f }) => ({
            title,
            ok: !!f.draw,
            date: f.draw?.date ?? null,
            first: f.draw?.first ?? null,
            front3: f.draw?.front3 ?? null,
            back3: f.draw?.back3 ?? null,
            back2: f.draw?.back2 ?? null,
            counts: f.draw
              ? [f.draw.prize2?.length ?? 0, f.draw.prize3?.length ?? 0, f.draw.prize4?.length ?? 0, f.draw.prize5?.length ?? 0]
              : null,
            errors: f.errors,
            warnings: f.warnings,
          })),
        });
      }

      let saved = 0;
      for (const { finalized: f } of items) {
        if (!f.draw) continue;
        await saveDraw(sql, f.draw, 'import');
        saved++;
      }
      const skipped = items.length - saved;
      return res.status(200).json({
        success: true,
        saved,
        skipped,
        message: `已导入 ${saved} 期${skipped > 0 ? `，${skipped} 期无法识别已跳过` : ''}`,
      });
    }

    // ---------- 删除某一期（管理员） ----------
    if (req.method === 'POST' && action === 'delete') {
      const date = String(req.body?.date ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 400, '日期格式不对');
      await sql`DELETE FROM draws WHERE draw_date = ${date}`;
      return res.status(200).json({ success: true });
    }

    return fail(res, 400, '未知操作');
  } catch (err) {
    console.error('draws error:', err);
    // 42P01 = 数据表不存在：说明升级后还没点过"更新数据库结构"
    if ((err as { code?: string }).code === '42P01') {
      return fail(res, 500, '数据库还没有更新：请管理员到【管理】页点一下"更新数据库结构"');
    }
    return fail(res, 500, err instanceof Error ? err.message : '服务器出错了');
  }
}

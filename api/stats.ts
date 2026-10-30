// 统计接口：基于历史开奖数据（2021年起）的概率统计
// GET /api/stats?action=overview&months=12      months：6 / 12 / 24；不传或 0 表示全部历史

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_db.js';
import { requireUser } from './_auth.js';
import { computeStats, loadDraws } from './_stats.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (req.method === 'GET' && req.query.action === 'overview') {
      const draws = await loadDraws(getDb());
      const months = Number(req.query.months ?? 0);
      let from: string | null = null;
      if ([6, 12, 24].includes(months)) {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
        const [y, m, d] = today.split('-').map(Number);
        from = new Date(Date.UTC(y, m - 1 - months, d)).toISOString().slice(0, 10);
      }
      return res.status(200).json({ success: true, stats: computeStats(draws, from) });
    }
    return res.status(400).json({ success: false, error: '未知操作' });
  } catch (err) {
    console.error('stats error:', err);
    const code = (err as { code?: string })?.code;
    const msg = code === '42P01' ? '数据库还没有更新：请管理员到【管理】页点一下“更新数据库结构”' : err instanceof Error ? err.message : '服务器出错了';
    return res.status(500).json({ success: false, error: msg });
  }
}

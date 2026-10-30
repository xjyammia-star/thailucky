// 统计接口：基于历史开奖数据（2021年起）的概率统计
// GET /api/stats?action=overview

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
      return res.status(200).json({ success: true, stats: computeStats(draws) });
    }
    return res.status(400).json({ success: false, error: '未知操作' });
  } catch (err) {
    console.error('stats error:', err);
    const code = (err as { code?: string })?.code;
    const msg = code === '42P01' ? '数据库还没有更新：请管理员到【管理】页点一下“更新数据库结构”' : err instanceof Error ? err.message : '服务器出错了';
    return res.status(500).json({ success: false, error: msg });
  }
}

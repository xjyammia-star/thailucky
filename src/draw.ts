// 开奖日相关的小工具。
// 泰国政府彩票通常每月1日和16日开奖，遇公共假日官方可能顺延一两天，
// 所以这里的日期只用于"估算倒计时"和"判断是否该去同步新数据"，
// 真正的开奖结果以接口 / 导入的数据为准。

import { api } from './api.ts';

export interface NextDraw {
  dateText: string; // 例如 "2026年11月1日 周日"
  daysLeft: number; // 0 表示就是今天
  iso: string; // 例如 2026-11-01
}

// 取"泰国当地时间"的今天日期（年、月、日）
function bangkokToday(now: Date): { y: number; m: number; d: number } {
  const text = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now); // 2026-10-30
  const [y, m, d] = text.split('-').map(Number);
  return { y, m, d };
}

export function getNextDraw(now: Date = new Date()): NextDraw {
  const t = bangkokToday(now);
  const todayUtc = Date.UTC(t.y, t.m - 1, t.d);

  const candidates = [
    Date.UTC(t.y, t.m - 1, 1),
    Date.UTC(t.y, t.m - 1, 16),
    Date.UTC(t.y, t.m, 1), // 下个月1日（月份超过12时 Date.UTC 会自动进位到下一年）
  ];
  const next = candidates.find((c) => c >= todayUtc)!;

  const dt = new Date(next);
  const dateText = dt.toLocaleDateString('zh-CN', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
  return { dateText, daysLeft: Math.round((next - todayUtc) / 86400000), iso: new Date(next).toISOString().slice(0, 10) };
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// 按常规日期，最近一次"应该已经开过"的开奖日（今天是1号/16号也算）
export function lastScheduledDraw(now: Date = new Date()): string {
  const t = bangkokToday(now);
  const todayUtc = Date.UTC(t.y, t.m - 1, t.d);
  const candidates = [
    Date.UTC(t.y, t.m - 1, 16),
    Date.UTC(t.y, t.m - 1, 1),
    Date.UTC(t.y, t.m - 2, 16),
  ];
  return iso(candidates.find((c) => c <= todayUtc)!);
}

// 库里最新一期是否落后于应有的开奖日（留3天的余量，应对假日顺延）
export function needsSync(latestDate: string | null, now: Date = new Date()): boolean {
  if (!latestDate) return true;
  const scheduled = Date.parse(`${lastScheduledDraw(now)}T00:00:00Z`);
  return Date.parse(`${latestDate}T00:00:00Z`) < scheduled - 3 * 86400000;
}

// 需要时自动去同步一次（服务器端有10分钟限流，重复调用不会反复请求外部接口）
export async function autoSyncIfNeeded(
  latestDate: string | null,
  historyComplete = true, // false 表示近几年的历史数据还没补齐，也需要去获取
): Promise<{ added: number; error?: string }> {
  if (historyComplete && !needsSync(latestDate)) return { added: 0 };
  try {
    const r = await api<{ added: number; skipped?: boolean }>('/api/draws?action=sync', { method: 'POST', body: {} });
    return { added: r.added ?? 0 };
  } catch (e) {
    return { added: 0, error: e instanceof Error ? e.message : '自动获取失败' };
  }
}

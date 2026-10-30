// 开奖日计算：泰国政府彩票通常每月1日和16日开奖。
// 遇到公共假日时官方可能顺延一两天，这里只做"按常规日期估算"，
// 之后接入开奖数据后，会以官方公布的日期为准。

export interface NextDraw {
  dateText: string; // 例如 "2026年11月1日 周日"
  daysLeft: number; // 0 表示就是今天
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
  return { dateText, daysLeft: Math.round((next - todayUtc) / 86400000) };
}

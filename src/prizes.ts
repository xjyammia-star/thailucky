// 各奖项的奖金（泰铢 / 每张彩票）。
// 数据来自 2026 年开奖公告：头奖 6,000,000；相邻奖 100,000；二等奖 200,000；三等奖 80,000；
// 四等奖 40,000；五等奖 20,000；前三位 4,000；后三位 4,000；后两位 2,000。
// 奖金曾经调整过，所以只对 2018 年及以后的开奖显示，更早的期数不显示金额以免误导。

export type PrizeKey = 'first' | 'near' | 'prize2' | 'prize3' | 'prize4' | 'prize5' | 'front3' | 'back3' | 'back2';

export const PRIZE_AMOUNTS: Record<PrizeKey, number> = {
  first: 6_000_000,
  near: 100_000,
  prize2: 200_000,
  prize3: 80_000,
  prize4: 40_000,
  prize5: 20_000,
  front3: 4_000,
  back3: 4_000,
  back2: 2_000,
};

const AMOUNT_FROM = '2018-01-01';

export function prizeAmount(key: PrizeKey, drawDate: string): number | null {
  return drawDate >= AMOUNT_FROM ? PRIZE_AMOUNTS[key] : null;
}

// 6000000 → "6,000,000 铢"
export function baht(n: number): string {
  return `${n.toLocaleString('en-US')} 铢`;
}

export function amountText(key: PrizeKey, drawDate: string): string {
  const a = prizeAmount(key, drawDate);
  return a === null ? '' : baht(a);
}

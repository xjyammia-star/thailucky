// 对奖逻辑（纯计算）。规则：
//  - 一张彩票可以同时中多个奖项，奖金累加；
//  - 头奖 / 二到五等奖：6位全中；相邻奖：和头奖只差1（头奖前一号、后一号）；
//  - 前三位：号码前3位与开奖的2组前三位之一相同；后三位：后3位与2组后三位之一相同；后两位：后2位相同；
//  - 二到五等奖的号码不完整时（导入的数据可能缺），不能判断，会标记"incomplete"，不会误报没中。

import type { Draw } from './_draws.js';

export type PrizeKey = 'first' | 'near' | 'prize2' | 'prize3' | 'prize4' | 'prize5' | 'front3' | 'back3' | 'back2';

export const PRIZE_LABEL: Record<PrizeKey, string> = {
  first: '头奖',
  near: '头奖前后各一号',
  prize2: '二等奖',
  prize3: '三等奖',
  prize4: '四等奖',
  prize5: '五等奖',
  front3: '前三位',
  back3: '后三位',
  back2: '后两位',
};

// 奖金（泰铢/每张），与前端 src/prizes.ts 一致；2018年以前的期数不计金额
const AMOUNTS: Record<PrizeKey, number> = {
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

export interface Win {
  key: PrizeKey;
  label: string;
  amount: number | null;
}

export interface CheckResult {
  wins: Win[];
  total: number; // 奖金合计（无金额的期数为 0）
  incomplete: boolean; // 二到五等奖数据不完整，没法完全确认
}

export function checkNumber(number: string, draw: Draw): CheckResult {
  const hit: PrizeKey[] = [];
  if (number === draw.first) hit.push('first');
  if (draw.near.includes(number)) hit.push('near');
  if (draw.prize2?.includes(number)) hit.push('prize2');
  if (draw.prize3?.includes(number)) hit.push('prize3');
  if (draw.prize4?.includes(number)) hit.push('prize4');
  if (draw.prize5?.includes(number)) hit.push('prize5');
  if (draw.front3.includes(number.slice(0, 3))) hit.push('front3');
  if (draw.back3.includes(number.slice(3))) hit.push('back3');
  if (draw.back2 === number.slice(4)) hit.push('back2');

  const withAmount = draw.date >= '2018-01-01';
  const wins: Win[] = hit.map((key) => ({ key, label: PRIZE_LABEL[key], amount: withAmount ? AMOUNTS[key] : null }));
  const total = wins.reduce((s, w) => s + (w.amount ?? 0), 0);
  const incomplete = !draw.prize2 || !draw.prize3 || !draw.prize4 || !draw.prize5;
  return { wins, total, incomplete };
}

const DAY = 86400000;

// 找到某个"目标开奖日"对应的真实开奖：官方遇假日可能顺延，所以允许往后最多5天
export function findDraw(target: string, draws: Draw[]): Draw | null {
  const t = Date.parse(`${target}T00:00:00Z`);
  let best: Draw | null = null;
  for (const d of draws) {
    const diff = Date.parse(`${d.date}T00:00:00Z`) - t;
    if (diff >= 0 && diff <= 5 * DAY && (!best || d.date < best.date)) best = d;
  }
  return best;
}

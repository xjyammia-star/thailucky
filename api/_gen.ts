// 出号逻辑（纯计算，不碰数据库）
// 重要提醒：彩票每一期都是独立随机开出，这些"五行数字"只是仪式感，并不会提高中奖概率。

import { randomInt } from 'node:crypto';
import { HETU_DIGITS } from './_bazi.js';
import type { Element } from './_bazi.js';

const digit = () => String(randomInt(0, 10));

export function digitPool(favorable: Element[]): string[] {
  const pool: string[] = [];
  for (const el of favorable) for (const d of HETU_DIGITS[el]) pool.push(String(d));
  return pool;
}

// 指定数字：把 0-99 的数字（补成2位）放在随机位置，其余位置用喜用五行的河图数填充；
// 没有五行信息时，其余位置随机。
export function genLucky(lucky: number, pool: string[]): string {
  const two = String(lucky).padStart(2, '0');
  const pos = randomInt(0, 5); // 0..4，两位数占 pos、pos+1
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    if (i === pos) out.push(two[0]);
    else if (i === pos + 1) out.push(two[1]);
    else out.push(pool.length > 0 ? pool[randomInt(0, pool.length)] : digit());
  }
  return out.join('');
}

// 生成一批不重复的号码
export function genBatch(count: number, make: () => string): string[] {
  const set = new Set<string>();
  let guard = 0;
  while (set.size < count && guard++ < count * 50) set.add(make());
  return [...set];
}

// 分析选号：前4位每个位置从统计选出的3个数字里随机取，后两位从统计选出的10个"后两位"里随机取
export function genAnalysis(posDigits: number[][], tails: string[]): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    const c = posDigits[i];
    out += c && c.length > 0 ? String(c[randomInt(0, c.length)]) : digit();
  }
  out += tails.length > 0 ? tails[randomInt(0, tails.length)] : digit() + digit();
  return out;
}

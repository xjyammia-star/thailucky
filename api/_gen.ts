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

// 纯随机：6位全随机
export function genRandom(): string {
  return Array.from({ length: 6 }, digit).join('');
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

// 统计热号：前4位按历史频率加权随机抽取每个位置的数字，后两位从历史上出现次数最多的"后两位"里随机选
// （历史频率和纯随机几乎没有差别，这只是另一种仪式）
export function genHot(posCounts: number[][], hotBack2: string[]): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    const counts = posCounts[i];
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) {
      out += digit();
      continue;
    }
    let r = randomInt(0, total);
    let d = 0;
    for (; d < 10; d++) {
      r -= counts[d];
      if (r < 0) break;
    }
    out += String(Math.min(d, 9));
  }
  out += hotBack2.length > 0 ? hotBack2[randomInt(0, hotBack2.length)] : digit() + digit();
  return out;
}

// 梅花易数起卦（依据古籍语料中的"数起卦法"，并做了明确的简化，规则见下）
//
// 起卦规则（用户输入3个0-9的数字 a、b、c，再加当前时辰数）：
//   上卦 = a 除以 8 的余数（余0取8）      下卦 = b 除以 8 的余数（余0取8）
//   动爻 = (c + 时辰数) 除以 6 的余数（余0取6）      时辰数：子1 丑2 寅3 … 亥12
//   先天八卦数：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8
//   本卦 = (上卦, 下卦)；互卦 = 本卦的2、3、4爻为下卦，3、4、5爻为上卦；变卦 = 本卦的动爻阴阳互换
//   动爻在下卦（1-3爻）→ 下卦为"用"，上卦为"体"；动爻在上卦（4-6爻）→ 上卦为"用"，下卦为"体"
//
// 出号规则（这一步古籍里没有规定，是本工具自己定的，只是一个仪式）：
//   6位号码 = 本卦(上,下) + 互卦(上,下) + 变卦(上,下)，每个卦取它的先天数（1-8）作为一位数字；
//   同一批里的其他号码，是把其中某些数字换成"河图伙伴数"（1↔6、2↔7、3↔8、4↔9、5↔0，五行相同），
//   并优先选择更多数字落在你的喜用五行上的组合。

import { randomInt } from 'node:crypto';
import { HETU_DIGITS } from './_bazi.js';
import type { Element } from './_bazi.js';

export const TRIGRAMS = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'] as const; // 下标+1 = 先天数
const LINES: number[][] = [
  [1, 1, 1], // 乾（从下到上，1=阳 0=阴）
  [1, 1, 0], // 兑
  [1, 0, 1], // 离
  [1, 0, 0], // 震
  [0, 1, 1], // 巽
  [0, 1, 0], // 坎
  [0, 0, 1], // 艮
  [0, 0, 0], // 坤
];
const TRI_ELEMENT: Element[] = ['金', '金', '火', '木', '木', '水', '土', '土'];

// 六十四卦名：行 = 上卦，列 = 下卦（顺序都是 乾兑离震巽坎艮坤）
const NAMES: string[][] = [
  ['乾为天', '天泽履', '天火同人', '天雷无妄', '天风姤', '天水讼', '天山遁', '天地否'],
  ['泽天夬', '兑为泽', '泽火革', '泽雷随', '泽风大过', '泽水困', '泽山咸', '泽地萃'],
  ['火天大有', '火泽睽', '离为火', '火雷噬嗑', '火风鼎', '火水未济', '火山旅', '火地晋'],
  ['雷天大壮', '雷泽归妹', '雷火丰', '震为雷', '雷风恒', '雷水解', '雷山小过', '雷地豫'],
  ['风天小畜', '风泽中孚', '风火家人', '风雷益', '巽为风', '风水涣', '风山渐', '风地观'],
  ['水天需', '水泽节', '水火既济', '水雷屯', '水风井', '坎为水', '水山蹇', '水地比'],
  ['山天大畜', '山泽损', '山火贲', '山雷颐', '山风蛊', '山水蒙', '艮为山', '山地剥'],
  ['地天泰', '地泽临', '地火明夷', '地雷复', '地风升', '地水师', '地山谦', '坤为地'],
];

export const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 泰国当地时间 → 时辰数（23:00-00:59 为子时=1）
export function shichenNow(now: Date = new Date()): { name: string; num: number; clock: string } {
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now); // "21:58"
  const h = Number(text.slice(0, 2)) % 24;
  const idx = Math.floor(((h + 1) % 24) / 2);
  return { name: SHICHEN[idx], num: idx + 1, clock: text };
}

const mod = (n: number, m: number) => {
  const r = n % m;
  return r === 0 ? m : r;
};

const triNum = (lines: number[]) => LINES.findIndex((l) => l[0] === lines[0] && l[1] === lines[1] && l[2] === lines[2]) + 1;

export interface Hexagram {
  upper: number; // 先天数 1-8
  lower: number;
  name: string;
}

const hexName = (upper: number, lower: number) => NAMES[upper - 1][lower - 1];
const hex = (upper: number, lower: number): Hexagram => ({ upper, lower, name: hexName(upper, lower) });

export interface Relation {
  who: string; // 用卦 / 互卦上 / 互卦下 / 变卦
  trigram: string;
  element: Element;
  relation: string; // 比和 / 用生体 / 体生用 / 体克用 / 用克体
  verdict: string;
}

export interface Meihua {
  nums: [number, number, number];
  shichen: string;
  shichenNum: number;
  moving: number; // 动爻 1-6
  ben: Hexagram;
  hu: Hexagram;
  bian: Hexagram;
  tiSide: '上卦' | '下卦';
  ti: string; // 体卦名，如 "乾"
  tiElement: Element;
  relations: Relation[];
}

const GEN: Record<Element, Element> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const CTRL: Record<Element, Element> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

function relate(ti: Element, other: Element): { relation: string; verdict: string } {
  if (ti === other) return { relation: '比和', verdict: '吉' };
  if (GEN[other] === ti) return { relation: '用生体', verdict: '大吉' };
  if (GEN[ti] === other) return { relation: '体生用', verdict: '耗泄，不太顺' };
  if (CTRL[ti] === other) return { relation: '体克用', verdict: '小吉' };
  return { relation: '用克体', verdict: '不利' };
}

export function castMeihua(nums: [number, number, number], shichenNum: number, shichenName: string): Meihua {
  const upper = mod(nums[0], 8);
  const lower = mod(nums[1], 8);
  const moving = mod(nums[2] + shichenNum, 6);

  const six = [...LINES[lower - 1], ...LINES[upper - 1]]; // 第1-6爻，从下到上
  const hu = hex(triNum(six.slice(2, 5)), triNum(six.slice(1, 4))); // 上=3,4,5爻 下=2,3,4爻
  const flipped = six.map((v, i) => (i === moving - 1 ? 1 - v : v));
  const bian = hex(triNum(flipped.slice(3, 6)), triNum(flipped.slice(0, 3)));

  const movingInLower = moving <= 3;
  const tiNum = movingInLower ? upper : lower;
  const yongNum = movingInLower ? lower : upper;
  const yongChanged = movingInLower ? bian.lower : bian.upper;
  const tiEl = TRI_ELEMENT[tiNum - 1];

  const rel = (who: string, n: number): Relation => {
    const el = TRI_ELEMENT[n - 1];
    return { who, trigram: TRIGRAMS[n - 1], element: el, ...relate(tiEl, el) };
  };

  return {
    nums,
    shichen: shichenName,
    shichenNum,
    moving,
    ben: hex(upper, lower),
    hu,
    bian,
    tiSide: movingInLower ? '上卦' : '下卦',
    ti: TRIGRAMS[tiNum - 1],
    tiElement: tiEl,
    relations: [rel('用卦', yongNum), rel('互卦上', hu.upper), rel('互卦下', hu.lower), rel('变卦', yongChanged)],
  };
}

// 本命号码：本卦(上,下) 互卦(上,下) 变卦(上,下)
export function baseNumber(m: Meihua): string {
  return `${m.ben.upper}${m.ben.lower}${m.hu.upper}${m.hu.lower}${m.bian.upper}${m.bian.lower}`;
}

const PARTNER = (d: number) => (d + 5) % 10;

// 一批号码：第一个是卦象号码，其余是河图伙伴替换的变体（优先喜用五行的数字多的）
export function meihuaBatch(m: Meihua, count: number, favorable: Element[]): string[] {
  const base = baseNumber(m);
  const out = [base];
  if (count <= 1) return out;

  const favDigits = new Set<number>();
  for (const el of favorable) for (const d of HETU_DIGITS[el]) favDigits.add(d);

  const variants: { num: string; score: number; tie: number }[] = [];
  for (let mask = 1; mask < 64; mask++) {
    const digits = base.split('').map((c, i) => (mask & (1 << i) ? PARTNER(Number(c)) : Number(c)));
    variants.push({
      num: digits.join(''),
      score: favDigits.size > 0 ? digits.filter((d) => favDigits.has(d)).length : 0,
      tie: randomInt(0, 1_000_000),
    });
  }
  variants.sort((a, b) => b.score - a.score || a.tie - b.tie);
  for (const v of variants) {
    if (out.length >= count) break;
    if (!out.includes(v.num)) out.push(v.num);
  }
  return out;
}

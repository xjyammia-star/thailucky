// 历史开奖统计（只描述历史、检验"是否偏离随机"，不预测未来）
// 说明：每期开奖互相独立，统计里的"热号/冷号"绝大多数只是随机波动。
// 这里用统计检验（卡方检验、二项检验）来量化"看起来的偏差"是不是在随机范围内。

import { getDb } from './_db.js';
import { rowToDraw } from './_draws.js';
import type { Draw } from './_draws.js';
import { HETU_DIGITS } from './_bazi.js';
import type { Element } from './_bazi.js';

type Sql = ReturnType<typeof getDb>;

export const HISTORY_FROM = '2021-01-01';

export async function loadDraws(sql: Sql): Promise<Draw[]> {
  const rows = await sql`
    SELECT draw_date::text AS draw_date, first_prize, near_first, front3, back3, back2,
           prize2, prize3, prize4, prize5
    FROM draws WHERE draw_date >= ${HISTORY_FROM}::date ORDER BY draw_date ASC
  `;
  return rows.map(rowToDraw);
}

// 时间范围：months 为 6 / 12 / 24 时返回起始日期（泰国当地），其他（0）表示全部历史
export function cutoffFromMonths(months: number): string | null {
  if (![6, 12, 24].includes(months)) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 - months, d)).toISOString().slice(0, 10);
}

// ---------- 数学小工具 ----------

function logGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const cj of c) ser += cj / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// 正则化上不完全伽马 Q(a,x)
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

export function chiSquareP(chi: number, df: number): number {
  return Math.min(1, Math.max(0, gammaQ(df / 2, chi / 2)));
}

// 误差函数补，用于正态近似
function normalTwoSided(z: number): number {
  return chiSquareP(z * z, 1);
}

const lf: number[] = [0];
function logFact(n: number): number {
  for (let i = lf.length; i <= n; i++) lf[i] = lf[i - 1] + Math.log(i);
  return lf[n];
}

// P(X >= k)，X ~ Binomial(n, p)
export function binomTail(n: number, k: number, p: number): number {
  if (k <= 0) return 1;
  let s = 0;
  for (let i = k; i <= n; i++) {
    s += Math.exp(logFact(n) - logFact(i) - logFact(n - i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(1, s);
}

// 精确二项检验（双侧）：实际次数和理论概率比，有没有"太多"或"太少"
export function binomTwoSided(n: number, k: number, p: number): number {
  if (n === 0) return 1;
  const pmf = (i: number) => Math.exp(logFact(n) - logFact(i) - logFact(n - i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  const pk = pmf(k);
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const q = pmf(i);
    if (q <= pk * (1 + 1e-9)) s += q;
  }
  return Math.min(1, s);
}

export interface RateTest {
  label: string;
  example: string;
  count: number;
  total: number;
  expected: number; // 理论概率
  p: number;
}

function rateTest(label: string, example: string, count: number, total: number, expected: number): RateTest {
  return { label, example, count, total, expected, p: binomTwoSided(total, count, expected) };
}

// 一个6位号码的"连续相同数字"结构：127777 → [1,1,4]
function runsOf(n: string): number[] {
  const out: number[] = [];
  let len = 1;
  for (let i = 1; i < n.length; i++) {
    if (n[i] === n[i - 1]) len++;
    else {
      out.push(len);
      len = 1;
    }
  }
  out.push(len);
  return out;
}

// 6的所有拆分（有序）：每种拆分对应的6位数字串占比 = 10 × 9^(段数-1) / 10^6
const COMPOSITIONS: number[][] = (() => {
  const res: number[][] = [];
  const go = (left: number, cur: number[]) => {
    if (left === 0) {
      res.push(cur);
      return;
    }
    for (let k = 1; k <= left; k++) go(left - k, [...cur, k]);
  };
  go(6, []);
  return res;
})();

function theory(pred: (runs: number[]) => boolean): number {
  return COMPOSITIONS.filter(pred).reduce((s, c) => s + (10 * Math.pow(9, c.length - 1)) / 1_000_000, 0);
}

const sameStr = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export interface Repeats {
  back2Same: RateTest; // 后两位奖：两位数字相同（如 66）
  back3Same: RateTest; // 后三位奖：三位数字相同（如 888）
  tail2Same: RateTest; // 所有6位号码：最后两位相同
  tail3Same: RateTest; // 所有6位号码：最后三位相同
  runDist: Uniform & { labels: string[]; probs: number[] }; // 最长连续相同长度：1 / 2 / 3 / 4及以上（含理论占比）
  specials: RateTest[];
}

export interface Uniform {
  counts: number[];
  total: number;
  chi: number;
  df: number;
  p: number;
}

export function uniformTest(counts: number[], probs?: number[]): Uniform {
  const total = counts.reduce((a, b) => a + b, 0);
  const pr = probs ?? counts.map(() => 1 / counts.length);
  let chi = 0;
  counts.forEach((c, i) => {
    const e = total * pr[i];
    chi += ((c - e) * (c - e)) / e;
  });
  const df = counts.length - 1;
  return { counts, total, chi, df, p: chiSquareP(chi, df) };
}

// ---------- 取号码 ----------

// 相互独立的 6 位号码：头奖 + 二到五等奖（相邻奖由头奖决定，不算）
export function sixDigitNumbers(d: Draw): string[] {
  return [d.first, ...(d.prize2 ?? []), ...(d.prize3 ?? []), ...(d.prize4 ?? []), ...(d.prize5 ?? [])];
}

function allSix(draws: Draw[]): string[] {
  return draws.flatMap(sixDigitNumbers);
}

// ---------- 热号 / 冷号排序（分析选号与选号评分共用）----------

// 前4个位置：每个位置 0-9 按"热"或"冷"从前到后排好
export function orderedDigits(draws: Draw[], mode: 'hot' | 'cold'): number[][] {
  const posCounts = Array.from({ length: 6 }, () => Array(10).fill(0) as number[]);
  for (const n of allSix(draws)) for (let i = 0; i < 6; i++) posCounts[i][Number(n[i])]++;
  return posCounts.slice(0, 4).map((counts) => {
    const idx = counts.map((c, d) => ({ d, c }));
    idx.sort((a, b) => (mode === 'hot' ? b.c - a.c : a.c - b.c) || a.d - b.d);
    return idx.map((x) => x.d);
  });
}

// 后两位 00-99 按"热"或"冷"从前到后排好（冷：次数相同时，隔得更久没出现的更冷）
export function orderedTails(draws: Draw[], mode: 'hot' | 'cold'): string[] {
  const r = rank(draws.map((d) => [d.back2]), U2);
  const sorted =
    mode === 'hot'
      ? [...r].sort((a, b) => b.count - a.count || a.gap - b.gap || (a.n < b.n ? -1 : 1))
      : [...r].sort((a, b) => a.count - b.count || b.gap - a.gap || (a.n < b.n ? -1 : 1));
  return sorted.map((x) => x.n);
}

// ---------- 分析选号档案 ----------

export interface AnalysisProfile {
  posDigits: number[][]; // 前4个位置，每个位置选出的3个数字
  tails: string[]; // 后两位候选（10个）
}

// mode = hot：出现次数最多的；cold：出现次数最少的
export function analysisProfile(draws: Draw[], mode: 'hot' | 'cold'): AnalysisProfile {
  return {
    posDigits: orderedDigits(draws, mode).map((l) => l.slice(0, 3)),
    tails: orderedTails(draws, mode).slice(0, 10),
  };
}

// ---------- 选号评分 ----------
// 把输入的数字（最后 n 位，2 ≤ n ≤ 6）和"系统自己会选的号码"比较，得到匹配度（0-100%）。
// 匹配度 = 和系统选号规则有多像，不是中奖概率；每个号码的中奖概率完全一样。

export interface ScoreUnit {
  label: string;
  credit: number; // 0-1
  ok: boolean; // 是否完全符合（进入系统会选的范围）
}

export interface ScoreComponent {
  key: 'hot' | 'cold' | 'bazi' | 'lucky';
  label: string;
  pct: number;
  units: ScoreUnit[];
}

export interface ScoreResult {
  input: string;
  covered: string;
  overall: number;
  best: string;
  components: ScoreComponent[];
  unavailable: string[];
}

const BAZI_POOL = (fav: Element[]) => new Set(fav.flatMap((el) => HETU_DIGITS[el]));

function pctOf(units: { credit: number; w: number }[]): number {
  const w = units.reduce((s, u) => s + u.w, 0);
  return w === 0 ? 0 : Math.round((units.reduce((s, u) => s + u.credit * u.w, 0) / w) * 1000) / 10;
}

export function scoreNumber(
  input: string,
  draws: Draw[],
  favorable: Element[] | null,
  lucky: number | null,
): ScoreResult {
  const n = input.length;
  const start = 6 - n;
  const components: ScoreComponent[] = [];
  const unavailable: string[] = [];

  const stat = (mode: 'hot' | 'cold') => {
    const digits = orderedDigits(draws, mode);
    const tails = orderedTails(draws, mode);
    const word = mode === 'hot' ? '热' : '冷';
    const units: ScoreUnit[] = [];
    const weights: { credit: number; w: number }[] = [];
    for (let i = start; i <= 3; i++) {
      const r = digits[i].indexOf(Number(input[i - start]));
      const credit = r < 3 ? 1 : 1 - (r - 2) / 10;
      units.push({ label: `第${i + 1}位 ${input[i - start]}（${word}度第${r + 1}）`, credit, ok: r < 3 });
      weights.push({ credit, w: 1 });
    }
    const tail = input.slice(n - 2);
    const r = tails.indexOf(tail);
    const credit = r < 10 ? 1 : Math.max(0, 1 - (r - 9) / 100);
    units.push({ label: `最后两位 ${tail}（${word}度第${r + 1}）`, credit, ok: r < 10 });
    weights.push({ credit, w: 2 });
    components.push({ key: mode, label: mode === 'hot' ? '统计热号' : '统计冷号', pct: pctOf(weights), units });
  };
  if (draws.length > 0) {
    stat('hot');
    stat('cold');
  } else {
    unavailable.push('所选范围内没有开奖数据，无法计算热号/冷号匹配');
  }

  if (favorable && favorable.length > 0) {
    const pool = BAZI_POOL(favorable);
    const units: ScoreUnit[] = [];
    const weights: { credit: number; w: number }[] = [];
    for (let i = 0; i < n; i++) {
      const ok = pool.has(Number(input[i]));
      units.push({ label: `第${start + i + 1}位 ${input[i]}（${ok ? '属' : '不属'}${favorable.join('、')}）`, credit: ok ? 1 : 0, ok });
      weights.push({ credit: ok ? 1 : 0, w: 1 });
    }
    components.push({ key: 'bazi', label: `八字五行（喜用：${favorable.join('、')}）`, pct: pctOf(weights), units });
  } else {
    unavailable.push('没有填写生辰信息，无法计算八字五行匹配');
  }

  if (lucky !== null) {
    const two = String(lucky).padStart(2, '0');
    const at = input.indexOf(two);
    if (at >= 0) {
      const rest = input.slice(0, at) + input.slice(at + 2);
      let frac = 1;
      if (favorable && favorable.length > 0 && rest.length > 0) {
        const pool = BAZI_POOL(favorable);
        frac = rest.split('').filter((c) => pool.has(Number(c))).length / rest.length;
      }
      components.push({
        key: 'lucky',
        label: `幸运数字 ${two}`,
        pct: Math.round((50 + 50 * frac) * 10) / 10,
        units: [{ label: `包含幸运数字 ${two}`, credit: 1, ok: true }],
      });
    } else {
      components.push({
        key: 'lucky',
        label: `幸运数字 ${two}`,
        pct: 0,
        units: [{ label: `不包含幸运数字 ${two}`, credit: 0, ok: false }],
      });
    }
  }

  const best = components.reduce((a, b) => (b.pct > a.pct ? b : a), components[0]);
  return {
    input,
    covered: n === 6 ? '6位完整号码' : `最后${n}位`,
    overall: best ? best.pct : 0,
    best: best ? best.label : '',
    components,
    unavailable,
  };
}

// ---------- 完整统计 ----------

interface Ranked {
  n: string;
  count: number;
  gap: number; // 距离上次出现隔了几期（没出现过 = 总期数）
}

function rank(values: string[][], universe: string[]): Ranked[] {
  const count = new Map<string, number>();
  const lastIdx = new Map<string, number>();
  values.forEach((vs, i) => {
    for (const v of vs) {
      count.set(v, (count.get(v) ?? 0) + 1);
      lastIdx.set(v, i);
    }
  });
  const total = values.length;
  return universe.map((n) => ({
    n,
    count: count.get(n) ?? 0,
    gap: lastIdx.has(n) ? total - 1 - (lastIdx.get(n) as number) : total,
  }));
}

const pad = (n: number, w: number) => String(n).padStart(w, '0');
const U2 = Array.from({ length: 100 }, (_, i) => pad(i, 2));
const U3 = Array.from({ length: 1000 }, (_, i) => pad(i, 3));

export interface Backtest {
  label: string;
  picks: number;
  trials: number;
  hits: number;
  expected: number; // 每次命中的理论概率
  p: number;
}

function backtest(
  label: string,
  draws: Draw[],
  universe: string[],
  K: number,
  getVals: (d: Draw) => string[],
  mode: 'hot' | 'overdue',
  fromDate: string,
): Backtest {
  const START = 30;
  let trials = 0;
  let hits = 0;
  const winners = getVals(draws[0] ?? ({} as Draw)).length || 1;
  for (let i = START; i < draws.length; i++) {
    if (draws[i].date < fromDate) continue; // 只统计所选时间范围内的开奖；选号时可以参考之前的全部历史
    const r = rank(draws.slice(0, i).map(getVals), universe);
    const sorted =
      mode === 'hot'
        ? [...r].sort((a, b) => b.count - a.count || a.gap - b.gap || (a.n < b.n ? -1 : 1))
        : [...r].sort((a, b) => b.gap - a.gap || (a.n < b.n ? -1 : 1));
    const picks = new Set(sorted.slice(0, K).map((x) => x.n));
    trials++;
    if (getVals(draws[i]).some((v) => picks.has(v))) hits++;
  }
  const M = universe.length;
  // 至少命中一个的理论概率（winners 个中奖号码不重复地从 M 个里抽）
  let miss = 1;
  for (let j = 0; j < winners; j++) miss *= (M - K - j) / (M - j);
  const expected = 1 - miss;
  return { label, picks: K, trials, hits, expected, p: binomTail(trials, hits, expected) };
}

export interface Stats {
  range: { from: string; to: string; draws: number };
  sixCount: number;
  positions: (Uniform & { pos: number })[];
  back2: { tens: Uniform; units: Uniform; hot: Ranked[]; overdue: Ranked[] };
  back3: { hot: Ranked[]; overdue: Ranked[] };
  patterns: {
    parity: Uniform & { labels: string[] };
    big: Uniform & { labels: string[] };
    sum: { mean: number; expected: number; z: number; p: number };
  };
  repeats: Repeats;
  backtests: Backtest[];
  verdict: { tests: number; significant: number; byChance: number };
}

export function computeStats(allDraws: Draw[], from: string | null = null): Stats | null {
  const draws = from ? allDraws.filter((d) => d.date >= from) : allDraws;
  if (draws.length === 0) return null;
  const btFrom = from ?? '0000-00-00';
  const six = allSix(draws);

  // 各位置数字
  const positions = Array.from({ length: 6 }, (_, i) => {
    const counts = Array(10).fill(0) as number[];
    for (const n of six) counts[Number(n[i])]++;
    return { pos: i + 1, ...uniformTest(counts) };
  });

  // 后两位的十位 / 个位
  const tens = Array(10).fill(0) as number[];
  const units = Array(10).fill(0) as number[];
  for (const d of draws) {
    tens[Number(d.back2[0])]++;
    units[Number(d.back2[1])]++;
  }

  const r2 = rank(draws.map((d) => [d.back2]), U2);
  const r3 = rank(draws.map((d) => d.back3), U3);
  const hot = (r: Ranked[]) => [...r].sort((a, b) => b.count - a.count || a.gap - b.gap).slice(0, 10);
  const overdue = (r: Ranked[]) => [...r].sort((a, b) => b.gap - a.gap || (a.n < b.n ? -1 : 1)).slice(0, 10);

  // 形态：奇数个数、大数(5-9)个数，服从 Binomial(6, 0.5)
  const binom6 = [1, 6, 15, 20, 15, 6, 1].map((x) => x / 64);
  const par = Array(7).fill(0) as number[];
  const big = Array(7).fill(0) as number[];
  let sumTotal = 0;
  for (const n of six) {
    const ds = n.split('').map(Number);
    par[ds.filter((x) => x % 2 === 1).length]++;
    big[ds.filter((x) => x >= 5).length]++;
    sumTotal += ds.reduce((a, b) => a + b, 0);
  }
  const mean = sumTotal / six.length;
  const sd = Math.sqrt(6 * 8.25) / Math.sqrt(six.length); // 单个数字方差 8.25
  const z = (mean - 27) / sd;
  const labels = ['0个', '1个', '2个', '3个', '4个', '5个', '6个'];

  // 重复数字
  const b2same = draws.filter((d) => d.back2[0] === d.back2[1]).length;
  const b3all = draws.flatMap((d) => d.back3);
  const b3same = b3all.filter((x) => x[0] === x[1] && x[1] === x[2]).length;
  const t2same = six.filter((x) => x[4] === x[5]).length;
  const t3same = six.filter((x) => x[3] === x[4] && x[4] === x[5]).length;
  const runList = six.map(runsOf);
  const maxRun = (r: number[]) => Math.max(...r);
  const runCounts = [0, 0, 0, 0];
  for (const r of runList) runCounts[Math.min(maxRun(r), 4) - 1]++;
  const runProbs = [1, 2, 3, 4].map((L) =>
    theory((c) => (L === 4 ? maxRun(c) >= 4 : maxRun(c) === L)),
  );
  const countBy = (pred: (r: number[]) => boolean) => runList.filter(pred).length;
  const specialDefs: { label: string; example: string; pred: (r: number[]) => boolean }[] = [
    { label: '含连续3个及以上相同数字', example: '如 120004、666123', pred: (r) => maxRun(r) >= 3 },
    { label: '含连续4个及以上相同数字', example: '如 127777', pred: (r) => maxRun(r) >= 4 },
    { label: '三连对（AABBCC）', example: '如 334455', pred: (r) => sameStr(r, [2, 2, 2]) },
    { label: '双三连（AAABBB）', example: '如 666888', pred: (r) => sameStr(r, [3, 3]) },
    { label: '6位全部相同', example: '如 777777', pred: (r) => sameStr(r, [6]) },
  ];
  const repeats: Repeats = {
    back2Same: rateTest('后两位奖：两位数字相同', '如 66', b2same, draws.length, 0.1),
    back3Same: rateTest('后三位奖：三位数字相同', '如 888', b3same, b3all.length, 0.01),
    tail2Same: rateTest('所有6位号码：最后两位相同', '如 xxxx55', t2same, six.length, 0.1),
    tail3Same: rateTest('所有6位号码：最后三位相同', '如 xxx999', t3same, six.length, 0.01),
    runDist: { ...uniformTest(runCounts, runProbs), labels: ['最长连续1个（无重复相邻）', '最长连续2个', '最长连续3个', '最长连续4个及以上'], probs: runProbs },
    specials: specialDefs.map((d) => rateTest(d.label, d.example, countBy(d.pred), six.length, theory(d.pred))),
  };

  const backtests = [
    backtest('后两位：每期选历史最热的5个', allDraws, U2, 5, (d) => [d.back2], 'hot', btFrom),
    backtest('后两位：每期选隔得最久没出的5个', allDraws, U2, 5, (d) => [d.back2], 'overdue', btFrom),
    backtest('后三位：每期选历史最热的5个', allDraws, U3, 5, (d) => d.back3, 'hot', btFrom),
    backtest('后三位：每期选隔得最久没出的5个', allDraws, U3, 5, (d) => d.back3, 'overdue', btFrom),
  ];

  const ps = [
    ...positions.map((x) => x.p),
    uniformTest(tens).p,
    uniformTest(units).p,
    uniformTest(par, binom6).p,
    uniformTest(big, binom6).p,
    normalTwoSided(z),
    repeats.back2Same.p,
    repeats.back3Same.p,
    repeats.tail2Same.p,
    repeats.tail3Same.p,
    repeats.runDist.p,
    ...repeats.specials.map((x) => x.p),
    ...backtests.map((b) => b.p),
  ];

  return {
    range: { from: draws[0].date, to: draws[draws.length - 1].date, draws: draws.length },
    sixCount: six.length,
    positions,
    back2: { tens: uniformTest(tens), units: uniformTest(units), hot: hot(r2), overdue: overdue(r2) },
    back3: { hot: hot(r3), overdue: overdue(r3) },
    patterns: {
      parity: { ...uniformTest(par, binom6), labels },
      big: { ...uniformTest(big, binom6), labels },
      sum: { mean, expected: 27, z, p: normalTwoSided(z) },
    },
    repeats,
    backtests,
    verdict: { tests: ps.length, significant: ps.filter((p) => p < 0.05).length, byChance: ps.length * 0.05 },
  };
}

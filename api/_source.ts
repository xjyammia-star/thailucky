// 自动获取开奖数据的"来源"（内部用，不是接口）。
// 来源：开源数据集 huayreview/thai-lottery-results（GitHub 上的副本，整理自泰国政府彩票局官方结果，CC BY 4.0 许可，
// 使用时需注明出处，页面底部已标注）。它是一个静态 JSON 文件，比第三方接口稳定得多。
// 它由作者定期更新，所以刚开奖后可能晚几天才有；这时可以在【管理】页用 md 导入补上。
// 哪天它停更或改了格式，【管理】页的"检测数据源"会告诉我们原因，换来源只需要改这个文件。

import type { RawDraw } from './_draws.js';

// 全部历史开奖：读 GitHub 上的数据集（稳定，但作者更新会晚一两天）。
// 数据集里还没有的最近一期，由下面的 Sanook 开奖页补上。
// （原站 huayreview.net 有人机验证，服务器读不了，所以不用。）
const DATA_URLS = ['https://raw.githubusercontent.com/huayreview/thai-lottery-results/main/thai-lottery-results.json'];

export interface ListItem {
  id: string; // 这个来源里用日期当编号，例如 2026-10-16
  date: string;
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});

async function getText(url: string, timeoutMs = 20000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; xuanhao-family-app)', Accept: 'application/json' } });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}：${text.slice(0, 120)}`);
    return text;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error('等待超时（20秒没有响应）');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// 数据集里的一个号码字段，可能是数组，也可能是用 ; 分隔的文字，统一转成文字数组
function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter((x) => x !== '');
  if (typeof v === 'string') return v.split(/[;,\s]+/).map((x) => x.trim()).filter((x) => x !== '');
  if (typeof v === 'number') return [String(v)];
  return [];
}

export function mapDataset(row: unknown): RawDraw | null {
  const o = asObj(row);
  const date = String(o.draw_date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const opt = (v: unknown) => {
    const l = toList(v);
    return l.length > 0 ? l : undefined;
  };
  return {
    date,
    first: toList(o.first_prize)[0],
    near: opt(o.near_first_prize),
    prize2: opt(o.second_prize),
    prize3: opt(o.third_prize),
    prize4: opt(o.fourth_prize),
    prize5: opt(o.fifth_prize),
    front3: opt(o.front_three_digits),
    back3: opt(o.last_three_digits),
    back2: opt(o.last_two_digits),
  };
}

// 同一次请求里只下载一次（文件约一两兆）
let cache: { at: number; rows: RawDraw[] } | null = null;

async function loadOne(url: string): Promise<RawDraw[]> {
  const text = await getText(url);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`返回的不是JSON：${text.slice(0, 80)}`);
  }
  const arr = Array.isArray(json) ? json : asObj(json).draws;
  if (!Array.isArray(arr)) throw new Error('数据格式变了：找不到 draws 列表');
  const rows: RawDraw[] = [];
  for (const r of arr) {
    const m = mapDataset(r);
    if (m) rows.push(m);
  }
  if (rows.length === 0) throw new Error('数据集里没有读到任何一期');
  rows.sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1)); // 新的在前
  return rows;
}


// ---------- 第三个来源：Sanook 开奖页（开奖当天就有） ----------
// 数据集更新慢，所以数据集里还没有的最近一期，直接读 Sanook 的开奖页补上。
// 页面地址规律：news.sanook.com/lotto/check/日月佛历年，例如 2026-11-01 → 01112569。
// 解析按"奖项标题 + 号码个数"严格核对，核对不上就当作没读到（宁可不写，也不写错）。

const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export function sanookUrl(date: string): string {
  const [y, m, d] = date.split('-');
  return `https://news.sanook.com/lotto/check/${d}${m}${Number(y) + 543}/`;
}

export function parseSanook(html: string, date: string): RawDraw {
  const [y, m, d] = date.split('-').map(Number);
  const dateText = `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
  if (!html.includes(dateText)) throw new Error(`页面里没有找到日期 ${dateText}（可能还没开奖）`);

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  // 奖项标题（"头奖前后各一号"要放在"头奖"前面匹配）
  const marker =
    /(รางวัลข้างเคียงรางวัลที่\s*1)|(รางวัลที่\s*1(?!\d))|(รางวัลที่\s*2(?!\d))|(รางวัลที่\s*3(?!\d))|(รางวัลที่\s*4(?!\d))|(รางวัลที่\s*5(?!\d))|(เลขหน้า\s*3\s*ตัว)|(เลขท้าย\s*3\s*ตัว)|(เลขท้าย\s*2\s*ตัว)/g;
  const keys = ['near', 'first', 'prize2', 'prize3', 'prize4', 'prize5', 'front3', 'back3', 'back2'] as const;
  const spec: Record<(typeof keys)[number], { len: number; count: number }> = {
    near: { len: 6, count: 2 },
    first: { len: 6, count: 1 },
    prize2: { len: 6, count: 5 },
    prize3: { len: 6, count: 10 },
    prize4: { len: 6, count: 50 },
    prize5: { len: 6, count: 100 },
    front3: { len: 3, count: 2 },
    back3: { len: 3, count: 2 },
    back2: { len: 2, count: 1 },
  };

  const hits: { key: (typeof keys)[number]; start: number; end: number }[] = [];
  for (const mt of text.matchAll(marker)) {
    const idx = mt.slice(1).findIndex((g) => g !== undefined);
    hits.push({ key: keys[idx], start: mt.index! + mt[0].length, end: text.length });
  }
  hits.forEach((h, i) => {
    if (i + 1 < hits.length) h.end = hits[i + 1].start;
  });

  const out: Record<string, string[]> = {};
  for (const h of hits) {
    if (out[h.key]) continue;
    const sp = spec[h.key];
    const seg = text.slice(h.start, h.end).replace(/\d{1,3}(,\d{3})+/g, ' '); // 去掉金额
    const nums = seg.match(new RegExp(`(?<![\\d,])\\d{${sp.len}}(?![\\d,])`, 'g')) ?? [];
    if (nums.length === sp.count && new Set(nums).size === nums.length) out[h.key] = nums;
  }
  const missing = keys.filter((k) => !out[k]);
  if (missing.length > 0) throw new Error(`页面格式核对没通过，没读到：${missing.join('、')}`);
  return {
    date,
    first: out.first[0],
    near: out.near,
    prize2: out.prize2,
    prize3: out.prize3,
    prize4: out.prize4,
    prize5: out.prize5,
    front3: out.front3,
    back3: out.back3,
    back2: out.back2,
  };
}

async function fetchSanook(date: string): Promise<RawDraw> {
  return parseSanook(await getText(sanookUrl(date)), date);
}

// 曼谷今天的日期
function bangkokToday(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

// 数据集最新一期之后、今天之前（含今天）的开奖日（每月 1 日、16 日）
export function missingDrawDates(latest: string): string[] {
  const today = bangkokToday();
  const out: string[] = [];
  const [ly, lm] = latest.split('-').map(Number);
  for (let k = 0; k < 4; k++) {
    const mm = lm - 1 + k;
    const y = ly + Math.floor(mm / 12);
    const m = (mm % 12) + 1;
    for (const d of [1, 16]) {
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (iso > latest && iso <= today) out.push(iso);
    }
  }
  return out;
}

let lastUsed = '';

async function loadAll(): Promise<RawDraw[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows;
  const results = await Promise.allSettled(DATA_URLS.map((u) => loadOne(u)));
  let best: RawDraw[] | null = null;
  let bestUrl = '';
  const errors: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      if (!best || (r.value[0]?.date ?? '') > (best[0]?.date ?? '')) {
        best = r.value;
        bestUrl = DATA_URLS[i];
      }
    } else {
      errors.push(`${new URL(DATA_URLS[i]).host}：${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  });
  if (!best) throw new Error(errors.join('；') || '两个数据地址都打不开');
  lastUsed = new URL(bestUrl).host;
  let rows: RawDraw[] = best;
  // 数据集里还没有的最近几期，去 Sanook 补（读不到就跳过，不影响其他）
  const latest = rows[0]?.date ?? '';
  if (latest) {
    const extra: RawDraw[] = [];
    for (const dt of missingDrawDates(latest)) {
      try {
        extra.push(await fetchSanook(dt));
      } catch {
        /* 还没开奖或页面格式变了：跳过 */
      }
    }
    if (extra.length > 0) {
      rows = [...extra, ...rows].sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));
      lastUsed += ' + news.sanook.com';
    }
  }
  cache = { at: Date.now(), rows };
  return rows;
}

// 保持和原来一样的用法：第1页 = 全部期号（新的在前），第2页起为空
export async function fetchList(page: number): Promise<ListItem[]> {
  if (page > 1) return [];
  return (await loadAll()).map((r) => ({ id: r.date ?? '', date: r.date ?? '' }));
}

export async function fetchDraw(id: string): Promise<RawDraw> {
  const hit = (await loadAll()).find((r) => r.date === id);
  if (!hit) throw new Error(`数据集里没有 ${id} 这一期`);
  return hit;
}

// 检测：从你的服务器实际去试一遍，返回每一步的结果（给【管理】页显示）
export interface CheckStep {
  name: string;
  ok: boolean;
  detail: string;
}

export async function checkSource(): Promise<CheckStep[]> {
  const steps: CheckStep[] = [];

  // 两个地址各试一次，分别报告（排查"为什么没拿到最新一期"用）
  const probes = await Promise.allSettled(DATA_URLS.map((u) => loadOne(u)));
  // Sanook 开奖页：用最近一个应该已开奖的日期试读
  {
    const cand = missingDrawDates('2026-10-16').pop() ?? '2026-11-01';
    try {
      const raw = await fetchSanook(cand);
      steps.push({ name: `地址 news.sanook.com（${cand}）`, ok: true, detail: `能读到并通过核对：头奖 ${raw.first}；前三 ${raw.front3?.join('/')}；后三 ${raw.back3?.join('/')}；后二 ${raw.back2?.join('/')}；二到五等奖号码数 ${raw.prize2?.length}/${raw.prize3?.length}/${raw.prize4?.length}/${raw.prize5?.length}` });
    } catch (err) {
      steps.push({ name: `地址 news.sanook.com（${cand}）`, ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
  }
  probes.forEach((r, i) => {
    const host = new URL(DATA_URLS[i]).host;
    if (r.status === 'fulfilled') {
      steps.push({ name: `地址 ${host}`, ok: true, detail: `能打开，共 ${r.value.length} 期，最新一期是 ${r.value[0]?.date}` });
    } else {
      steps.push({ name: `地址 ${host}`, ok: false, detail: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    }
  });

  let firstId: string | null = null;
  try {
    const items = await fetchList(1);
    if (items.length === 0) {
      steps.push({ name: '下载开奖数据集', ok: false, detail: '能连上，但没有读到任何期号（格式可能变了）' });
    } else {
      firstId = items[0].id;
      steps.push({
        name: '下载开奖数据集',
        ok: true,
        detail: `成功（来自 ${lastUsed}），共 ${items.length} 期，最新一期是 ${items[0].date}`,
      });
    }
  } catch (err) {
    steps.push({ name: '下载开奖数据集', ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  if (firstId) {
    try {
      const raw = await fetchDraw(firstId);
      const got = [
        raw.first ? `头奖 ${raw.first}` : '没读到头奖',
        raw.front3?.length ? `前三 ${raw.front3.join('/')}` : '没读到前三',
        raw.back3?.length ? `后三 ${raw.back3.join('/')}` : '没读到后三',
        raw.back2?.length ? `后二 ${raw.back2.join('/')}` : '没读到后二',
        `二到五等奖号码数：${raw.prize2?.length ?? 0}/${raw.prize3?.length ?? 0}/${raw.prize4?.length ?? 0}/${raw.prize5?.length ?? 0}`,
      ];
      const ok = !!raw.first && raw.front3?.length === 2 && raw.back3?.length === 2 && raw.back2?.length === 1;
      steps.push({ name: `读取 ${raw.date} 这一期的详细结果`, ok, detail: got.join('；') });
    } catch (err) {
      steps.push({ name: '读取最新一期的详细结果', ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
  }
  return steps;
}

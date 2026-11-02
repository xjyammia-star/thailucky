// 自动获取开奖数据的"来源"（内部用，不是接口）。
// 来源：开源数据集 huayreview/thai-lottery-results（原站 huayreview.net 与 GitHub 副本，整理自泰国政府彩票局官方结果，CC BY 4.0 许可，
// 使用时需注明出处，页面底部已标注）。它是一个静态 JSON 文件，比第三方接口稳定得多。
// 它由作者定期更新，所以刚开奖后可能晚几天才有；这时可以在【管理】页用 md 导入补上。
// 哪天它停更或改了格式，【管理】页的"检测数据源"会告诉我们原因，换来源只需要改这个文件。

import type { RawDraw } from './_draws.js';

// 同一份数据有两个地址：原站更新最及时（开奖当天就有），GitHub 副本有时晚几天。
// 两个都去取，用"期数更新"的那个；其中一个打不开也没关系。
const DATA_URLS = [
  'https://huayreview.net/data/thai-lottery-results.json',
  'https://raw.githubusercontent.com/huayreview/thai-lottery-results/main/thai-lottery-results.json',
];

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
  cache = { at: Date.now(), rows: best };
  return best;
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
  // 探测 Sanook 页面（试验：看服务器能不能读到、页面里有没有号码）
  try {
    const html = await getText('https://news.sanook.com/lotto/check/01112569/');
    const title = (/<title>([^<]{0,80})/.exec(html)?.[1] ?? '没有标题').trim();
    const sixes = (html.match(/(?<!\d)\d{6}(?!\d)/g) ?? []).length;
    steps.push({ name: '试验：Sanook 2026-11-01 页面', ok: sixes > 100, detail: `能打开，页面 ${html.length} 字符，标题「${title}」，其中 6 位数字 ${sixes} 个，含头奖 423224：${html.includes('423224') ? '是' : '否'}` });
  } catch (err) {
    steps.push({ name: '试验：Sanook 2026-11-01 页面', ok: false, detail: err instanceof Error ? err.message : String(err) });
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

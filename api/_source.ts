// 自动获取开奖数据的"来源"（内部用，不是接口）。
// 目前只接了一个开源接口：lotto.api.rayriffy.com（它的数据来自 Sanook 网站）。
// 这个接口是第三方维护的，哪天停了或改了格式，【管理】页的"检测数据源"会告诉我们原因，
// 到时换来源只需要改这个文件，其他部分不受影响。

import type { RawDraw } from './_draws.js';

const BASE = 'https://lotto.api.rayriffy.com';

export interface ListItem {
  id: string; // 例如 16102559（日月佛历年）
  date: string; // 例如 2016-10-16
}

async function getJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}：${text.slice(0, 120)}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`返回的不是JSON：${text.slice(0, 120)}`);
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error('等待超时（8秒没有响应）');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// "16102559" → "2016-10-16"（泰国佛历年 - 543 = 公历年）
export function idToDate(id: string): string | null {
  const m = /^(\d{2})(\d{2})(\d{4})$/.exec(id);
  if (!m) return null;
  const year = Number(m[3]) - 543;
  return `${year}-${m[2]}-${m[1]}`;
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});

// 取列表的某一页（新的在前）
export async function fetchList(page: number): Promise<ListItem[]> {
  const data = asObj(await getJson(`${BASE}/list/${page}`));
  const arr = Array.isArray(data.response) ? data.response : [];
  const items: ListItem[] = [];
  for (const it of arr) {
    const id = String(asObj(it).id ?? '');
    const date = idToDate(id);
    if (date) items.push({ id, date });
  }
  return items;
}

// 把接口返回的"一期结果"转成标准的原始格式
export function mapRayriffy(data: unknown, date: string): RawDraw {
  const resp = asObj(asObj(data).response);
  const raw: RawDraw = { date };

  const take = (list: unknown, matcher: (id: string) => boolean): string[] | undefined => {
    if (!Array.isArray(list)) return undefined;
    for (const p of list) {
      const o = asObj(p);
      const id = String(o.id ?? '').toLowerCase();
      if (matcher(id) && Array.isArray(o.number)) return o.number.map((n) => String(n));
    }
    return undefined;
  };

  const prizes = resp.prizes;
  const running = resp.runningNumbers;

  raw.first = take(prizes, (id) => id.includes('first') && !id.includes('near'))?.[0];
  raw.near = take(prizes, (id) => id.includes('near'));
  raw.prize2 = take(prizes, (id) => id.includes('second'));
  raw.prize3 = take(prizes, (id) => id.includes('third'));
  raw.prize4 = take(prizes, (id) => id.includes('fourth') || id.includes('forth'));
  raw.prize5 = take(prizes, (id) => id.includes('fifth'));
  raw.front3 = take(running, (id) => id.includes('frontthree'));
  raw.back3 = take(running, (id) => id.includes('backthree'));
  raw.back2 = take(running, (id) => id.includes('backtwo'));
  return raw;
}

export async function fetchDraw(id: string): Promise<RawDraw> {
  const date = idToDate(id);
  if (!date) throw new Error(`无法识别的期号：${id}`);
  const data = await getJson(`${BASE}/lotto/${id}`);
  return mapRayriffy(data, date);
}

// 检测：从你的服务器实际去试一遍，返回每一步的结果（给【管理】页显示）
export interface CheckStep {
  name: string;
  ok: boolean;
  detail: string;
}

export async function checkSource(): Promise<CheckStep[]> {
  const steps: CheckStep[] = [];

  let firstId: string | null = null;
  try {
    const items = await fetchList(1);
    if (items.length === 0) {
      steps.push({ name: '读取开奖列表', ok: false, detail: '接口能连上，但没有返回任何期号（格式可能变了）' });
    } else {
      firstId = items[0].id;
      steps.push({
        name: '读取开奖列表',
        ok: true,
        detail: `成功，第1页有 ${items.length} 期，最新一期是 ${items[0].date}`,
      });
    }
  } catch (err) {
    steps.push({ name: '读取开奖列表', ok: false, detail: err instanceof Error ? err.message : String(err) });
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

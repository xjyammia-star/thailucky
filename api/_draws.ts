// 开奖数据的公共工具（内部用，不是接口）：整理、检查、保存、读取一期开奖结果。

import type { getDb } from './_db.js';

type Sql = ReturnType<typeof getDb>;

// 一期开奖结果（整理后的标准格式）
export interface Draw {
  date: string; // 例如 2026-10-16
  first: string; // 头奖 6 位
  near: string[]; // 头奖前后各一号（2 个）
  front3: string[]; // 前三位（2 组）
  back3: string[]; // 后三位（2 组）
  back2: string; // 后两位（1 组）
  prize2: string[] | null; // 二等奖 5 个
  prize3: string[] | null; // 三等奖 10 个
  prize4: string[] | null; // 四等奖 50 个
  prize5: string[] | null; // 五等奖 100 个
}

// 外部来源（接口 / md 文件）解析出来的"原始结果"，字段可能缺失
export interface RawDraw {
  date?: string;
  first?: string;
  near?: string[];
  front3?: string[];
  back3?: string[];
  back2?: string[];
  prize2?: string[];
  prize3?: string[];
  prize4?: string[];
  prize5?: string[];
}

export const PRIZE_COUNTS = { prize2: 5, prize3: 10, prize4: 50, prize5: 100 } as const;
const PRIZE_NAMES = { prize2: '二等奖', prize3: '三等奖', prize4: '四等奖', prize5: '五等奖' } as const;

// 头奖号码前一个和后一个（000000 的前一个是 999999，999999 的后一个是 000000）
export function nearOf(first: string): string[] {
  const n = parseInt(first, 10);
  const prev = (n + 999999) % 1000000;
  const next = (n + 1) % 1000000;
  return [String(prev).padStart(6, '0'), String(next).padStart(6, '0')];
}

function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const allMatch = (arr: string[], re: RegExp) => arr.every((x) => re.test(x));

// 检查并整理一期原始结果。
// errors 非空 = 这期不能保存；warnings = 能保存，但有需要提醒的地方。
export function finalizeDraw(raw: RawDraw): { draw?: Draw; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw.date || !isRealDate(raw.date)) errors.push('没有识别到有效的开奖日期');
  if (!raw.first || !/^\d{6}$/.test(raw.first)) errors.push('没有识别到头奖（需要6位数字）');
  if (!raw.front3 || raw.front3.length !== 2 || !allMatch(raw.front3, /^\d{3}$/)) {
    errors.push('前三位奖需要2组3位数字');
  }
  if (!raw.back3 || raw.back3.length !== 2 || !allMatch(raw.back3, /^\d{3}$/)) {
    errors.push('后三位奖需要2组3位数字');
  }
  if (!raw.back2 || raw.back2.length !== 1 || !allMatch(raw.back2, /^\d{2}$/)) {
    errors.push('后两位奖需要1组2位数字');
  }
  if (errors.length > 0) return { errors, warnings };

  const first = raw.first as string;
  const computedNear = nearOf(first);
  const near = computedNear;
  if (raw.near && raw.near.length === 2 && allMatch(raw.near, /^\d{6}$/)) {
    if ([...raw.near].sort().join() !== [...computedNear].sort().join()) {
      warnings.push('头奖前后各一号与头奖不匹配，已按头奖重新计算');
    }
  }

  const draw: Draw = {
    date: raw.date as string,
    first,
    near,
    front3: raw.front3 as string[],
    back3: raw.back3 as string[],
    back2: (raw.back2 as string[])[0],
    prize2: null,
    prize3: null,
    prize4: null,
    prize5: null,
  };

  const missing: string[] = [];
  for (const key of ['prize2', 'prize3', 'prize4', 'prize5'] as const) {
    const list = raw[key];
    const need = PRIZE_COUNTS[key];
    if (!list || list.length === 0) {
      missing.push(PRIZE_NAMES[key]);
    } else if (list.length !== need || !allMatch(list, /^\d{6}$/)) {
      warnings.push(`${PRIZE_NAMES[key]}应有${need}个6位号码，实际识别到${list.length}个，已忽略这一项`);
      missing.push(PRIZE_NAMES[key]);
    } else {
      draw[key] = list;
    }
  }
  if (missing.length > 0) {
    warnings.push(`${missing.join('、')}没有完整数据，这一期只能对头奖、邻号、前三、后三、后两位`);
  }
  return { draw, errors, warnings };
}

// 保存一期（同一天已有就覆盖更新）
export async function saveDraw(sql: Sql, d: Draw, source: 'api' | 'import') {
  const join = (a: string[] | null) => (a ? a.join(',') : null);
  await sql`
    INSERT INTO draws (draw_date, first_prize, near_first, front3, back3, back2,
                       prize2, prize3, prize4, prize5, source, updated_at)
    VALUES (${d.date}, ${d.first}, ${join(d.near)}, ${join(d.front3)}, ${join(d.back3)}, ${d.back2},
            ${join(d.prize2)}, ${join(d.prize3)}, ${join(d.prize4)}, ${join(d.prize5)}, ${source}, now())
    ON CONFLICT (draw_date) DO UPDATE SET
      first_prize = EXCLUDED.first_prize,
      near_first = EXCLUDED.near_first,
      front3 = EXCLUDED.front3,
      back3 = EXCLUDED.back3,
      back2 = EXCLUDED.back2,
      prize2 = EXCLUDED.prize2,
      prize3 = EXCLUDED.prize3,
      prize4 = EXCLUDED.prize4,
      prize5 = EXCLUDED.prize5,
      source = EXCLUDED.source,
      updated_at = now()
  `;
}

// 数据库一行 → 标准格式
export function rowToDraw(r: Record<string, unknown>): Draw {
  const split = (v: unknown): string[] | null => (v ? String(v).split(',') : null);
  return {
    date: r.draw_date as string,
    first: r.first_prize as string,
    near: split(r.near_first) as string[],
    front3: split(r.front3) as string[],
    back3: split(r.back3) as string[],
    back2: r.back2 as string,
    prize2: split(r.prize2),
    prize3: split(r.prize3),
    prize4: split(r.prize4),
    prize5: split(r.prize5),
  };
}

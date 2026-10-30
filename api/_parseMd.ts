// 把你整理的 md 文档解析成开奖结果（内部用，不是接口）。
// 支持的格式就是你 Obsidian 里那份"泰国政府彩票_2016-10-16_中奖结果.md"的样子：
//   - 标题或"开奖日期"一行里有日期，例如 2016年10月16日（也认 2016-10-16）
//   - "主要奖项"表格里有 一等奖 / 前3位奖 / 后3位奖 / 后2位奖 / 一等奖相邻奖 各一行
//   - 二等奖、三等奖、四等奖、五等奖各有一个标题，下面是一堆 6 位号码
// 一个文件里可以放很多期：每一期用一个以 "# " 开头、带日期的一级标题隔开。
// 二到五等奖缺失也没关系，只是那一期就不能对这几个奖。

import type { RawDraw } from './_draws.js';

export interface ParsedBlock {
  raw: RawDraw;
  title: string;
}

const DATE_CN = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
const DATE_ISO = /(\d{4})-(\d{1,2})-(\d{1,2})/;

function pad2(n: string): string {
  return n.padStart(2, '0');
}

function findDate(text: string): string | undefined {
  // 优先找"开奖日期：…"这一行
  const line = text.split('\n').find((l) => l.includes('开奖日期'));
  for (const src of [line, text]) {
    if (!src) continue;
    const m = src.match(DATE_CN);
    if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
    const m2 = src.match(DATE_ISO);
    if (m2) return `${m2[1]}-${pad2(m2[2])}-${pad2(m2[3])}`;
  }
  return undefined;
}

// 去掉金额（如 3,000,000）和"奖金/泰铢"之类，避免把金额当成号码
function stripAmounts(s: string): string {
  return s.replace(/\d{1,3}(,\d{3})+/g, ' ');
}

// 从一行里取出指定位数的数字串（先去掉行首的奖项名称）
function digitsAfterLabel(line: string, labelRe: RegExp, len: number): string[] {
  const m = line.match(labelRe);
  const rest = m ? line.slice((m.index ?? 0) + m[0].length) : line;
  const cleaned = stripAmounts(rest);
  const all = cleaned.match(/\d+/g) ?? [];
  return all.filter((x) => x.length === len);
}

const NEAR_RE = /(一等奖|头奖)\s*(的)?\s*(相邻|邻近|前后|旁边|邻号)(奖)?/;
const FIRST_RE = /(一等奖|头奖|第一奖)/;
const FRONT3_RE = /前\s*(3|三)\s*位(奖)?/;
const BACK3_RE = /后\s*(3|三)\s*位(奖)?/;
const BACK2_RE = /后\s*(2|二|两)\s*位(奖)?/;

const SECTION_RES: [keyof RawDraw, RegExp][] = [
  ['prize2', /^#{1,6}\s*(二等奖|第二奖|二奖)/],
  ['prize3', /^#{1,6}\s*(三等奖|第三奖|三奖)/],
  ['prize4', /^#{1,6}\s*(四等奖|第四奖|四奖)/],
  ['prize5', /^#{1,6}\s*(五等奖|第五奖|五奖)/],
];

function parseBlock(text: string): RawDraw {
  const raw: RawDraw = { date: findDate(text) };
  const lines = text.split('\n');

  // 1) 主要奖项：逐行找，第一次找到合格数字就采用（后面"奖项汇总"表里的同名行会被忽略）
  for (const line of lines) {
    if (line.trim().startsWith('#')) continue;

    if (!raw.near && NEAR_RE.test(line)) {
      const nums = digitsAfterLabel(line, NEAR_RE, 6);
      if (nums.length === 2) raw.near = nums;
      continue;
    }
    if (!raw.first && FIRST_RE.test(line) && !NEAR_RE.test(line)) {
      const nums = digitsAfterLabel(line, FIRST_RE, 6);
      if (nums.length >= 1) raw.first = nums[0];
      continue;
    }
    if (!raw.front3 && FRONT3_RE.test(line)) {
      const nums = digitsAfterLabel(line, FRONT3_RE, 3);
      if (nums.length >= 1) raw.front3 = nums;
      continue;
    }
    if (!raw.back3 && BACK3_RE.test(line)) {
      const nums = digitsAfterLabel(line, BACK3_RE, 3);
      if (nums.length >= 1) raw.back3 = nums;
      continue;
    }
    if (!raw.back2 && BACK2_RE.test(line)) {
      const nums = digitsAfterLabel(line, BACK2_RE, 2);
      if (nums.length >= 1) raw.back2 = nums;
      continue;
    }
  }

  // 2) 二到五等奖：找到对应标题，收集标题到下一个标题之间所有 6 位号码
  for (let i = 0; i < lines.length; i++) {
    for (const [key, re] of SECTION_RES) {
      if (!re.test(lines[i].trim())) continue;
      const nums: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (/^#{1,6}\s/.test(lines[j].trim())) break;
        if (/奖金|泰铢/.test(lines[j])) continue; // 金额行不是号码
        const found = stripAmounts(lines[j]).match(/(?<!\d)\d{6}(?!\d)/g);
        if (found) nums.push(...found);
      }
      if (!(raw[key] as string[] | undefined)) (raw as Record<string, unknown>)[key] = nums;
    }
  }
  return raw;
}

// 把整份文档拆成"一期一块"再逐个解析
export function parseDrawMarkdown(text: string): ParsedBlock[] {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  // 找出所有"带日期的一级标题"的位置，作为每一期的开头
  const starts: number[] = [];
  lines.forEach((l, i) => {
    if (/^#\s/.test(l) && (DATE_CN.test(l) || DATE_ISO.test(l))) starts.push(i);
  });

  const blocks: string[] = [];
  if (starts.length === 0) {
    blocks.push(normalized);
  } else {
    starts.forEach((s, idx) => {
      const end = idx + 1 < starts.length ? starts[idx + 1] : lines.length;
      blocks.push(lines.slice(s, end).join('\n'));
    });
  }

  return blocks.map((b) => ({
    raw: parseBlock(b),
    title: (b.split('\n').find((l) => l.trim()) ?? '').replace(/^#+\s*/, '').slice(0, 60),
  }));
}

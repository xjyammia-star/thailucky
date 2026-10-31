// 八字五行计算（只用于娱乐性的"五行偏向"，不是严肃命理排盘）
// 规则（已和你确认的默认）：
//  - 月柱按节气换月；23:00 之后算第二天的日柱（晚子时算次日）；
//  - 出生地经度折算"真太阳时"（只做经度修正，不含均时差，误差在十几分钟内）；
//  - 喜用神按"扶抑法"：日主偏强就喜欢"泄、耗、克"的五行，偏弱就喜欢"生、扶"的五行；
//  - 你在设置里手动填了喜用五行，就以你填的为准。

import { Solar } from 'lunar-javascript';

export type Element = '金' | '木' | '水' | '火' | '土';
export const ELEMENTS: Element[] = ['木', '火', '土', '金', '水'];

const STEM_EL: Record<string, Element> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};
const BRANCH_EL: Record<string, Element> = {
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
};

// 五行相生：木→火→土→金→水→木
const GENERATES: Record<Element, Element> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
// 五行相克：木克土、土克水、水克火、火克金、金克木
const CONTROLS: Record<Element, Element> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

// 河图五行数
export const HETU_DIGITS: Record<Element, number[]> = {
  水: [1, 6], 火: [2, 7], 木: [3, 8], 金: [4, 9], 土: [5, 0],
};

export interface BaziInput {
  birthDate: string; // YYYY-MM-DD
  birthHour: number | null;
  birthMinute: number | null;
  birthLongitude: number | null;
  birthCity: string | null;
  manualElements: string[];
}

export interface BaziResult {
  pillars: string[]; // 年月日(时)
  hasHour: boolean;
  adjustedTime: string | null; // 真太阳时（有出生时间时）
  dayMaster: Element;
  counts: Record<Element, number>;
  strength: '偏强' | '偏弱';
  favorable: Element[];
  source: '手动设置' | '自动推算';
  note: string;
}

const THAI_CITIES = ['曼谷', '清迈', '普吉', '芭堤雅'];

function standardMeridian(city: string | null, lon: number): number {
  // 自己填写的城市，保存格式是"城市名|时区"（例如 "拉萨|8"），时区×15 就是标准经线
  const m = city ? /\|(-?\d{1,2})$/.exec(city) : null;
  if (m) return Number(m[1]) * 15;
  if (city && THAI_CITIES.includes(city)) return 105;
  if (city && city !== '其他') return 120; // 列表里其余城市在中国/港台/新马，时区都是 UTC+8
  return lon < 112.5 ? 105 : 120; // 旧数据里没填城市名的手填经度：粗略判断
}

export function computeBazi(input: BaziInput): BaziResult {
  const [y, m, d] = input.birthDate.split('-').map(Number);
  const hasHour = input.birthHour !== null;
  let hour = input.birthHour ?? 12;
  let minute = input.birthMinute ?? 0;
  let adjustedTime: string | null = null;

  let ymd = new Date(Date.UTC(y, m - 1, d));
  if (hasHour && input.birthLongitude !== null) {
    const shift = Math.round((input.birthLongitude - standardMeridian(input.birthCity, input.birthLongitude)) * 4);
    const total = hour * 60 + minute + shift;
    const dayShift = Math.floor(total / 1440);
    const inDay = total - dayShift * 1440;
    ymd = new Date(ymd.getTime() + dayShift * 86400000);
    hour = Math.floor(inDay / 60);
    minute = inDay % 60;
    adjustedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  } else if (hasHour) {
    adjustedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  const solar = Solar.fromYmdHms(ymd.getUTCFullYear(), ymd.getUTCMonth() + 1, ymd.getUTCDate(), hour, minute, 0);
  const ec = solar.getLunar().getEightChar();
  ec.setSect(1); // 晚子时（23点后）日柱算次日

  const pillars = [ec.getYear(), ec.getMonth(), ec.getDay()];
  if (hasHour) pillars.push(ec.getTime());

  const counts: Record<Element, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  pillars.forEach((p, i) => {
    counts[STEM_EL[p[0]]] += 1; // 天干
    counts[BRANCH_EL[p[1]]] += i === 1 ? 2 : 1; // 月令地支力量加倍
  });

  const dm = STEM_EL[ec.getDayGan()];
  const printer = ELEMENTS.find((e) => GENERATES[e] === dm)!; // 生我（印）
  const self = counts[dm] + counts[printer];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const strength: '偏强' | '偏弱' = self * 2 >= total ? '偏强' : '偏弱';

  const output = GENERATES[dm]; // 我生（食伤）
  const wealth = CONTROLS[dm]; // 我克（财）
  const officer = ELEMENTS.find((e) => CONTROLS[e] === dm)!; // 克我（官杀）
  let auto: Element[] = strength === '偏强' ? [output, wealth, officer] : [printer, dm];
  // 取其中在命盘里最缺的两个，让结果更有指向
  auto = [...auto].sort((a, b) => counts[a] - counts[b]).slice(0, 2);

  const manual = input.manualElements.filter((e): e is Element => (ELEMENTS as string[]).includes(e));
  const favorable = manual.length > 0 ? manual : auto;

  return {
    pillars,
    hasHour,
    adjustedTime,
    dayMaster: dm,
    counts,
    strength,
    favorable,
    source: manual.length > 0 ? '手动设置' : '自动推算',
    note: hasHour ? '' : '没有填写出生时间，时柱未计入，结果更粗略。',
  };
}

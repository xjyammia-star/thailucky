// 选号页：八字五行 + 生成号码（指定数字 / 纯随机）+ 历史批次（标记实际购买、买票提示）

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.ts';
import { getNextDraw } from './draw.ts';
import { baht } from './prizes.ts';

interface ScoreUnit {
  label: string;
  credit: number;
  ok: boolean;
}

interface ScoreResult {
  input: string;
  covered: string;
  overall: number;
  best: string;
  components: { key: string; label: string; pct: number; units: ScoreUnit[] }[];
  unavailable: string[];
}

interface Hex {
  upper: number;
  lower: number;
  name: string;
}

interface Meihua {
  nums: number[];
  shichen: string;
  moving: number;
  ben: Hex;
  hu: Hex;
  bian: Hex;
  tiSide: string;
  ti: string;
  tiElement: string;
  relations: { who: string; trigram: string; element: string; relation: string; verdict: string }[];
}

interface Win {
  key: string;
  label: string;
  amount: number | null;
}

interface PickItem {
  id: number;
  number: string;
  bought: boolean;
  result: { wins: Win[]; total: number; incomplete: boolean } | null;
}

interface Group {
  count: number;
  checked: number;
  winners: number;
  total: number;
}

interface Batch {
  id: number;
  method: string;
  targetDraw: string;
  drawDate: string | null;
  state: 'checked' | 'waiting' | 'nodata';
  params: { lucky?: number; favorable?: string[]; usedBazi?: boolean; clock?: string; meihua?: Meihua; hotBack2?: string[]; mode?: 'hot' | 'cold'; tails?: string[]; posDigits?: number[][]; basedOn?: number; months?: number };
  createdAt: string;
  picks: PickItem[];
}

const METHODS: { key: 'meihua' | 'lucky' | 'score' | 'analysis'; name: string; hint: string }[] = [
  { key: 'meihua', name: '命理选号', hint: '依次随意填写3个0-9的数字，根据玄学生成号码' },
  { key: 'lucky', name: '指定数字', hint: '指定一个0-99的数字，其余按你的五行补全' },
  { key: 'analysis', name: '分析选号', hint: '按历史开奖统计，选出现次数最多（热号）或最少（冷号）的数字' },
  { key: 'score', name: '选号评分', hint: '输入摊位上看中的号码，评估它和系统选号的匹配度' },
];

const METHOD_NAME: Record<string, string> = { random: '纯随机', score: '选号评分', lucky: '指定数字', meihua: '命理选号', analysis: '分析选号', hot: '统计热号', manual: '手动录入' };

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    timeZone: 'Asia/Bangkok',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RangeChips({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return (
    <>
      <label>按哪段时间的开奖数据统计</label>
      <div className="chips">
        {[
          { m: 6, t: '最近半年' },
          { m: 12, t: '最近一年' },
          { m: 24, t: '最近两年' },
          { m: 0, t: '全部（2021年起）' },
        ].map((r) => (
          <button key={r.m} className={`chip ${value === r.m ? 'on' : ''}`} onClick={() => onChange(r.m)}>
            {r.t}
          </button>
        ))}
      </div>
    </>
  );
}

function ScoreView({ r }: { r: ScoreResult }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ textAlign: 'center' }}>
        <div className="muted">{r.input}（{r.covered}）的最高匹配度</div>
        <div className="num-big">{r.overall.toFixed(1)}%</div>
        {r.best && <div className="muted">来自：{r.best}</div>}
      </div>
      {r.components.map((c) => (
        <div key={c.key} style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <b>{c.label}</b>
            <b>{c.pct.toFixed(1)}%</b>
          </div>
          <div style={{ background: 'var(--line)', borderRadius: 4, height: 8, marginTop: 4 }}>
            <div style={{ width: `${c.pct}%`, background: 'var(--gold)', height: 8, borderRadius: 4 }} />
          </div>
          <div className="nums" style={{ marginTop: 6 }}>
            {c.units.map((u) => (
              <span key={u.label} style={{ opacity: u.ok ? 1 : 0.6 }}>{u.ok ? '✓' : '○'} {u.label}</span>
            ))}
          </div>
        </div>
      ))}
      {r.unavailable.map((t) => (
        <p key={t} className="muted">· {t}</p>
      ))}
      <p className="muted" style={{ marginTop: 10 }}>
        匹配度表示这个号码和系统选号规则有多相似，100% 就是系统自己也会选出的号码。它不代表中奖概率，每个号码的中奖概率完全一样。
      </p>
    </div>
  );
}

function clockText(): string {
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const h = Number(t.slice(0, 2)) % 24;
  const name = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'][Math.floor(((h + 1) % 24) / 2)];
  return `${t} · ${name}时`;
}

function MeihuaInfo({ m }: { m: Meihua }) {
  return (
    <div className="muted" style={{ margin: '6px 0' }}>
      <div>
        起卦数 {m.nums.join(' ')} · {m.shichen}时 · 动{['初', '二', '三', '四', '五', '上'][m.moving - 1]}爻
      </div>
      <div>
        本卦 <b>{m.ben.name}</b> → 互卦 <b>{m.hu.name}</b> → 变卦 <b>{m.bian.name}</b>
      </div>
      <div>
        体卦：{m.tiSide}{m.ti}（{m.tiElement}）　
        {m.relations.map((r) => `${r.who}${r.trigram}${r.relation}（${r.verdict}）`).join('；')}
      </div>
    </div>
  );
}

function SummaryRow({ title, g }: { title: string; g: Group }) {
  return (
    <p>
      <b>{title}</b>：{g.count} 个，已对奖 {g.checked} 个，中奖 {g.winners} 个
      {g.total > 0 && <>，奖金合计 <b style={{ color: 'var(--red)' }}>{baht(g.total)}</b></>}
    </p>
  );
}

export default function Pick() {
  const next = useMemo(() => getNextDraw(), []);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [summary, setSummary] = useState<{ bought: Group; all: Group } | null>(null);
  const [method, setMethod] = useState<'lucky' | 'score' | 'meihua' | 'analysis'>('meihua');
  const [count, setCount] = useState(5);
  const [lucky, setLucky] = useState('');
  const [hotMonths, setHotMonths] = useState(12);
  const [scoreInput, setScoreInput] = useState('');
  const [scoreRes, setScoreRes] = useState<ScoreResult | null>(null);
  const [anMode, setAnMode] = useState<'hot' | 'cold'>('hot');
  const [mh, setMh] = useState(['', '', '']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [manualText, setManualText] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [pastDates, setPastDates] = useState<string[]>([]);
  const [manualMsg, setManualMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const l = await api<{ batches: Batch[]; summary: { bought: Group; all: Group } }>('/api/numbers?action=list');
      setBatches(l.batches);
      setSummary(l.summary);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '读取失败');
    }
  }, []);

  useEffect(() => {
    load();
    // 录入时可选择已开奖的日期（用来核对已经开过的奖）
    api<{ draws: { date: string }[] }>('/api/draws?action=list')
      .then((r) => setPastDates(r.draws.slice(0, 12).map((d) => d.date)))
      .catch(() => undefined);
  }, [load]);

  async function addManual() {
    setErr('');
    setManualMsg('');
    setBusy(true);
    try {
      const r = await api<{ count: number }>('/api/numbers?action=add_manual', {
        method: 'POST',
        body: { numbers: manualText, targetDraw: manualDate || next.iso },
      });
      setManualText('');
      setManualMsg(`已录入 ${r.count} 个号码，并已标记为“已购买”`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '录入失败');
    } finally {
      setBusy(false);
    }
  }

  async function runScore() {
    setBusy(true);
    setErr('');
    try {
      const r = await api<{ score: ScoreResult }>('/api/numbers?action=score', {
        method: 'POST',
        body: { digits: scoreInput.trim(), months: hotMonths },
      });
      setScoreRes(r.score);
    } catch (e) {
      setScoreRes(null);
      setErr(e instanceof Error ? e.message : '计算失败');
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setErr('');
    try {
      await api('/api/numbers?action=generate', {
        method: 'POST',
        body: { method, count, targetDraw: next.iso, luckyNumber: lucky === '' ? null : Number(lucky), nums: mh, months: hotMonths, mode: anMode },
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '生成失败');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(pick: PickItem) {
    setBatches((cur) =>
      cur.map((b) => ({ ...b, picks: b.picks.map((p) => (p.id === pick.id ? { ...p, bought: !p.bought } : p)) })),
    );
    try {
      await api('/api/numbers?action=mark', { method: 'POST', body: { pickId: pick.id, bought: !pick.bought } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
      load();
    }
  }

  async function markAll(batch: Batch, bought: boolean) {
    try {
      await api('/api/numbers?action=mark_batch', { method: 'POST', body: { batchId: batch.id, bought } });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    }
  }

  async function remove(batch: Batch) {
    if (!window.confirm('确定删除这一批号码吗？删除后无法恢复。')) return;
    try {
      await api('/api/numbers?action=delete_batch', { method: 'POST', body: { batchId: batch.id } });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '删除失败');
    }
  }

  return (
    <>
      <h1 className="page-title">选号</h1>
      <p className="page-sub">下一期：{next.dateText}</p>

      {err && <p className="error">{err}</p>}

      <div className="method-grid">
        {METHODS.map((m) => (
          <button
            key={m.key}
            className={`method ${method === m.key ? 'on' : ''}`}
            onClick={() => setMethod(m.key)}
          >
            <b>{m.name}</b>
            <span>{m.hint}</span>
          </button>
        ))}
      </div>

      <div className="card">
        {method === 'meihua' && (
          <div className="field">
            <label>3 个数字（现在是 {clockText()}）</label>
            <div className="row">
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  type="number"
                  min={0}
                  max={9}
                  inputMode="numeric"
                  value={mh[i]}
                  onChange={(e) => setMh((cur) => cur.map((v, j) => (j === i ? e.target.value.slice(-1) : v)))}
                  style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, fontSize: 18, textAlign: 'center' }}
                />
              ))}
            </div>
          </div>
        )}
        {method === 'analysis' && (
          <div className="field">
            <label>选号依据</label>
            <div className="chips" style={{ marginBottom: 10 }}>
              <button className={`chip ${anMode === 'hot' ? 'on' : ''}`} onClick={() => setAnMode('hot')}>统计热号（出现最多）</button>
              <button className={`chip ${anMode === 'cold' ? 'on' : ''}`} onClick={() => setAnMode('cold')}>统计冷号（出现最少）</button>
            </div>
            <RangeChips value={hotMonths} onChange={setHotMonths} />
            <p className="muted">前4位：每个位置取这段时间出现{anMode === 'hot' ? '最多' : '最少'}的3个数字；后两位：取出现{anMode === 'hot' ? '最多' : '最少'}的10个后两位。</p>
          </div>
        )}
        {method === 'score' && (
          <>
            <div className="field">
              <label>输入号码（6位完整号码，或最后2、3位等；少于6位按最后几位计算）</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={scoreInput}
                onChange={(e) => setScoreInput(e.target.value.replace(/\D/g, ''))}
                placeholder="例如 123456 或 56"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, fontSize: 20, letterSpacing: 2 }}
              />
            </div>
            <div className="field">
              <RangeChips value={hotMonths} onChange={setHotMonths} />
            </div>
            <button className="btn block" disabled={busy || scoreInput.length < 2} onClick={runScore}>
              {busy ? '计算中…' : '计算匹配度'}
            </button>
            {scoreRes && <ScoreView r={scoreRes} />}
          </>
        )}
        {method === 'lucky' && (
          <div className="field">
            <label>指定数字（0–99，留空用设置里的幸运数字）</label>
            <input type="number" min={0} max={99} value={lucky} onChange={(e) => setLucky(e.target.value)} />
          </div>
        )}
        {method !== 'score' && (
        <>
        <div className="field">
          <label>生成几个</label>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 3, 5, 8, 10, 15, 20].map((n) => (
              <option key={n} value={n}>{n} 个</option>
            ))}
          </select>
        </div>
        <button className="btn block" disabled={busy} onClick={generate}>
          {busy ? '生成中…' : '生成并保存'}
        </button>
        <p className="muted" style={{ marginTop: 8 }}>仅供娱乐，不会提高中奖概率。</p>
        </>
        )}
      </div>

      {summary && summary.all.count > 0 && (
        <div className="card">
          <h2>对奖汇总</h2>
          <SummaryRow title="实际购买的" g={summary.bought} />
          <SummaryRow title="全部记录" g={summary.all} />
          <p className="muted">开奖数据更新后，这里会自动重新对奖。金额按每张票计算，是否领取以官方结果为准。</p>
        </div>
      )}

      <h2 style={{ margin: '18px 4px 8px' }}>我的号码记录</h2>
      {batches.length === 0 && <p className="muted">还没有生成过号码。</p>}
      {batches.map((b) => {
        const boughtN = b.picks.filter((p) => p.bought).length;
        return (
          <div className="card" key={b.id}>
            <div className="muted">
              {fmtTime(b.createdAt)} · {METHOD_NAME[b.method] ?? b.method}
              {b.params.lucky !== undefined && `（${String(b.params.lucky).padStart(2, '0')}）`} · 对应 {b.targetDraw} 开奖
            </div>
            {b.params.meihua && <MeihuaInfo m={b.params.meihua} />}
            {b.params.tails && (
              <div className="muted" style={{ margin: '6px 0' }}>
                {b.params.mode === 'cold' ? '统计冷号' : '统计热号'} · 统计范围：{{ 6: '最近半年', 12: '最近一年', 24: '最近两年', 0: '2021年起全部' }[b.params.months ?? 0]}（{b.params.basedOn} 期）
                · 后两位候选：{b.params.tails.join(' ')}
              </div>
            )}
            {b.params.hotBack2 && (
              <div className="muted" style={{ margin: '6px 0' }}>
                统计范围：{{ 6: '最近半年', 12: '最近一年', 24: '最近两年', 0: '2021年起全部' }[b.params.months ?? 0]}（{b.params.basedOn} 期）
                · 热门后两位：{b.params.hotBack2.join(' ')}
              </div>
            )}
            <div className="muted">共 {b.picks.length} 个，实际购买 {boughtN} 个</div>
            <div className="muted">
              {b.state === 'checked' && `已对奖（${b.drawDate} 开奖）`}
              {b.state === 'waiting' && '等待开奖'}
              {b.state === 'nodata' && '已过开奖日，但还没有这一期的开奖数据（可到【开奖】页获取）'}
            </div>
            {b.picks.map((p, idx) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <div className="num">
                    {p.number}
                    {b.params.meihua && idx === 0 && <span className="amt">卦象号码</span>}
                  </div>
                  <div className="muted">后三 <b>{p.number.slice(3)}</b> · 后二 <b>{p.number.slice(4)}</b></div>
                  {p.result && p.result.wins.length > 0 && (
                    <div style={{ color: 'var(--red)', fontWeight: 600, fontSize: 14 }}>
                      🎉 {p.result.wins.map((w) => w.label).join('、')}
                      {p.result.total > 0 && `　${baht(p.result.total)}`}
                    </div>
                  )}
                  {p.result && p.result.wins.length === 0 && (
                    <div className="muted">未中奖{p.result.incomplete ? '（二到五等奖数据不完整，未能完全核对）' : ''}</div>
                  )}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={p.bought} onChange={() => toggle(p)} />
                  已购买
                </label>
              </div>
            ))}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn small ghost" onClick={() => markAll(b, boughtN !== b.picks.length)}>
                {boughtN === b.picks.length ? '全部取消购买' : '全部标记为已购买'}
              </button>
              <button className="btn small danger" onClick={() => remove(b)}>删除这批</button>
            </div>
          </div>
        );
      })}
      {batches.length > 0 && (
        <p className="muted">买票小提示：摊贩的票是现成印好的，可以按“后三/后二”这几位去翻找最接近的票。</p>
      )}
    
      <div className="card">
        <h2>录入我实际买的号码</h2>
        <p className="muted">买的票不一定是系统生成的，可以把票上的6位号码录进来，开奖后自动对奖。</p>
        <div className="field">
          <label>号码（可一次输入多个，用空格、逗号或换行隔开）</label>
          <textarea
            rows={3}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="例如：123456 654321"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, fontSize: 16 }}
          />
        </div>
        <div className="field">
          <label>对应哪一期开奖</label>
          <select value={manualDate || next.iso} onChange={(e) => setManualDate(e.target.value)}>
            <option value={next.iso}>{next.iso}（下一期）</option>
            {pastDates.filter((d) => d !== next.iso).map((d) => (
              <option key={d} value={d}>{d}（已开奖）</option>
            ))}
          </select>
        </div>
        <button className="btn block" disabled={busy || manualText.trim() === ''} onClick={addManual}>
          保存并对奖
        </button>
        {manualMsg && <p className="muted" style={{ color: 'var(--ink)' }}>{manualMsg}</p>}
      </div>
    </>
  );
}

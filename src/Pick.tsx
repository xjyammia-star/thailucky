// 选号页：八字五行 + 生成号码（指定数字 / 纯随机）+ 历史批次（标记实际购买、买票提示）

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.ts';
import { getNextDraw } from './draw.ts';
import { baht } from './prizes.ts';

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
  params: { lucky?: number; favorable?: string[]; usedBazi?: boolean; clock?: string; meihua?: Meihua };
  createdAt: string;
  picks: PickItem[];
}

const METHODS: { key: 'meihua' | 'lucky' | 'random'; name: string; hint: string }[] = [
  { key: 'meihua', name: '梅花易数', hint: '依次随意填写3个0-9的数字，根据玄学生成号码' },
  { key: 'lucky', name: '指定数字', hint: '指定一个0-99的数字，其余按你的五行补全' },
  { key: 'random', name: '纯随机', hint: '完全随机生成号码' },
];

const METHOD_NAME: Record<string, string> = { random: '纯随机', lucky: '指定数字', meihua: '梅花易数', manual: '手动录入' };

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    timeZone: 'Asia/Bangkok',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const [method, setMethod] = useState<'lucky' | 'random' | 'meihua'>('meihua');
  const [count, setCount] = useState(5);
  const [lucky, setLucky] = useState('');
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

  async function generate() {
    setBusy(true);
    setErr('');
    try {
      await api('/api/numbers?action=generate', {
        method: 'POST',
        body: { method, count, targetDraw: next.iso, luckyNumber: lucky === '' ? null : Number(lucky), nums: mh },
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
        {method === 'lucky' && (
          <div className="field">
            <label>指定数字（0–99，留空用设置里的幸运数字）</label>
            <input type="number" min={0} max={99} value={lucky} onChange={(e) => setLucky(e.target.value)} />
          </div>
        )}
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
      </div>

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
    </>
  );
}

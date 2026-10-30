// 选号页：八字五行 + 生成号码（指定数字 / 纯随机）+ 历史批次（标记实际购买、买票提示）

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.ts';
import { getNextDraw } from './draw.ts';
import { baht } from './prizes.ts';

interface Bazi {
  pillars: string[];
  hasHour: boolean;
  adjustedTime: string | null;
  dayMaster: string;
  counts: Record<string, number>;
  strength: string;
  favorable: string[];
  source: string;
  note: string;
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
  params: { lucky?: number; favorable?: string[]; usedBazi?: boolean };
  createdAt: string;
  picks: PickItem[];
}

const METHOD_NAME: Record<string, string> = { random: '纯随机', lucky: '指定数字', meihua: '梅花易数', manual: '手动录入' };
const HETU: Record<string, string> = { 水: '1/6', 火: '2/7', 木: '3/8', 金: '4/9', 土: '5/0' };

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    timeZone: 'Asia/Bangkok',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SummaryRow({ title, g }: { title: string; g: Group }) {
  return (
    <p>
      <b>{title}</b>：{g.count} 个，已对奖 {g.checked} 个，中奖 {g.winners} 个
      {g.total > 0 && <>，奖金合计 <b style={{ color: 'var(--red)' }}>{baht(g.total)}</b></>}
    </p>
  );
}

export default function Pick({ goSettings }: { goSettings: () => void }) {
  const next = useMemo(() => getNextDraw(), []);
  const [bazi, setBazi] = useState<Bazi | null | undefined>(undefined);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [summary, setSummary] = useState<{ bought: Group; all: Group } | null>(null);
  const [method, setMethod] = useState<'lucky' | 'random'>('lucky');
  const [count, setCount] = useState(5);
  const [lucky, setLucky] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [openBazi, setOpenBazi] = useState(false);
  const [manualText, setManualText] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [pastDates, setPastDates] = useState<string[]>([]);
  const [manualMsg, setManualMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const [b, l] = await Promise.all([
        api<{ bazi: Bazi | null }>('/api/numbers?action=bazi'),
        api<{ batches: Batch[]; summary: { bought: Group; all: Group } }>('/api/numbers?action=list'),
      ]);
      setBazi(b.bazi);
      setBatches(l.batches);
      setSummary(l.summary);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '读取失败');
      setBazi(null);
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
        body: { method, count, targetDraw: next.iso, luckyNumber: lucky === '' ? null : Number(lucky) },
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

      <div className="card">
        <h2>我的五行</h2>
        {bazi === undefined && <p className="muted">加载中…</p>}
        {bazi === null && (
          <p className="muted">
            还没有填写出生日期，所以暂时没有五行信息（也可以直接用纯随机）。
            <button className="btn small ghost" style={{ marginLeft: 8 }} onClick={goSettings}>去设置</button>
          </p>
        )}
        {bazi && (
          <>
            <p>
              八字：<b>{bazi.pillars.join(' ')}</b>　日主：{bazi.dayMaster}（{bazi.strength}）
            </p>
            <p>
              喜用五行（{bazi.source}）：
              <b>{bazi.favorable.join('、')}</b>
              <span className="muted">　对应数字 {bazi.favorable.map((e) => HETU[e]).join(' ')}</span>
            </p>
            <button className="btn small ghost" onClick={() => setOpenBazi(!openBazi)}>
              {openBazi ? '收起详情' : '查看详情'}
            </button>
            {openBazi && (
              <div style={{ marginTop: 8 }}>
                <p className="muted">
                  五行分布：{Object.entries(bazi.counts).map(([k, v]) => `${k}${v}`).join('　')}
                  {bazi.adjustedTime && `　真太阳时：${bazi.adjustedTime}`}
                </p>
                {bazi.note && <p className="muted">{bazi.note}</p>}
                <p className="muted">
                  这是一个简化的推算（扶抑法），不能代替专业命理师。觉得不准，可以在【设置】里手动指定喜用五行。
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2>生成号码</h2>
        <div className="field">
          <label>选号方式</label>
          <div className="chips">
            <button className={`chip ${method === 'lucky' ? 'on' : ''}`} onClick={() => setMethod('lucky')}>指定数字</button>
            <button className={`chip ${method === 'random' ? 'on' : ''}`} onClick={() => setMethod('random')}>纯随机</button>
            <button className="chip" disabled style={{ opacity: 0.5 }}>梅花易数（即将上线）</button>
          </div>
        </div>
        {method === 'lucky' && (
          <div className="field">
            <label>指定数字（0–99，留空则用设置里的幸运数字）</label>
            <input type="number" min={0} max={99} value={lucky} onChange={(e) => setLucky(e.target.value)} />
            <p className="muted">这个数字会被放进号码里，其余位置按你的喜用五行对应的数字填充。</p>
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
        <p className="muted" style={{ marginTop: 8 }}>
          提醒：彩票每期都是独立随机开出，选号方式只是仪式感，不会提高中奖概率，请量力而行。
        </p>
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
            <div className="muted">共 {b.picks.length} 个，实际购买 {boughtN} 个</div>
            <div className="muted">
              {b.state === 'checked' && `已对奖（${b.drawDate} 开奖）`}
              {b.state === 'waiting' && '等待开奖'}
              {b.state === 'nodata' && '已过开奖日，但还没有这一期的开奖数据（可到【开奖】页获取）'}
            </div>
            {b.picks.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <div className="num">{p.number}</div>
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

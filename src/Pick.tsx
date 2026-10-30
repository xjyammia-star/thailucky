// 选号页：八字五行 + 生成号码（指定数字 / 纯随机）+ 历史批次（标记实际购买、买票提示）

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.ts';
import { getNextDraw } from './draw.ts';

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

interface PickItem {
  id: number;
  number: string;
  bought: boolean;
}

interface Batch {
  id: number;
  method: string;
  targetDraw: string;
  params: { lucky?: number; favorable?: string[]; usedBazi?: boolean };
  createdAt: string;
  picks: PickItem[];
}

const METHOD_NAME: Record<string, string> = { random: '纯随机', lucky: '指定数字', meihua: '梅花易数' };
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

export default function Pick({ goSettings }: { goSettings: () => void }) {
  const next = useMemo(() => getNextDraw(), []);
  const [bazi, setBazi] = useState<Bazi | null | undefined>(undefined);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [method, setMethod] = useState<'lucky' | 'random'>('lucky');
  const [count, setCount] = useState(5);
  const [lucky, setLucky] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [openBazi, setOpenBazi] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, l] = await Promise.all([
        api<{ bazi: Bazi | null }>('/api/numbers?action=bazi'),
        api<{ batches: Batch[] }>('/api/numbers?action=list'),
      ]);
      setBazi(b.bazi);
      setBatches(l.batches);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '读取失败');
      setBazi(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
            {b.picks.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <div className="num">{p.number}</div>
                  <div className="muted">后三 <b>{p.number.slice(3)}</b> · 后二 <b>{p.number.slice(4)}</b></div>
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

// 购买记录页：我实际购买过的所有号码，按开奖期分组，显示对奖结果。
// 同时导出 PurchaseGroup（首页的"最近一次购买"也用它显示）。

import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';
import { baht } from './prizes.ts';

export interface HistPick {
  id: number;
  number: string;
  result: { wins: { label: string }[]; total: number; incomplete?: boolean } | null;
}

export interface HistGroup {
  targetDraw: string;
  drawDate: string | null;
  state: 'checked' | 'waiting' | 'nodata';
  count: number;
  winners: number;
  total: number;
  picks: HistPick[];
}

export interface HistSummary {
  count: number;
  checked: number;
  winners: number;
  total: number;
}

export function PurchaseGroup({ g, onChanged }: { g: HistGroup; onChanged?: () => void }) {
  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [err, setErr] = useState('');

  async function saveEdit(id: number) {
    setErr('');
    try {
      await api('/api/numbers?action=update_pick', { method: 'POST', body: { pickId: id, number: editVal } });
      setEditId(null);
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '修改失败');
    }
  }

  async function removePick(p: HistPick) {
    if (!window.confirm(`确定删除号码 ${p.number} 吗？删除后不能恢复。`)) return;
    setErr('');
    try {
      await api('/api/numbers?action=delete_pick', { method: 'POST', body: { pickId: p.id } });
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '删除失败');
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b>{g.targetDraw} 开奖</b>
        <span className="muted">
          {g.state === 'checked' && (g.winners > 0 ? `中奖 ${g.winners} 个` : '未中奖')}
          {g.state === 'waiting' && '等待开奖'}
          {g.state === 'nodata' && '还没有这一期的开奖数据'}
        </span>
      </div>
      {err && <div className="error">{err}</div>}
      {g.picks.map((p) => (
        <div key={p.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
          {editId === p.id ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={editVal}
                onChange={(e) => setEditVal(e.target.value.replace(/\D/g, ''))}
                style={{ width: 130, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 18, letterSpacing: 1 }}
              />
              <button className="btn small" disabled={editVal.length !== 6} onClick={() => saveEdit(p.id)}>保存</button>
              <button className="btn small ghost" onClick={() => setEditId(null)}>取消</button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: 1 }}>{p.number}</span>
                {p.result && p.result.wins.length > 0 ? (
                  <span style={{ color: 'var(--red)', fontWeight: 600, marginLeft: 10 }}>
                    🎉 {p.result.wins.map((w) => w.label).join('、')}
                    {p.result.total > 0 && `　${baht(p.result.total)}`}
                  </span>
                ) : p.result ? (
                  <span className="muted" style={{ marginLeft: 10 }}>
                    未中奖{p.result.incomplete ? '（二到五等奖数据不完整）' : ''}
                  </span>
                ) : (
                  <span className="muted" style={{ marginLeft: 10 }}>{g.state === 'waiting' ? '等待开奖' : '未对奖'}</span>
                )}
              </div>
              {onChanged && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn small ghost" onClick={() => { setEditId(p.id); setEditVal(p.number); setErr(''); }}>修改</button>
                  <button className="btn small danger" onClick={() => removePick(p)}>删除</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {g.state === 'checked' && g.total > 0 && (
        <p style={{ margin: '6px 0 0', color: 'var(--red)', fontWeight: 600 }}>这一期奖金合计 {baht(g.total)}</p>
      )}
    </div>
  );
}

export default function History({ goBack }: { goBack: () => void }) {
  const [groups, setGroups] = useState<HistGroup[] | null>(null);
  const [sum, setSum] = useState<HistSummary | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    api<{ groups: HistGroup[]; summary: HistSummary }>('/api/numbers?action=history')
      .then((r) => {
        setGroups(r.groups);
        setSum(r.summary);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : '读取失败'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <h1 className="page-title">购买记录</h1>
      <p className="page-sub">你标记为“已购买”的所有号码和对奖结果，新的在前。</p>
      <button className="btn ghost small" onClick={goBack}>← 返回首页</button>

      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
      {!groups && !err && <p className="muted">加载中…</p>}

      {sum && sum.count > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2>合计</h2>
          <p>
            共购买 {sum.count} 个号码，已对奖 {sum.checked} 个，中奖 {sum.winners} 个
            {sum.total > 0 && <>，奖金合计 <b style={{ color: 'var(--red)' }}>{baht(sum.total)}</b></>}
          </p>
          <p className="muted">金额按每张票计算，是否领取以官方结果为准。这里不统计买票花费。</p>
        </div>
      )}

      {groups && groups.length === 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="muted">还没有已购买的号码。在【选号】页把号码勾选“已购买”，或在最下面“录入我实际买的号码”，就会出现在这里。</p>
        </div>
      )}

      {groups?.map((g) => (
        <div className="card" key={g.targetDraw}>
          <PurchaseGroup g={g} onChanged={load} />
        </div>
      ))}
    </>
  );
}

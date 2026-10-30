// 开奖结果页：今年（以及导入的更早）每一期的开奖号码

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.ts';
import type { DrawFull, DrawSummary } from './api.ts';
import { autoSyncIfNeeded } from './draw.ts';
import DrawCard, { formatDate } from './DrawCard.tsx';
import { amountText } from './prizes.ts';

interface Props {
  isAdmin: boolean;
}

const GROUPS: { key: 'prize2' | 'prize3' | 'prize4' | 'prize5'; label: string }[] = [
  { key: 'prize2', label: '二等奖（5个）' },
  { key: 'prize3', label: '三等奖（10个）' },
  { key: 'prize4', label: '四等奖（50个）' },
  { key: 'prize5', label: '五等奖（100个）' },
];

export default function Draws(_props: Props) {
  const [draws, setDraws] = useState<DrawSummary[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<DrawFull | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]); // 展开的日期；最近一期默认展开
  const initedExpand = useRef(false);
  const historyOk = useRef(true);

  const [earliest, setEarliest] = useState<string | null>(null);

  const load = useCallback(async (): Promise<DrawSummary[]> => {
    const data = await api<{ draws: DrawSummary[]; earliest: string | null; historyComplete: boolean }>(
      '/api/draws?action=list',
    );
    setDraws(data.draws);
    setEarliest(data.earliest);
    historyOk.current = data.historyComplete;
    if (!initedExpand.current && data.draws.length > 0) {
      setExpanded([data.draws[0].date]);
      initedExpand.current = true;
    }
    return data.draws;
  }, []);

  // 打开页面：先读列表；如果库里的数据落后于应有的开奖日，自动去同步一次
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await load();
        const r = await autoSyncIfNeeded(list[0]?.date ?? null, historyOk.current);
        if (cancelled) return;
        if (r.added > 0) {
          await load();
          setMsg(`已自动获取 ${r.added} 期新的开奖结果`);
        } else if (r.error && list.length === 0) {
          setErr(r.error);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '读取失败');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function manualSync() {
    setSyncing(true);
    setErr('');
    setMsg('');
    try {
      const r = await api<{ message: string }>('/api/draws?action=sync', { method: 'POST', body: {} });
      setMsg(r.message);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '获取失败');
    } finally {
      setSyncing(false);
    }
  }

  async function toggle(date: string) {
    if (open === date) {
      setOpen(null);
      setDetail(null);
      return;
    }
    setOpen(date);
    setDetail(null);
    try {
      const data = await api<{ draw: DrawFull }>(`/api/draws?action=get&date=${date}`);
      setDetail(data.draw);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '读取失败');
    }
  }

  return (
    <>
      <h1 className="page-title">开奖结果</h1>
      <p className="page-sub">
        泰国政府彩票，每月1日和16日开奖。这里显示最近半年
        {earliest && `（已获取自${Number(earliest.slice(0, 4))}年${Number(earliest.slice(5, 7))}月至今的开奖记录，完整数据用于统计页）`}。
      </p>

      <div style={{ marginBottom: 14 }}>
        <button className="btn ghost small" onClick={manualSync} disabled={syncing}>
          {syncing ? '获取中…' : '获取最新开奖数据'}
        </button>
      </div>

      {err && <div className="error">{err}</div>}
      {msg && <div className="success">{msg}</div>}

      {draws === null && !err && <p className="muted">加载中…</p>}

      {draws !== null && draws.length === 0 && (
        <div className="card">
          <p>还没有开奖数据。</p>
          <p className="muted">
            点上面的"获取最新开奖数据"试试自动获取；如果获取不到，请管理员在【管理】页导入整理好的 md 文档。
          </p>
        </div>
      )}

      {draws?.map((d) =>
        !expanded.includes(d.date) ? (
          <button key={d.date} className="date-row" onClick={() => setExpanded((cur) => [...cur, d.date])}>
            {formatDate(d.date)}
            <span>展开 ▾</span>
          </button>
        ) : (
        <DrawCard
          key={d.date}
          draw={d}
          footer={
            <div style={{ marginTop: 10 }}>
              <button className="btn ghost small" onClick={() => toggle(d.date)}>
                {open === d.date ? '收起奖号' : '查看全部奖号'}
              </button>
              {d.date !== draws[0].date && (
                <button
                  className="btn ghost small"
                  style={{ marginLeft: 8 }}
                  onClick={() => setExpanded((cur) => cur.filter((x) => x !== d.date))}
                >
                  折叠
                </button>
              )}
              {open === d.date && (
                <div style={{ marginTop: 12 }}>
                  {!detail && <p className="muted">加载中…</p>}
                  {detail &&
                    GROUPS.map((g) => (
                      <div key={g.key} style={{ marginBottom: 10 }}>
                        <div className="muted">{g.label} {amountText(g.key, detail.date)}</div>
                        {detail[g.key] ? (
                          <div className="nums">
                            {detail[g.key]!.map((n, i) => (
                              <span key={`${n}-${i}`}>{n}</span>
                            ))}
                          </div>
                        ) : (
                          <div className="muted">这一期没有完整数据</div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          }
        />
        ),
      )}
    </>
  );
}

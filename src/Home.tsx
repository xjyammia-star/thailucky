// 首页：下一期开奖倒计时 + 最近一期开奖结果 + 我的号码（待开奖、已确定购买的）

import { useEffect, useMemo, useState } from 'react';
import { api } from './api.ts';
import type { CurrentUser, DrawSummary } from './api.ts';
import { autoSyncIfNeeded, getNextDraw } from './draw.ts';
import DrawCard from './DrawCard.tsx';

interface Props {
  user: CurrentUser;
  goPick: () => void;
  goDraws: () => void;
}

interface MyPick {
  id: number;
  number: string;
  bought: boolean;
}

interface MyBatch {
  targetDraw: string;
  state: 'checked' | 'waiting' | 'nodata';
  picks: MyPick[];
}

export default function Home({ user, goPick, goDraws }: Props) {
  const next = useMemo(() => getNextDraw(), []);
  const [latest, setLatest] = useState<DrawSummary | null>(null);
  const [mine, setMine] = useState<MyBatch[]>([]);

  // 读我的号码（没有数据库表等错误时静默忽略，不影响首页）
  useEffect(() => {
    api<{ batches: MyBatch[] }>('/api/numbers?action=list')
      .then((r) => setMine(r.batches.filter((b) => b.state === 'waiting')))
      .catch(() => undefined);
  }, []);
  const boughtPicks = mine.flatMap((b) => b.picks.filter((p) => p.bought).map((p) => ({ ...p, draw: b.targetDraw })));
  const unbought = mine.reduce((n, b) => n + b.picks.filter((p) => !p.bought).length, 0);

  // 读最近一期；如果落后于应有的开奖日，自动同步一次后再读
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const first = await api<{ draw: DrawSummary | null; historyComplete?: boolean }>('/api/draws?action=latest');
        if (cancelled) return;
        setLatest(first.draw);
        const r = await autoSyncIfNeeded(first.draw?.date ?? null, first.historyComplete !== false);
        if (r.added > 0 && !cancelled) {
          const again = await api<{ draw: DrawSummary | null }>('/api/draws?action=latest');
          if (!cancelled) setLatest(again.draw);
        }
      } catch {
        // 读不到开奖数据不影响首页其他内容（比如数据库还没更新），静默忽略
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <h1 className="page-title">你好，{user.displayName}</h1>
      <p className="page-sub">泰国政府彩票 · 家庭娱乐选号工具</p>

      <div className="card hero">
        <div className="muted">下一期开奖（按每月1日、16日估算）</div>
        <div className="big">
          {next.daysLeft === 0 ? '就是今天' : next.daysLeft}
          {next.daysLeft > 0 && <small>天后</small>}
        </div>
        <div style={{ marginTop: 6 }}>{next.dateText}</div>
        <div className="muted" style={{ marginTop: 6 }}>遇公共假日官方可能顺延，以实际公布为准</div>
      </div>

      {latest && (
        <>
          <h2 className="section-title">最近一期</h2>
          <DrawCard
            draw={latest}
            footer={
              <div style={{ marginTop: 10 }}>
                <button className="btn ghost small" onClick={goDraws}>查看全部开奖结果</button>
              </div>
            }
          />
        </>
      )}

      <div className="card">
        <h2>我的号码</h2>
        {boughtPicks.length > 0 ? (
          <>
            <p className="muted">已确定购买、等待开奖的号码</p>
            <div className="nums" style={{ margin: '6px 0' }}>
              {boughtPicks.map((p) => (
                <span key={p.id} style={{ fontSize: 17, fontWeight: 600 }}>{p.number}</span>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">还没有已确定购买的号码。</p>
        )}
        {unbought > 0 && <p className="muted">另有 {unbought} 个已生成但还没标记购买的号码。</p>}
        <button className="btn block" style={{ marginTop: 8 }} onClick={goPick}>去选号</button>
      </div>

      <p className="muted">命理选号仅作仪式感与娱乐，每期开奖是随机的，不会提高中奖概率。请量力购买。</p>
    </>
  );
}

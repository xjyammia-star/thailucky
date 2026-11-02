// 首页：下一期开奖倒计时 + 最近一期开奖结果 + 我的号码（待开奖、已确定购买的）

import { useEffect, useMemo, useState } from 'react';
import { api } from './api.ts';
import type { CurrentUser, DrawSummary } from './api.ts';
import { autoSyncIfNeeded, getNextDraw } from './draw.ts';
import DrawCard from './DrawCard.tsx';
import { PurchaseGroup } from './History.tsx';
import type { HistGroup } from './History.tsx';

interface Props {
  user: CurrentUser;
  goPick: () => void;
  goDraws: () => void;
  goHistory: () => void;
}

export default function Home({ user, goPick, goDraws, goHistory }: Props) {
  const next = useMemo(() => getNextDraw(), []);
  const [latest, setLatest] = useState<DrawSummary | null>(null);
  const [lastBuy, setLastBuy] = useState<HistGroup | null>(null);

  // 读我最近一次购买的号码（没有数据库表等错误时静默忽略，不影响首页）
  useEffect(() => {
    api<{ groups: HistGroup[] }>('/api/numbers?action=history')
      .then((r) => setLastBuy(r.groups[0] ?? null))
      .catch(() => undefined);
  }, []);

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
        <h2>我最近一次购买</h2>
        {lastBuy ? <PurchaseGroup g={lastBuy} /> : <p className="muted">还没有已确定购买的号码。</p>}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={goPick}>去选号</button>
          <button className="btn ghost" onClick={goHistory}>历史购买记录</button>
        </div>
      </div>

      <p className="muted">命理选号仅作仪式感与娱乐，每期开奖是随机的，不会提高中奖概率。请量力购买。</p>
    </>
  );
}

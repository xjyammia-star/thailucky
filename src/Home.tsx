// 首页：下一期开奖倒计时 + 最近一期开奖结果 + 开发进度

import { useEffect, useMemo, useState } from 'react';
import { api } from './api.ts';
import type { CurrentUser, DrawSummary } from './api.ts';
import { autoSyncIfNeeded, getNextDraw } from './draw.ts';
import DrawCard from './DrawCard.tsx';

interface Props {
  user: CurrentUser;
  goSettings: () => void;
  goDraws: () => void;
}

const PROGRESS: { text: string; done: boolean }[] = [
  { text: '登录与账号管理、个人设置', done: true },
  { text: '开奖数据（自动获取 / md 导入 / 开奖结果页）', done: true },
  { text: '选号：八字五行、指定数字、纯随机、号码保存与标记购买', done: true },
  { text: '梅花易数起卦选号', done: true },
  { text: '自动对奖', done: false },
  { text: '统计页（与随机基准线对比）', done: false },
];

export default function Home({ user, goSettings, goDraws }: Props) {
  const next = useMemo(() => getNextDraw(), []);
  const [latest, setLatest] = useState<DrawSummary | null>(null);

  // 读最近一期；如果落后于应有的开奖日，自动同步一次后再读
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const first = await api<{ draw: DrawSummary | null }>('/api/draws?action=latest');
        if (cancelled) return;
        setLatest(first.draw);
        const r = await autoSyncIfNeeded(first.draw?.date ?? null);
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
        <h2>开发进度</h2>
        {PROGRESS.map((p) => (
          <div key={p.text} className={`todo ${p.done ? 'done' : ''}`}>
            <span className="dot" />
            <span>{p.text}</span>
          </div>
        ))}
        <p className="muted" style={{ marginTop: 10 }}>
          先到「设置」填好生辰信息，之后的选号会用到。
        </p>
        <button className="btn ghost small" onClick={goSettings}>去填写生辰信息</button>
      </div>

      <p className="muted">命理选号仅作仪式感与娱乐，每期开奖是随机的，不会提高中奖概率。请量力购买。</p>
    </>
  );
}

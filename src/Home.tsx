// 首页：下一期开奖倒计时 + 开发进度
// 后面的步骤会在这里加上"最近一期开奖结果"和"开始选号"入口

import { useMemo } from 'react';
import type { CurrentUser } from './api.ts';
import { getNextDraw } from './draw.ts';

interface Props {
  user: CurrentUser;
  goSettings: () => void;
}

const PROGRESS: { text: string; done: boolean }[] = [
  { text: '登录与账号管理、个人设置', done: true },
  { text: '开奖数据（自动获取 / 手动录入 / 今年历史）', done: false },
  { text: '三种选号方式（梅花易数 / 指定数字 / 纯随机）', done: false },
  { text: '号码保存、标记购买、自动对奖', done: false },
  { text: '统计页（与随机基准线对比）', done: false },
];

export default function Home({ user, goSettings }: Props) {
  const next = useMemo(() => getNextDraw(), []);

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

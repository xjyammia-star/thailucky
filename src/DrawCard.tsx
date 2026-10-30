// 一期开奖结果的"摘要卡片"，首页和开奖页都用它

import type { ReactNode } from 'react';
import type { DrawSummary } from './api.ts';

// 2026-10-16 → 2026年10月16日
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

interface Props {
  draw: DrawSummary;
  footer?: ReactNode;
}

export default function DrawCard({ draw, footer }: Props) {
  return (
    <div className="card">
      <div className="draw-head">
        <h2>{formatDate(draw.date)}</h2>
      </div>
      <div className="draw-first">
        <span className="muted">头奖</span>
        <span className="num-big">{draw.first}</span>
      </div>
      <div className="draw-grid">
        <div>
          <div className="muted">前三位</div>
          <div className="num">{draw.front3.join('　')}</div>
        </div>
        <div>
          <div className="muted">后三位</div>
          <div className="num">{draw.back3.join('　')}</div>
        </div>
        <div>
          <div className="muted">后两位</div>
          <div className="num">{draw.back2}</div>
        </div>
        <div>
          <div className="muted">头奖前后各一号</div>
          <div className="num">{draw.near.join('　')}</div>
        </div>
      </div>
      {footer}
    </div>
  );
}

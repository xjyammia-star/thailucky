// "我的五行"卡片（只读）：根据设置里的生辰信息算出的八字、喜用五行。显示在【设置】页。

import { useEffect, useState } from 'react';
import { api } from './api.ts';

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

const HETU: Record<string, string> = { 水: '1/6', 火: '2/7', 木: '3/8', 金: '4/9', 土: '5/0' };

export default function BaziCard({ refreshKey }: { refreshKey: number }) {
  const [bazi, setBazi] = useState<Bazi | null | undefined>(undefined);

  useEffect(() => {
    api<{ bazi: Bazi | null }>('/api/numbers?action=bazi')
      .then((r) => setBazi(r.bazi))
      .catch(() => setBazi(null));
  }, [refreshKey]);

  return (
    <div className="card">
      <h2>我的五行</h2>
      {bazi === undefined && <p className="muted">加载中…</p>}
      {bazi === null && <p className="muted">填写并保存出生日期后，这里会显示你的八字和喜用五行。</p>}
      {bazi && (
        <>
          <p>
            八字：<b>{bazi.pillars.join(' ')}</b>　日主：{bazi.dayMaster}（{bazi.strength}）
          </p>
          <p>
            喜用五行（{bazi.source}）：<b>{bazi.favorable.join('、')}</b>
            <span className="muted">　对应数字 {bazi.favorable.map((e) => HETU[e]).join(' ')}</span>
          </p>
          <p className="muted">
            五行分布：{Object.entries(bazi.counts).map(([k, v]) => `${k}${v}`).join('　')}
            {bazi.adjustedTime && `　真太阳时：${bazi.adjustedTime}`}
          </p>
          {bazi.note && <p className="muted">{bazi.note}</p>}
          <p className="muted">
            这是简化的推算（扶抑法），不能代替专业命理师。觉得不准，可以在上面手动指定喜用五行。
          </p>
        </>
      )}
    </div>
  );
}

// 统计页：基于历史开奖数据的概率统计。目的是看"数字分布有没有偏离随机"，不是预测。

import { useEffect, useState } from 'react';
import { api } from './api.ts';

interface Uniform {
  counts: number[];
  total: number;
  chi: number;
  df: number;
  p: number;
}
interface Ranked {
  n: string;
  count: number;
  gap: number;
}
interface Backtest {
  label: string;
  picks: number;
  trials: number;
  hits: number;
  expected: number;
  p: number;
}
interface StatsData {
  range: { from: string; to: string; draws: number };
  sixCount: number;
  positions: (Uniform & { pos: number })[];
  back2: { tens: Uniform; units: Uniform; hot: Ranked[]; overdue: Ranked[] };
  back3: { hot: Ranked[]; overdue: Ranked[] };
  patterns: {
    parity: Uniform & { labels: string[] };
    big: Uniform & { labels: string[] };
    sum: { mean: number; expected: number; z: number; p: number };
  };
  backtests: Backtest[];
  verdict: { tests: number; significant: number; byChance: number };
}

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const pText = (p: number) => (p < 0.001 ? '<0.001' : p.toFixed(3));
const BIN6 = [1, 6, 15, 20, 15, 6, 1].map((x) => x / 64);

function PBadge({ p }: { p: number }) {
  const low = p < 0.05;
  return (
    <span className="amt" style={{ color: low ? 'var(--danger)' : 'var(--ok)' }}>
      p={pText(p)} {low ? '有偏离' : '正常范围'}
    </span>
  );
}

function Bars({ title, u, labels }: { title: string; u: Uniform; labels?: string[] }) {
  const max = Math.max(...u.counts, 1);
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="muted">
        {title} <PBadge p={u.p} />
      </div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 56, marginTop: 4 }}>
        {u.counts.map((c, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10 }}>
            <div style={{ background: 'var(--gold)', height: Math.max(2, (c / max) * 40), borderRadius: 2 }} title={`${c}`} />
            <div className="muted" style={{ fontSize: 11 }}>{labels ? labels[i] : i}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankList({ title, items, mode, draws }: { title: string; items: Ranked[]; mode: 'hot' | 'gap'; draws: number }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="muted">{title}</div>
      <div className="nums" style={{ marginTop: 4 }}>
        {items.map((r) => (
          <span key={r.n}>
            {r.n}
            <small className="muted"> {mode === 'hot' ? `×${r.count}` : r.gap >= draws ? '从未出现' : `隔${r.gap}期`}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

function Distribution({ title, u, labels }: { title: string; u: Uniform; labels: string[] }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="muted">
        {title} <PBadge p={u.p} />
      </div>
      <table className="stat-table">
        <tbody>
          <tr>
            <td></td>
            {labels.map((l) => <td key={l}>{l}</td>)}
          </tr>
          <tr>
            <td>实际</td>
            {u.counts.map((c, i) => <td key={i}>{pct(c / u.total)}</td>)}
          </tr>
          <tr className="muted">
            <td>理论</td>
            {BIN6.map((q, i) => <td key={i}>{pct(q)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function Stats() {
  const [data, setData] = useState<StatsData | null | undefined>(undefined);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<{ stats: StatsData | null }>('/api/stats?action=overview')
      .then((r) => setData(r.stats))
      .catch((e) => {
        setErr(e instanceof Error ? e.message : '读取失败');
        setData(null);
      });
  }, []);

  return (
    <>
      <h1 className="page-title">统计</h1>
      <p className="page-sub">用历史开奖数据，检验数字分布有没有偏离随机。</p>

      {err && <p className="error">{err}</p>}
      {data === undefined && <p className="muted">计算中…</p>}
      {data === null && !err && <p className="muted">还没有历史开奖数据，请先到【开奖】页获取。</p>}

      {data && (
        <>
          <div className="card">
            <h2>数据范围</h2>
            <p>
              {data.range.from} 至 {data.range.to}，共 <b>{data.range.draws}</b> 期；
              头奖和二到五等奖共 <b>{data.sixCount}</b> 个 6 位号码参与统计。
            </p>
          </div>

          <div className="card">
            <h2>总体结论</h2>
            <p>
              共做了 <b>{data.verdict.tests}</b> 项检验，其中 <b>{data.verdict.significant}</b> 项显示“有偏离”。
              即使完全随机，做这么多项检验，也平均会有约 {data.verdict.byChance.toFixed(1)} 项碰巧显示偏离。
            </p>
            <p style={{ color: data.verdict.significant <= Math.ceil(data.verdict.byChance) + 1 ? 'var(--ok)' : 'var(--danger)' }}>
              {data.verdict.significant <= Math.ceil(data.verdict.byChance) + 1
                ? '结论：偏离的数量没有超过随机应有的水平，没有发现可以利用的规律。'
                : '结论：偏离数量多于随机应有的水平，值得留意；但需要更多期数验证，不能直接当作规律。'}
            </p>
            <p className="muted">
              “p 值”越小，越不像随机。一般小于 0.05 才算“有点特别”，但检验做得多了，偶尔低于 0.05 很正常。
            </p>
          </div>

          <div className="card">
            <h2>各位置数字出现频率</h2>
            <p className="muted">理论上每个数字在每个位置各占 10%。颜色越深，离 10% 越远。</p>
            <table className="stat-table">
              <tbody>
                <tr>
                  <td>数字</td>
                  {data.positions.map((p) => <td key={p.pos}>第{p.pos}位</td>)}
                </tr>
                {Array.from({ length: 10 }, (_, d) => (
                  <tr key={d}>
                    <td>{d}</td>
                    {data.positions.map((p) => {
                      const dev = Math.abs(p.counts[d] / p.total - 0.1) / 0.1;
                      return (
                        <td key={p.pos} style={{ background: `rgba(180, 60, 60, ${Math.min(0.5, dev * 1.5).toFixed(2)})` }}>
                          {pct(p.counts[d] / p.total)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td>检验</td>
                  {data.positions.map((p) => (
                    <td key={p.pos} style={{ fontSize: 11 }}>
                      <PBadge p={p.p} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>后两位</h2>
            <p className="muted">共 {data.range.draws} 期，每期 1 个。100 个数里，每个数平均只会出现约 {(data.range.draws / 100).toFixed(1)} 次，所以出现 3、4 次也属正常。</p>
            <Bars title="十位数字出现次数" u={data.back2.tens} />
            <Bars title="个位数字出现次数" u={data.back2.units} />
            <RankList title="出现次数最多的 10 个" items={data.back2.hot} mode="hot" draws={data.range.draws} />
            <RankList title="隔得最久没出现的 10 个" items={data.back2.overdue} mode="gap" draws={data.range.draws} />
          </div>

          <div className="card">
            <h2>后三位</h2>
            <p className="muted">共 {data.range.draws * 2} 个，1000 个数里每个数平均只出现约 {(data.range.draws * 2 / 1000).toFixed(2)} 次，多数数字一次都没出现过。</p>
            <RankList title="出现次数最多的 10 个" items={data.back3.hot} mode="hot" draws={data.range.draws} />
            <RankList title="隔得最久没出现的 10 个" items={data.back3.overdue} mode="gap" draws={data.range.draws} />
          </div>

          <div className="card">
            <h2>号码形态</h2>
            <Distribution title="一个 6 位号码里，奇数数字的个数" u={data.patterns.parity} labels={data.patterns.parity.labels} />
            <Distribution title="一个 6 位号码里，大数字（5–9）的个数" u={data.patterns.big} labels={data.patterns.big.labels} />
            <p className="muted">
              数字之和：平均 {data.patterns.sum.mean.toFixed(2)}（理论 {data.patterns.sum.expected}） <PBadge p={data.patterns.sum.p} />
            </p>
          </div>

          <div className="card">
            <h2>回测：选“热号”或“冷号”有用吗</h2>
            <p className="muted">
              假设从第 31 期起，每期都根据之前的历史选 5 个号码，看下一期开奖有没有命中，再和纯随机的理论命中率比较。
            </p>
            <table className="stat-table">
              <tbody>
                <tr>
                  <td>做法</td>
                  <td>命中</td>
                  <td>实际</td>
                  <td>随机</td>
                  <td>检验</td>
                </tr>
                {data.backtests.map((b) => (
                  <tr key={b.label}>
                    <td style={{ textAlign: 'left' }}>{b.label}</td>
                    <td>{b.hits}/{b.trials}</td>
                    <td>{pct(b.hits / b.trials)}</td>
                    <td>{pct(b.expected)}</td>
                    <td style={{ fontSize: 11 }}><PBadge p={b.p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="muted">
            统计只描述过去。每期开奖互相独立，这些结果不能预测下一期，也不会提高中奖概率，请量力购买。
          </p>
        </>
      )}
    </>
  );
}

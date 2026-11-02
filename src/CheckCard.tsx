// 首页的"对奖"卡片：输入自己买的号码，选择哪一期，马上对奖，并把号码保存进购买记录。

import { useEffect, useRef, useState } from 'react';
import { api } from './api.ts';
import { getNextDraw } from './draw.ts';
import { PurchaseGroup } from './History.tsx';
import type { HistGroup } from './History.tsx';

interface Props {
  latestDate: string | null; // 数据库里最近一期的日期
  onSaved: () => void; // 保存后通知首页刷新"最近一次购买"
}

export default function CheckCard({ latestDate, onSaved }: Props) {
  const next = getNextDraw();
  const box = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<HistGroup | null>(null);

  useEffect(() => {
    if (!open) return;
    api<{ draws: { date: string }[] }>('/api/draws?action=list')
      .then((r) => setDates(r.draws.map((d) => d.date)))
      .catch(() => undefined);
  }, [open]);

  const chosen = date || latestDate || next.iso;
  const lines = text.split('\n').map((l) => l.replace(/\D/g, '')).filter((l) => l !== '');

  async function reload(target: string) {
    const r = await api<{ groups: HistGroup[] }>('/api/numbers?action=history');
    setResult(r.groups.find((g) => g.targetDraw === target) ?? null);
    onSaved();
  }

  async function submit() {
    setBusy(true);
    setErr('');
    setResult(null);
    try {
      await api('/api/numbers?action=add_manual', { method: 'POST', body: { numbers: lines, targetDraw: chosen } });
      await reload(chosen);
      setText('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '对奖失败');
    } finally {
      setBusy(false);
    }
  }

  const options = Array.from(new Set([next.iso, ...dates]));

  return (
    <div className="card">
      <h2>对奖</h2>
      {!open ? (
        <>
          <p className="muted">输入你买的号码，马上对奖，号码会自动保存到购买记录。</p>
          <button className="btn block" onClick={() => setOpen(true)}>输入号码对奖</button>
        </>
      ) : (
        <>
          <div className="field">
            <label>你买的号码，每行一个，每行 6 位</label>
            <textarea
              ref={box}
              rows={4}
              inputMode="numeric"
              value={text}
              onChange={(e) =>
                setText(
                  e.target.value
                    .replace(/[^\d\n]/g, '')
                    .split('\n')
                    .map((l) => l.slice(0, 6))
                    .join('\n'),
                )
              }
              placeholder={'例如：\n123456\n654321'}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, fontSize: 20, letterSpacing: 2, boxSizing: 'border-box' }}
            />
            <button
              type="button"
              className="btn ghost small"
              style={{ marginTop: 8 }}
              onClick={() => {
                setText((v) => (v === '' || v.endsWith('\n') ? v : v + '\n'));
                box.current?.focus();
              }}
            >
              ↵ 换行，输入下一个号码
            </button>
            <p className="muted" style={{ marginTop: 4 }}>已输入 {lines.length} 个号码</p>
          </div>
          <div className="field">
            <label>对哪一期的开奖</label>
            <select value={chosen} onChange={(e) => setDate(e.target.value)}>
              {options.map((d) => (
                <option key={d} value={d}>
                  {d}
                  {d === next.iso && !dates.includes(d) ? '（下一期，还没开奖）' : d === latestDate ? '（最近一期）' : ''}
                </option>
              ))}
            </select>
          </div>
          {err && <div className="error">{err}</div>}
          <button
            className="btn block"
            disabled={busy || lines.length === 0 || lines.some((l) => l.length !== 6)}
            onClick={submit}
          >
            {busy ? '对奖中…' : '对奖并保存'}
          </button>
          {lines.some((l) => l.length !== 6) && <p className="muted">每个号码需要正好 6 位。</p>}
          {result && (
            <div style={{ marginTop: 12 }}>
              <PurchaseGroup g={result} onChanged={() => reload(result.targetDraw)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

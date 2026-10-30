// 登录页 + 首次设置页（数据库里还没有任何账号时，自动显示"首次设置"）

import { useState } from 'react';
import { api } from './api.ts';

interface Props {
  needsSetup: boolean;
  missing: string[]; // 首次设置时还缺哪些环境变量
  onDone: () => void;
}

export default function AuthPage({ needsSetup, missing, onDone }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (needsSetup) {
        await api('/api/auth?action=setup', {
          method: 'POST',
          body: { setupCode, username, password, displayName },
        });
      } else {
        await api('/api/auth?action=login', { method: 'POST', body: { username, password } });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : '出错了，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <h1>选号助手</h1>
      <p className="tagline">仅供家人娱乐使用 · 命理参考不代表预测</p>

      <form className="card" onSubmit={submit}>
        <h2>{needsSetup ? '首次设置：创建管理员账号' : '登录'}</h2>

        {needsSetup && missing.length > 0 && (
          <div className="notice">
            还需要先在 Vercel 的环境变量里添加：<b>{missing.join('、')}</b>，添加后重新部署（Redeploy）再回来。
          </div>
        )}

        {needsSetup && (
          <div className="field">
            <label>设置口令（你在 Vercel 里设置的 SETUP_CODE）</label>
            <input type="password" value={setupCode} onChange={(e) => setSetupCode(e.target.value)} autoComplete="off" />
          </div>
        )}

        <div className="field">
          <label>用户名</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
          />
        </div>

        {needsSetup && (
          <div className="field">
            <label>显示名称（页面上怎么称呼你）</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
        )}

        <div className="field">
          <label>密码{needsSetup ? '（至少6位）' : ''}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
          />
        </div>

        {error && <div className="error">{error}</div>}
        <button className="btn block" type="submit" disabled={busy}>
          {busy ? '请稍候…' : needsSetup ? '创建并进入' : '登录'}
        </button>
      </form>
    </div>
  );
}

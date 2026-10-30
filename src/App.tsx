// 应用入口：判断是否已登录 → 显示登录页或主界面（底部导航切换页面）

import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';
import type { CurrentUser } from './api.ts';
import AuthPage from './AuthPage.tsx';
import Home from './Home.tsx';
import Settings from './Settings.tsx';
import Admin from './Admin.tsx';
import Draws from './Draws.tsx';
import Pick from './Pick.tsx';
import Stats from './Stats.tsx';

type Tab = 'home' | 'pick' | 'draws' | 'stats' | 'settings' | 'admin';

interface MeResponse {
  user: CurrentUser | null;
  needsSetup: boolean;
  missing?: string[];
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [tab, setTab] = useState<Tab>('home');

  const refresh = useCallback(async () => {
    try {
      const data = await api<MeResponse>('/api/auth?action=me');
      setMe(data);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '连接服务器失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 页面打开时先问一下服务器"我现在登录了吗"
    refresh();
  }, [refresh]);

  if (loading) return <div className="app"><p className="muted">加载中…</p></div>;

  if (loadError || !me) {
    return (
      <div className="app">
        <div className="card">
          <h2>暂时无法使用</h2>
          <p className="error">{loadError || '连接服务器失败'}</p>
          <button className="btn" onClick={() => { setLoading(true); refresh(); }}>重试</button>
        </div>
      </div>
    );
  }

  if (!me.user) {
    return <AuthPage needsSetup={me.needsSetup} missing={me.missing ?? []} onDone={refresh} />;
  }

  const user = me.user;

  return (
    <>
      <div className="app">
        {tab === 'home' && <Home user={user} goPick={() => setTab('pick')} goDraws={() => setTab('draws')} />}
        {tab === 'pick' && <Pick />}
        {tab === 'stats' && <Stats />}
        {tab === 'draws' && <Draws isAdmin={user.isAdmin} />}
        {tab === 'settings' && (
          <Settings
            onLogout={() => { setTab('home'); setMe({ user: null, needsSetup: false }); }}
            onNameChanged={refresh}
          />
        )}
        {tab === 'admin' && user.isAdmin && <Admin currentUserId={user.id} />}
      </div>

      <nav className="nav">
        <button className={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}>首页</button>
        <button className={tab === 'pick' ? 'on' : ''} onClick={() => setTab('pick')}>选号</button>
        <button className={tab === 'draws' ? 'on' : ''} onClick={() => setTab('draws')}>开奖</button>
        <button className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}>统计</button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>设置</button>
        {user.isAdmin && (
          <button className={tab === 'admin' ? 'on' : ''} onClick={() => setTab('admin')}>管理</button>
        )}
      </nav>
    </>
  );
}

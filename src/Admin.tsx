// 管理页（仅管理员）：创建/重置/删除家人的账号；更新数据库结构
// 注意：这里只能管理账号，看不到别人的生辰和选号记录。

import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';

interface UserRow {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
}

interface Props {
  currentUserId: number;
}

export default function Admin({ currentUserId }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api<{ users: UserRow[] }>('/api/users?action=list');
      setUsers(data.users);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '读取失败');
    }
  }, []);

  useEffect(() => {
    // 页面打开时读取一次账号列表
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, okText: string) {
    setErr('');
    setMsg('');
    try {
      await fn();
      setMsg(okText);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败');
    }
  }

  function createUser(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      await api('/api/users?action=create', { method: 'POST', body: { username, password, displayName } });
      setUsername('');
      setDisplayName('');
      setPassword('');
    }, '账号已创建，请把用户名和初始密码告诉家人，让他们登录后自己改密码');
  }

  function resetPassword(u: UserRow) {
    const pw = window.prompt(`给「${u.displayName}」设置新密码（至少6位）：`);
    if (!pw) return;
    run(() => api('/api/users?action=reset_password', { method: 'POST', body: { userId: u.id, newPassword: pw } }), '密码已重置');
  }

  function deleteUser(u: UserRow) {
    if (!window.confirm(`确定删除「${u.displayName}」吗？该账号的所有数据都会一起删除，无法恢复。`)) return;
    run(() => api('/api/users?action=delete', { method: 'POST', body: { userId: u.id } }), '账号已删除');
  }

  function updateDb() {
    run(() => api('/api/auth?action=init_db', { method: 'POST' }), '数据库结构已更新');
  }

  return (
    <>
      <h1 className="page-title">管理</h1>
      <p className="page-sub">管理家人的登录账号。你看不到他们的生辰信息和选号记录。</p>

      {err && <div className="error">{err}</div>}
      {msg && <div className="success">{msg}</div>}

      <div className="card">
        <h2>账号列表</h2>
        {users.map((u) => (
          <div className="list-item" key={u.id}>
            <div>
              <b>{u.displayName}</b>
              {u.isAdmin && <span className="tag">管理员</span>}
              <div className="muted">用户名：{u.username}</div>
            </div>
            <div className="actions">
              <button className="btn ghost small" onClick={() => resetPassword(u)}>重置密码</button>
              {u.id !== currentUserId && (
                <button className="btn danger small" onClick={() => deleteUser(u)}>删除</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <form className="card" onSubmit={createUser}>
        <h2>添加家人账号</h2>
        <div className="field">
          <label>用户名（登录用，2到30个字符，不分大小写）</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" />
        </div>
        <div className="field">
          <label>显示名称</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="field">
          <label>初始密码（至少6位）</label>
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        </div>
        <button className="btn" type="submit">创建账号</button>
      </form>

      <div className="card">
        <h2>更新数据库结构</h2>
        <p className="muted">
          以后每次升级功能需要新增数据表时，我会提醒你点一下这个按钮。重复点击是安全的，不会删除任何已有数据。
        </p>
        <button className="btn ghost" onClick={updateDb}>更新数据库结构</button>
      </div>
    </>
  );
}

// 管理页（仅管理员）：
//   1) 家人账号：创建 / 重置密码 / 删除（只能管理账号，看不到别人的生辰和选号记录）
//   2) 开奖数据：检测自动获取的来源、立即同步、导入整理好的 md 文档
//   3) 更新数据库结构

import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';

interface UserRow {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
}

interface CheckStep {
  name: string;
  ok: boolean;
  detail: string;
}

interface PreviewItem {
  title: string;
  ok: boolean;
  date: string | null;
  first: string | null;
  front3: string[] | null;
  back3: string[] | null;
  back2: string | null;
  counts: number[] | null;
  errors: string[];
  warnings: string[];
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

  // 开奖数据相关
  const [steps, setSteps] = useState<CheckStep[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mdText, setMdText] = useState('');
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [importing, setImporting] = useState(false);

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

  // ---------- 开奖数据 ----------

  async function checkSource() {
    setChecking(true);
    setErr('');
    setMsg('');
    setSteps(null);
    try {
      const r = await api<{ steps: CheckStep[] }>('/api/draws?action=check_source');
      setSteps(r.steps);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '检测失败');
    } finally {
      setChecking(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setErr('');
    setMsg('');
    try {
      const r = await api<{ message: string }>('/api/draws?action=sync', { method: 'POST', body: { force: true } });
      setMsg(r.message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setMdText(String(reader.result ?? ''));
      setPreview(null);
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  async function doPreview() {
    setErr('');
    setMsg('');
    setPreview(null);
    try {
      const r = await api<{ items: PreviewItem[] }>('/api/draws?action=import_preview', {
        method: 'POST',
        body: { text: mdText },
      });
      setPreview(r.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '识别失败');
    }
  }

  async function doImport() {
    setImporting(true);
    setErr('');
    setMsg('');
    try {
      const r = await api<{ message: string }>('/api/draws?action=import', { method: 'POST', body: { text: mdText } });
      setMsg(r.message);
      setPreview(null);
      setMdText('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '导入失败');
    } finally {
      setImporting(false);
    }
  }

  const okCount = preview?.filter((p) => p.ok).length ?? 0;

  return (
    <>
      <h1 className="page-title">管理</h1>
      <p className="page-sub">管理家人的登录账号和开奖数据。你看不到家人的生辰信息和选号记录。</p>

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
        <h2>开奖数据：自动获取</h2>
        <p className="muted">
          系统会在大家打开页面、发现缺少新的一期时自动去获取。下面两个按钮用来排查和手动触发。
        </p>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn ghost small" onClick={checkSource} disabled={checking}>
            {checking ? '检测中…' : '检测数据源是否可用'}
          </button>
          <button className="btn ghost small" onClick={syncNow} disabled={syncing}>
            {syncing ? '获取中…' : '立即获取今年的开奖数据'}
          </button>
        </div>
        {steps && (
          <div style={{ marginTop: 12 }}>
            {steps.map((s) => (
              <div key={s.name} className="preview">
                <b className={s.ok ? 'success' : 'error'}>{s.ok ? '✓ ' : '✗ '}{s.name}</b>
                <div className="muted">{s.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>开奖数据：导入 md 文档</h2>
        <p className="muted">
          自动获取不可用时，用这个。格式和你整理的"泰国政府彩票_2016-10-16_中奖结果.md"一样即可，
          一个文件里可以放很多期（每期以带日期的一级标题"# …"开头）。
          二到五等奖可以不放，缺的话那一期就只能对头奖、邻号、前三、后三、后两位。
          重复导入同一期会覆盖旧数据。
        </p>
        <div className="field">
          <input type="file" accept=".md,.txt,text/markdown,text/plain" onChange={onPickFile} />
        </div>
        <div className="field">
          <label>或者直接把内容粘贴到这里</label>
          <textarea
            className="big-text mono"
            value={mdText}
            onChange={(e) => {
              setMdText(e.target.value);
              setPreview(null);
            }}
          />
        </div>
        <button className="btn ghost small" onClick={doPreview} disabled={!mdText.trim()}>先识别看看</button>

        {preview && (
          <div style={{ marginTop: 12 }}>
            {preview.map((p, i) => (
              <div key={i} className="preview">
                <b className={p.ok ? 'success' : 'error'}>
                  {p.ok ? `✓ ${p.date}` : `✗ ${p.title || '无法识别的一段内容'}`}
                </b>
                {p.ok && (
                  <div className="muted">
                    头奖 {p.first}；前三 {p.front3?.join('/')}；后三 {p.back3?.join('/')}；后二 {p.back2}；
                    二到五等奖号码数 {p.counts?.join('/')}
                  </div>
                )}
                {p.errors.map((t) => <div key={t} className="error">{t}</div>)}
                {p.warnings.map((t) => <div key={t} className="muted">提醒：{t}</div>)}
              </div>
            ))}
            <button className="btn" style={{ marginTop: 10 }} onClick={doImport} disabled={importing || okCount === 0}>
              {importing ? '导入中…' : `确认导入 ${okCount} 期`}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2>更新数据库结构</h2>
        <p className="muted">
          每次升级功能需要新增数据表时，我会提醒你点一下这个按钮。重复点击是安全的，不会删除任何已有数据。
        </p>
        <button className="btn ghost" onClick={updateDb}>更新数据库结构</button>
      </div>
    </>
  );
}

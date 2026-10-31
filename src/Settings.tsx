// 设置页：个人生辰信息、喜用五行、幸运数字、修改密码、退出登录

import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { CITIES, OTHER_CITY } from './cities.ts';
import BaziCard from './BaziCard.tsx';

interface Profile {
  displayName: string;
  birthDate: string | null;
  birthHour: number | null;
  birthMinute: number | null;
  birthCity: string | null;
  birthTz?: number | null;
  birthLongitude: number | null;
  manualElements: string[];
  luckyNumber: number | null;
}

const ELEMENTS = ['金', '木', '水', '火', '土'];

const pad = (n: number) => String(n).padStart(2, '0');

interface Props {
  onLogout: () => void;
  onNameChanged: () => void;
}

export default function Settings({ onLogout, onNameChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [timeKnown, setTimeKnown] = useState(true);
  const [birthTime, setBirthTime] = useState('');
  const [city, setCity] = useState('');
  const [customLongitude, setCustomLongitude] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [customTz, setCustomTz] = useState('7');
  const [elements, setElements] = useState<string[]>([]);
  const [lucky, setLucky] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  useEffect(() => {
    api<{ profile: Profile }>('/api/profile?action=get')
      .then(({ profile: p }) => {
        setDisplayName(p.displayName);
        setBirthDate(p.birthDate ?? '');
        if (p.birthHour === null) {
          // 没有填过出生时间：默认认为"知道"，让用户直接填
          setTimeKnown(true);
          setBirthTime('');
        } else {
          setTimeKnown(true);
          setBirthTime(`${pad(p.birthHour)}:${pad(p.birthMinute ?? 0)}`);
        }
        if (p.birthCity) {
          const known = CITIES.some((c) => c.name === p.birthCity);
          setCity(known ? p.birthCity : OTHER_CITY);
          if (!known) {
            setCustomCity(p.birthCity === OTHER_CITY ? '' : p.birthCity);
            if (p.birthLongitude !== null) setCustomLongitude(String(p.birthLongitude));
            if (p.birthTz !== null && p.birthTz !== undefined) setCustomTz(String(p.birthTz));
          }
        }
        setElements(p.manualElements);
        setLucky(p.luckyNumber === null ? '' : String(p.luckyNumber));
      })
      .catch((e) => setErr(e instanceof Error ? e.message : '读取失败'))
      .finally(() => setLoading(false));
  }, []);

  function toggleElement(el: string) {
    setElements((cur) => (cur.includes(el) ? cur.filter((x) => x !== el) : [...cur, el]));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    setErr('');
    setSaving(true);
    try {
      let birthHour: number | null = null;
      let birthMinute: number | null = null;
      if (timeKnown && birthTime) {
        const [h, m] = birthTime.split(':').map(Number);
        birthHour = h;
        birthMinute = m;
      }

      let birthCity: string | null = null;
      let birthLongitude: number | null = null;
      if (city === OTHER_CITY) {
        birthCity = customCity.trim() || '其他';
        birthLongitude = customLongitude === '' ? null : Number(customLongitude);
      } else if (city) {
        birthCity = city;
        birthLongitude = CITIES.find((c) => c.name === city)?.longitude ?? null;
      }

      await api('/api/profile?action=save', {
        method: 'POST',
        body: {
          displayName,
          birthDate: birthDate || null,
          birthHour,
          birthMinute,
          birthCity,
          birthLongitude,
          birthTz: city === OTHER_CITY ? Number(customTz) : null,
          manualElements: elements,
          luckyNumber: lucky === '' ? null : Number(lucky),
        },
      });
      setMsg('已保存');
      setSavedCount((c) => c + 1);
      onNameChanged();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg('');
    setPwErr('');
    try {
      await api('/api/auth?action=change_password', {
        method: 'POST',
        body: { oldPassword: oldPw, newPassword: newPw },
      });
      setPwMsg('密码已修改');
      setOldPw('');
      setNewPw('');
    } catch (e2) {
      setPwErr(e2 instanceof Error ? e2.message : '修改失败');
    }
  }

  async function logout() {
    await api('/api/auth?action=logout', { method: 'POST' }).catch(() => undefined);
    onLogout();
  }

  if (loading) return <p className="muted">加载中…</p>;

  return (
    <>
      <h1 className="page-title">我的设置</h1>
      <p className="page-sub">你的生辰信息只有你自己能看到，管理员也看不到。</p>

      <form className="card" onSubmit={save}>
        <h2>基本信息</h2>
        <div className="field">
          <label>显示名称（首页问候用，可以填昵称）</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>

        <div className="field">
          <label>出生日期（公历）</label>
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </div>

        <div className="field">
          <label>出生时间</label>
          <input type="time" value={birthTime} disabled={!timeKnown} onChange={(e) => setBirthTime(e.target.value)} />
          <label className="check">
            <input
              type="checkbox"
              checked={!timeKnown}
              onChange={(e) => {
                setTimeKnown(!e.target.checked);
                if (e.target.checked) setBirthTime('');
              }}
            />
            不清楚出生时间
          </label>
        </div>

        <div className="field">
          <label>出生城市（用来校正真太阳时）</label>
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">请选择</option>
            {CITIES.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
            <option value={OTHER_CITY}>其他（自己填写城市）</option>
          </select>
        </div>

        {city === OTHER_CITY && (
          <>
            <div className="field">
              <label>出生城市名称（自己填写，例如 拉萨、乌隆）</label>
              <input type="text" maxLength={30} value={customCity} onChange={(e) => setCustomCity(e.target.value)} />
            </div>
            <div className="field">
              <label>出生地经度（东经为正，例如 91.13；搜索“城市名 经度”即可查到）</label>
              <input type="number" step="0.01" value={customLongitude} onChange={(e) => setCustomLongitude(e.target.value)} />
            </div>
            <div className="field">
              <label>出生地当时使用的时区</label>
              <select value={customTz} onChange={(e) => setCustomTz(e.target.value)}>
                <option value="7">东七区（泰国、越南、柬埔寨、老挝）</option>
                <option value="8">东八区（中国大陆、港澳台、新加坡、马来西亚）</option>
                <option value="9">东九区（日本、韩国）</option>
                <option value="0">零时区（英国）</option>
                <option value="1">东一区（欧洲中部）</option>
                <option value="-5">西五区（美国东部）</option>
                <option value="-8">西八区（美国西部）</option>
              </select>
            </div>
          </>
        )}

        <h2 style={{ marginTop: 20 }}>选号偏好（可选）</h2>
        <div className="field">
          <label>手动指定喜用五行（不填则以后由系统按八字推算；找老师批过八字的可以直接填）</label>
          <div className="chips">
            {ELEMENTS.map((el) => (
              <button
                type="button"
                key={el}
                className={`chip ${elements.includes(el) ? 'on' : ''}`}
                onClick={() => toggleElement(el)}
              >
                {el}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>固定幸运数字（0 到 99，可不填）</label>
          <input type="number" min={0} max={99} value={lucky} onChange={(e) => setLucky(e.target.value)} />
        </div>

        {err && <div className="error">{err}</div>}
        {msg && <div className="success">{msg}</div>}
        <button className="btn block" type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</button>
      </form>

      <BaziCard refreshKey={savedCount} />

      <form className="card" onSubmit={changePassword}>
        <h2>修改密码</h2>
        <div className="field">
          <label>原密码</label>
          <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" />
        </div>
        <div className="field">
          <label>新密码（至少6位）</label>
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
        </div>
        {pwErr && <div className="error">{pwErr}</div>}
        {pwMsg && <div className="success">{pwMsg}</div>}
        <button className="btn ghost" type="submit">修改密码</button>
      </form>

      <button className="btn ghost block" onClick={logout}>退出登录</button>
    </>
  );
}

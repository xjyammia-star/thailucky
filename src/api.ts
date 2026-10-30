// 前端调用后端接口的统一入口。
// 后端返回 { success: false, error: '...' } 时，这里会抛出带中文提示的错误，页面直接显示即可。

export interface CurrentUser {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
}

export async function api<T = Record<string, unknown>>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });

  let data: { success?: boolean; error?: string } & Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    throw new Error(`服务器没有返回正常数据（状态码 ${res.status}）`);
  }
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `请求失败（状态码 ${res.status}）`);
  }
  return data as T;
}

// ---------- 开奖数据的类型（前后端共用的数据长相） ----------

export interface DrawSummary {
  date: string; // 2026-10-16
  first: string;
  near: string[];
  front3: string[];
  back3: string[];
  back2: string;
  hasFull?: boolean; // 是否有完整的二到五等奖
}

export interface DrawFull extends DrawSummary {
  prize2: string[] | null;
  prize3: string[] | null;
  prize4: string[] | null;
  prize5: string[] | null;
}

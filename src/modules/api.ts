import { getStringPref, setPref } from "../utils/prefs";

const DEFAULT_SERVER = "https://ainote.easylinkin.com:18048/prod-api";

export function getServerUrl(): string {
  return getStringPref("serverUrl") || DEFAULT_SERVER;
}

interface RequestOpts {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  token?: string;
}

async function httpRequest(
  method: "GET" | "POST",
  path: string,
  opts: RequestOpts = {},
): Promise<{ status: number; body: any }> {
  const base = getServerUrl();
  let url = base + path;
  if (opts.query) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) p.set(k, String(v));
    }
    url += "?" + p.toString();
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.token) headers["Authorization"] = "Bearer " + opts.token;

  const init: any = { method, headers };
  if (method === "POST" && opts.body) init.body = JSON.stringify(opts.body);

  const res = await fetch(url, init);
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { code: res.status, msg: text.slice(0, 500), data: null };
  }
  return { status: res.status, body: json };
}

/** Login with an API key; stores token/userId into prefs. */
export async function login(
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await httpRequest("POST", "/app/mcp/login", {
      body: { apiKey },
    });
    const b = r.body;
    if (b.code !== 200) return { ok: false, error: b.msg || "登录失败" };
    const data = b.data || {};
    const token: string =
      typeof data === "string" ? data : data.token;
    if (!token) return { ok: false, error: "登录响应缺少 token" };
    const userId =
      (data.user && data.user.userId) || data.userId || "";
    setPref("token", token);
    setPref("userId", userId);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: "网络请求失败: " + (e?.message || e) };
  }
}

/**
 * Authed GET. If the backend reports a non-200 code, retry once by
 * re-logging-in with the stored API key.
 */
async function authedGet(
  path: string,
  query?: RequestOpts["query"],
): Promise<any> {
  let token = getStringPref("token");
  if (!token) {
    throw new Error("未登录，请先在设置中填入 API Key 并登录");
  }
  let r = await httpRequest("GET", path, { query, token });
  if (r.body.code !== 200) {
    const apiKey = getStringPref("apiKey");
    if (apiKey) {
      const relogin = await login(apiKey);
      if (relogin.ok) {
        token = getStringPref("token");
        r = await httpRequest("GET", path, { query, token });
      }
    }
  }
  return r.body;
}

export interface RecordingListItem {
  audioId: string;
  name: string;
  recordNickName?: string;
  recordName?: string;
  recordTime?: string;
  delFlag?: string;
  transcriptStatus?: string;
  summaryStatus?: string;
}

export async function fetchRecordingList(
  page: number,
  size: number,
  keyword?: string,
): Promise<{ total: number; list: RecordingListItem[] }> {
  const query: Record<string, string | number | undefined> = { page, size };
  if (keyword) query.keyword = keyword;
  const body = await authedGet("/app/recording/list", query);
  if (body.code !== 200) {
    throw new Error(body.msg || "获取录音列表失败");
  }
  const data = body.data || {};
  const list: RecordingListItem[] = data.list || data.rows || data.records || [];
  return {
    total: data.total != null ? data.total : list.length,
    list,
  };
}

export interface TranscriptSegment {
  spokesperson?: string;
  time?: string;
  text?: string;
}

export async function fetchTranscript(
  audioId: string,
): Promise<TranscriptSegment[]> {
  const body = await authedGet(`/share/${audioId}/transcript/result`);
  if (body.code !== 200) {
    throw new Error(body.msg || "获取转写失败");
  }
  return body.data || [];
}

export async function fetchSummary(audioId: string): Promise<string> {
  const body = await authedGet(`/share/${audioId}/summary`);
  if (body.code !== 200) {
    throw new Error(body.msg || "获取总结失败");
  }
  const d = body.data || {};
  return d.summaryContent || "";
}

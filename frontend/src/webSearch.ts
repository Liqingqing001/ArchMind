import policy from "../../backend/data/web-search-policy.json" with { type: "json" };
import type { Workflow } from "./solutionFlow.ts";
export const SEARCH_SETTINGS_KEY = "archmind-web-search-settings-v1";
export const SEARCH_SETTINGS_EVENT = "archmind-web-search-settings-changed";
export const searchPolicy = policy;
export type SearchConnection = {
  provider: "tavily" | "bocha";
  api_key: string;
  enabled: boolean;
};
export type WebResult = {
  citation_id: string;
  title: string;
  url: string;
  excerpt: string;
  searched_at: string;
  published_at: string | null;
  content_kind: "page_excerpt" | "search_summary";
  source_type: "official" | "web";
};
export type WebSearch = {
  status: "disabled" | "ok" | "empty" | "partial" | "error";
  provider: string | null;
  searched_at: string | null;
  queries: string[];
  results: WebResult[];
  errors: string[];
};
export const disabledSearch = (): WebSearch => ({
  status: "disabled",
  provider: null,
  searched_at: null,
  queries: [],
  results: [],
  errors: [],
});
export function normalizeSearch(input: SearchConnection): SearchConnection {
  if (
    !input ||
    !Object.hasOwn(policy.providers, input.provider) ||
    typeof input.api_key !== "string" ||
    typeof input.enabled !== "boolean"
  )
    throw Error("请选择有效的检索服务配置");
  const key = input.api_key.trim();
  if (key.length > 4096 || (input.enabled && !key))
    throw Error("启用联网检索需要填写搜索服务 API Key");
  return { provider: input.provider, api_key: key, enabled: input.enabled };
}
export function loadSearchSettings(
  storage?: Pick<Storage, "getItem">,
): SearchConnection {
  try {
    const saved = JSON.parse(
      (storage || localStorage).getItem(SEARCH_SETTINGS_KEY) || "null",
    );
    return saved?.version === 1
      ? normalizeSearch(saved.connection)
      : { provider: "bocha", api_key: "", enabled: false };
  } catch {
    return { provider: "bocha", api_key: "", enabled: false };
  }
}
export function saveSearchSettings(
  input: SearchConnection,
  storage?: Pick<Storage, "setItem">,
) {
  const clean = normalizeSearch(input);
  try {
    (storage || localStorage).setItem(
      SEARCH_SETTINGS_KEY,
      JSON.stringify({ version: 1, connection: clean }),
    );
  } catch {
    throw Error("浏览器不允许保存检索配置");
  }
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(SEARCH_SETTINGS_EVENT));
  return clean;
}
export function clearSearchSettings(storage?: Pick<Storage, "removeItem">) {
  try {
    (storage || localStorage).removeItem(SEARCH_SETTINGS_KEY);
  } catch {
    throw Error("无法清除检索配置，请检查浏览器存储权限");
  }
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(SEARCH_SETTINGS_EVENT));
}
export function redact(text: string, secrets: string[] = []) {
  let value = text;
  for (const key of secrets.filter((k) => k.length >= 4))
    value = value.split(key).join("[已移除密钥]");
  return value;
}
export function searchQueries(
  workflow: Workflow,
  prompt: string,
  secrets: string[] = [],
) {
  const goal = redact(workflow.fields.goal?.value || prompt, secrets)
    .replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+|(?:\+?86)?1[3-9]\d{9}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 110);
  const current = redact(prompt, secrets)
    .replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+|(?:\+?86)?1[3-9]\d{9}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hint = policy.query_hints.find((h) =>
    h.cues.some((c) => goal.toLowerCase().includes(c)),
  );
  const query = goal + " 官方 文档 " + (hint?.topic || "技术选型");
  const follow = /^(?:生成|确认|可以|好的|好|开始|现在生成|请续写)/.test(
    current,
  )
    ? ""
    : current.slice(0, 70);
  return [
    ...new Set([
      query,
      goal + " " + (follow || hint?.details || "部署 计费 使用限制 官方"),
    ]),
  ]
    .map((q) => q.trim().slice(0, 190))
    .slice(0, policy.max_queries);
}
export function safeWebUrl(
  value: unknown,
  secrets: string[] = [],
): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.hostname === "localhost" ||
      u.hostname.endsWith(".local") ||
      u.hostname.endsWith(".internal") ||
      /^[\d.]+$/.test(u.hostname) ||
      u.hostname.includes(":")
    )
      return null;
    if (
      secrets.some(
        (k) =>
          k.length >= 4 &&
          (value.includes(k) || decodeURIComponent(value).includes(k)),
      )
    )
      return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}
export function searchRequest(connection: SearchConnection, query: string) {
  const c = normalizeSearch(connection);
  return {
    url: policy.providers[c.provider].url,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + c.api_key,
    },
    payload:
      c.provider === "tavily"
        ? {
            query,
            search_depth: "basic",
            max_results: 4,
            include_answer: false,
            include_raw_content: "text",
            auto_parameters: false,
          }
        : { query, freshness: "noLimit", summary: true, count: 4 },
  };
}
export function parseSearchResults(
  provider: SearchConnection["provider"],
  data: any,
  searchedAt: string,
  secrets: string[] = [],
): WebResult[] {
  let rows: any[];
  if (provider === "tavily") {
    if (!Array.isArray(data?.results)) throw Error("检索服务返回格式无效");
    rows = data.results;
  } else {
    if (data?.code !== undefined && Number(data.code) !== 200)
      throw Error("检索服务返回业务错误，请检查密钥或额度");
    const pages = (data?.data || data)?.webPages;
    if (!pages || !Array.isArray(pages.value))
      throw Error("检索服务返回格式无效");
    rows = pages.value;
  }
  const results: WebResult[] = [];
  for (const row of rows) {
    const url = safeWebUrl(row?.url, secrets);
    if (!url) continue;
    const raw =
      typeof row.raw_content === "string" && row.raw_content.trim()
        ? row.raw_content
        : null;
    const summary = row.summary || row.content || row.snippet;
    const text = raw && typeof summary==='string' && summary.trim()
      ? '搜索摘要：'+summary.slice(0,800)+'\n页面摘录：'+raw.slice(0,800)
      : raw || summary;
    if (typeof text !== "string" || !text.trim()) continue;
    const host = new URL(url).hostname;
    results.push({
      citation_id: "",
      title: redact(
        typeof (row.title || row.name) === "string"
          ? row.title || row.name
          : host,
        secrets,
      ).slice(0, 180),
      url,
      excerpt: redact(text, secrets).slice(0, policy.excerpt_chars),
      searched_at: searchedAt,
      published_at:
        typeof (row.published_date || row.datePublished) === "string" &&
        /^\d{4}-\d{2}-\d{2}/.test(row.published_date || row.datePublished)
          ? (row.published_date || row.datePublished).slice(0, 60)
          : null,
      content_kind: raw ? "page_excerpt" : "search_summary",
      source_type: policy.official_domains.some(
        (d) => host === d || host.endsWith("." + d),
      )
        ? "official"
        : "web",
    });
  }
  return results;
}
export function combineSearch(
  provider: string,
  queries: string[],
  at: string,
  batches: WebResult[][],
  errors: string[],
): WebSearch {
  const unique = new Map<string, WebResult>();
  for (const row of batches.flat())
    if (!unique.has(row.url)) unique.set(row.url, row);
  const results = [...unique.values()]
    .sort(
      (a, b) =>
        Number(b.source_type === "official") -
        Number(a.source_type === "official"),
    )
    .slice(0, policy.max_results)
    .map((r, i) => ({ ...r, citation_id: `W${i + 1}` }));
  return {
    status: errors.length
      ? results.length
        ? "partial"
        : "error"
      : results.length
        ? "ok"
        : "empty",
    provider,
    searched_at: at,
    queries,
    results,
    errors,
  };
}
async function requestJson(
  request: ReturnType<typeof searchRequest>,
  fetcher: typeof fetch,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetcher(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.payload),
      mode: "cors",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok)
      throw Error(
        response.status === 401 || response.status === 403
          ? "检索服务拒绝访问，请检查搜索 Key 和权限"
          : response.status === 429
            ? "检索额度不足或请求过多"
            : `检索服务返回 HTTP ${response.status}`,
      );
    const reader = response.body?.getReader();
    let raw = "",
      size = 0;
    const decoder = new TextDecoder();
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 2 * 1024 * 1024) throw Error("检索响应过大");
          raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    } else raw = await response.text();
    try {
      return JSON.parse(raw);
    } catch {
      throw Error("检索服务未返回有效 JSON");
    }
  } catch (error) {
    if (controller.signal.aborted) throw Error("联网检索超时");
    if (error instanceof TypeError)
      throw Error(
        "浏览器无法连接检索服务，请检查搜索 Key、网络和 CORS；完整后端版可由服务器发起检索",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export async function searchWeb(
  input: SearchConnection | undefined,
  workflow: Workflow,
  prompt: string,
  secrets: string[] = [],
  fetcher: typeof fetch = fetch,
): Promise<WebSearch> {
  if (!input?.enabled) return disabledSearch();
  const c = normalizeSearch(input),
    allSecrets = [c.api_key, ...secrets],
    queries = searchQueries(workflow, prompt, allSecrets),
    at = new Date().toISOString();
  const settled = await Promise.allSettled(
    queries.map(async (q) =>
      parseSearchResults(
        c.provider,
        await requestJson(searchRequest(c, q), fetcher),
        at,
        allSecrets,
      ),
    ),
  );
  return combineSearch(
    c.provider,
    queries,
    at,
    settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    settled.flatMap((r) =>
      r.status === "rejected"
        ? [r.reason instanceof Error ? r.reason.message : "检索失败"]
        : [],
    ),
  );
}
export function searchWarnings(web: WebSearch) {
  return web.status === "error"
    ? [
        "联网检索失败，本轮仅使用库内资料；没有取得实时网页证据。",
        ...web.errors,
      ]
    : web.status === "partial"
      ? ["部分联网检索失败，网页依据不完整。", ...web.errors]
      : web.status === "empty"
        ? ["本轮联网未找到可用网页，不代表相关产品不存在。"]
        : [];
}

export async function testBrowserSearch(
  input: SearchConnection,
  fetcher: typeof fetch = fetch,
) {
  const c = normalizeSearch({ ...input, enabled: true });
  const rows = parseSearchResults(
    c.provider,
    await requestJson(searchRequest(c, "GPU 云服务器 官方文档"), fetcher),
    new Date().toISOString(),
    [c.api_key],
  );
  return { ok: true, count: rows.length, provider: c.provider };
}

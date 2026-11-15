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
  read_at?: string;
};
export type WebSearch = {
  status: "disabled" | "ok" | "empty" | "partial" | "error";
  provider: string | null;
  searched_at: string | null;
  queries: string[];
  results: WebResult[];
  errors: string[];
  reused?: boolean;
  page_reading?: { attempted: number; succeeded: number; failed: number };
};
export const disabledSearch = (): WebSearch => ({
  status: "disabled",
  provider: null,
  searched_at: null,
  queries: [],
  results: [],
  errors: [],
});
export function reusableSearch(web: WebSearch | undefined, workflow: Workflow, now = Date.now()) {
  if (workflow.response_mode !== "explanation" || !web || !["ok", "partial"].includes(web.status) || !web.results.length || !web.searched_at) return false;
  const stamp = /(?:Z|[+-]\d\d:\d\d)$/.test(web.searched_at) ? web.searched_at : web.searched_at + "Z";
  const age = now - Date.parse(stamp);
  return age >= 0 && age <= policy.reuse_minutes * 60_000;
}
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
  if (hint && "queries" in hint && hint.queries) {
    const detail = redact(workflow.fields.requirements?.value || "", secrets)
      .replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+|(?:\+?86)?1[3-9]\d{9}/g, " ").replace(/\s+/g, " ").trim().slice(0, 35);
    const follow = current === goal || /^(?:生成|确认|可以|好的|好|开始|现在生成|请续写)/.test(current) ? "" : current.slice(0, 35);
    const subject = [...new Set([goal.slice(0,65), follow, detail].filter(Boolean))].join(" ");
    return hint.queries.map(q => q.replace("{goal}", subject).slice(0,300)).slice(0,policy.max_queries);
  }
  const query =
    hint && "discovery" in hint
      ? goal + " " + hint.discovery
      : goal + " 官方 文档 " + (hint?.topic || "技术选型");
  const follow = /^(?:生成|确认|可以|好的|好|开始|现在生成|请续写)/.test(
    current,
  )
    ? ""
    : current.slice(0, 70);
  return [
    ...new Set([
      query,
      goal + " " + (follow || (hint && "details" in hint && hint.details) || "部署 计费 使用限制 官方"),
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
            ...(query.includes("site:") ? { include_domains: [...query.matchAll(/site:([a-z0-9.-]+)/g)].map(m=>m[1]) } : {}),
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
    const text =
      raw && typeof summary === "string" && summary.trim()
        ? "搜索摘要：" +
          summary.slice(0, 600) +
          "\n页面摘录：" +
          raw.slice(0, policy.excerpt_chars - 620)
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
  // Reserve room for both platform discovery and technical/cost research.
  const ordered = batches.map((batch) =>
    [...batch].sort(
      (a, b) =>
        Number(b.source_type === "official") -
        Number(a.source_type === "official"),
    ),
  );
  for (let i = 0; i < Math.max(0, ...ordered.map((batch) => batch.length)); i++)
    for (const batch of ordered) {
      const row = batch[i];
      if (row && !unique.has(row.url)) unique.set(row.url, row);
    }
  const results = [...unique.values()]
    .sort((a,b) => Number(b.source_type === "official") - Number(a.source_type === "official"))
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
  const web = combineSearch(
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
  if (queries.some(q=>q.includes("site:"))) {
    const targets = web.results.filter(r=>r.source_type === "official" && r.content_kind === "search_summary").slice(0,3);
    const reads = await Promise.allSettled(targets.map(row=>readOfficialPage(row,allSecrets,fetcher)));
    reads.forEach((read,i)=>{ if(read.status === "fulfilled") Object.assign(targets[i],read.value); });
    const failed = reads.filter(r=>r.status === "rejected").length;
    web.page_reading = {attempted: targets.length, succeeded: targets.length-failed, failed};
  }
  return web;
}
/** Public pages only, with no model/search credentials, cookies, or redirects. */
export async function readOfficialPage(row: WebResult, secrets: string[], fetcher: typeof fetch = fetch): Promise<WebResult> {
  const url = safeWebUrl(row.url,secrets);
  const host = url && new URL(url).hostname;
  if (!url || !host || !policy.official_domains.some(d=>host === d || host.endsWith("."+d))) throw Error("非官网页面不自动读取");
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),12_000);
  try {
    const response = await fetcher(url,{method:"GET",mode:"cors",credentials:"omit",redirect:"error",referrerPolicy:"no-referrer",signal:controller.signal});
    if (!response.ok || !/text\//i.test(response.headers.get("content-type") || "")) throw Error("官网正文不可读取");
    const reader = response.body?.getReader();
    if (!reader) throw Error("没有正文");
    const decoder = new TextDecoder();
    let raw="",size=0;
    try {
      while(true) {
        const {done,value}=await reader.read(); if(done) break;
        size+=value.length; if(size>2*1024*1024) { controller.abort(); throw Error("官网页面过大"); }
        raw+=decoder.decode(value,{stream:true});
      }
      raw+=decoder.decode();
    } finally { reader.releaseLock(); }
    if (/html/i.test(response.headers.get("content-type") || "")) {
      const doc = new DOMParser().parseFromString(raw,"text/html");
      doc.querySelectorAll("script,style,nav,footer,noscript,iframe").forEach(el=>el.remove());
      raw=doc.body?.textContent || "";
    }
    const content=raw.split("\n").map(l=>l.trim()).filter(Boolean).join("\n");
    if(content.length<120) throw Error("官网正文不足");
    return {...row,excerpt:redact(content,secrets).slice(0,policy.excerpt_chars),content_kind:"page_excerpt",read_at:new Date().toISOString()};
  } finally { clearTimeout(timer); }
}
export function searchWarnings(web: WebSearch) {
  const warnings = web.status === "disabled" ? ["尚未启用联网检索，本轮仅参考库内资料，未核验最新能力与价格；可在对话顶部连接搜索服务。"] : web.status === "error"
    ? [
        "联网检索失败，本轮仅使用库内资料；没有取得实时网页证据。",
        ...web.errors,
      ]
    : web.status === "partial"
      ? ["部分联网检索失败，网页依据不完整。", ...web.errors]
      : web.status === "empty"
        ? ["本轮联网未找到可用网页，不代表相关产品不存在。"]
        : [];
  if (web.results.length && !web.results.some(r=>r.source_type === "official")) warnings.push("本轮未取得官网依据，候选能力与价格仍待官方核验。");
  if (web.results.length && web.results.every(r=>r.content_kind === "search_summary")) warnings.push("当前取得的是搜索摘要，尚未读取官网正文；不能据此确认完整参数或价格。");
  if (web.page_reading?.failed) warnings.push("部分官网正文读取失败，已保留搜索摘要；这些条目的完整参数仍待核验。");
  return warnings;
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

import { selectionContext } from "./recommendations.ts";
import { disabledSearch, searchPolicy, searchWarnings } from "./webSearch.ts";
import type { WebSearch } from "./webSearch.ts";
import { solutionPolicy, editorialGuide } from "./solutionFlow.ts";
import type { Workflow } from "./solutionFlow.ts";
import type { Connection } from "./modelProviders.ts";
export const MODEL_SETTINGS_KEY = "archmind-model-settings-v1";
export const MODEL_SETTINGS_EVENT = "archmind-model-settings-changed";
export type SavedModel = { provider: string; connection: Connection };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function normalizeConnection(input: Connection): Connection {
  let base = input.base_url.trim().replace(/\/+$/, "");
  let protocol = input.protocol;
  for (const [suffix, kind] of [
    ["/chat/completions", "chat_completions"],
    ["/responses", "responses"],
    ["/messages", "anthropic"],
  ] as const) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      protocol = kind;
      break;
    }
  }
  if (base === "https://api.openai.com" || base === "https://api.anthropic.com")
    base += "/v1";
  let address: URL;
  try {
    address = new URL(base);
  } catch {
    throw new Error("请填写有效的 HTTPS 接口地址");
  }
  if (
    address.protocol !== "https:" ||
    address.username ||
    address.password ||
    address.search ||
    address.hash
  )
    throw new Error("接口必须是无凭据、无查询参数的 HTTPS 地址");
  const key = input.api_key.trim(),
    model = input.model.trim();
  if (!key || key.length > 4096 || !model || model.length > 200)
    throw new Error("请填写有效的 API Key 和模型 ID");
  if (!["chat_completions", "responses", "anthropic"].includes(protocol))
    throw new Error("请选择有效的接口协议");
  if (
    !Number.isInteger(input.max_output_tokens) ||
    input.max_output_tokens < 256 ||
    input.max_output_tokens > 8192
  )
    throw new Error("输出上限应为 256 到 8192 tokens");
  return {
    base_url: base,
    api_key: key,
    model,
    protocol,
    token_parameter:
      input.token_parameter === "max_completion_tokens"
        ? "max_completion_tokens"
        : "max_tokens",
    max_output_tokens: input.max_output_tokens,
  };
}
export function loadModelSettings(storage?: StorageLike): SavedModel | null {
  try {
    const value = JSON.parse(
      (storage || localStorage).getItem(MODEL_SETTINGS_KEY) || "null",
    );
    return value?.version === 1 && typeof value.provider === "string"
      ? {
          provider: value.provider,
          connection: normalizeConnection(value.connection),
        }
      : null;
  } catch {
    return null;
  }
}
const announce = () => {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(MODEL_SETTINGS_EVENT));
};
export function saveModelSettings(
  connection: Connection,
  provider: string,
  storage?: StorageLike,
) {
  const clean = normalizeConnection(connection);
  try {
    (storage || localStorage).setItem(
      MODEL_SETTINGS_KEY,
      JSON.stringify({ version: 1, provider, connection: clean }),
    );
  } catch {
    throw new Error("浏览器不允许保存本地配置，请允许此站点存储后重试");
  }
  announce();
  return clean;
}
export function clearModelSettings(storage?: StorageLike) {
  try {
    (storage || localStorage).removeItem(MODEL_SETTINGS_KEY);
  } catch {
    throw new Error("无法清除本地配置，请检查浏览器存储权限");
  }
  announce();
}
export function browserRequest(
  connection: Connection,
  messages: ModelMessage[],
  limit = connection.max_output_tokens,
) {
  const c = normalizeConnection(connection);
  let headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + c.api_key,
  };
  let path: string, payload: Record<string, unknown>;
  if (c.protocol === "anthropic") {
    path = "/messages";
    headers = {
      "Content-Type": "application/json",
      "x-api-key": c.api_key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
    payload = {
      model: c.model,
      max_tokens: limit,
      stream: false,
      messages: messages.filter((m) => m.role !== "system"),
      system: messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n"),
    };
  } else if (c.protocol === "responses") {
    path = "/responses";
    payload = {
      model: c.model,
      input: messages,
      max_output_tokens: limit,
      stream: false,
      store: false,
    };
  } else {
    path = "/chat/completions";
    payload = {
      model: c.model,
      messages,
      [c.token_parameter]: limit,
      stream: false,
    };
  }
  return { url: c.base_url + path, headers, payload, connection: c };
}
export function parseBrowserReply(
  protocol: Connection["protocol"],
  data: any,
): { answer: string; finish: string } {
  let content: any,
    finish = "stop";
  if (protocol === "anthropic") {
    content = data.content
      ?.filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
    if (data.stop_reason === "max_tokens") finish = "length";
  } else if (protocol === "responses") {
    content = data.output
      ?.filter((i: any) => i.type === "message")
      .flatMap((i: any) => i.content || [])
      .filter((c: any) => c.type === "output_text")
      .map((c: any) => c.text)
      .join("\n");
    if (data.status === "incomplete")
      finish =
        data.incomplete_details?.reason === "content_filter"
          ? "content_filter"
          : "length";
  } else {
    content = data.choices?.[0]?.message?.content;
    if (Array.isArray(content))
      content = content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
    finish = data.choices?.[0]?.finish_reason || "stop";
  }
  if (typeof content !== "string" || !content.trim())
    throw new Error("模型没有返回文本正文，请检查协议、模型 ID 或输出上限");
  return { answer: content, finish };
}
export async function completeBrowser(
  connection: Connection,
  messages: ModelMessage[],
  limit?: number,
  fetcher: typeof fetch = fetch,
) {
  const request = browserRequest(connection, messages, limit);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75000);
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
    if (!response.ok) {
      const message =
        response.status === 401 || response.status === 403
          ? "模型服务拒绝访问，请检查 API Key 和模型权限"
          : response.status === 429
            ? "模型服务额度不足或请求过多，请稍后重试"
            : response.status === 404
              ? "接口或模型不存在，请检查协议、地址和模型 ID"
              : `模型服务返回 HTTP ${response.status}，请检查服务状态`;
      throw new Error(message);
    }
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let raw = "",
      size = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 2 * 1024 * 1024) {
            controller.abort();
            throw new Error("模型回复超过 2 MB 限制");
          }
          raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    } else raw = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("接口没有返回有效 JSON，请检查地址与接口协议");
    }
    return {
      ...parseBrowserReply(request.connection.protocol, data),
      connection: request.connection,
      diagnostics: {
        finish_reason: parseBrowserReply(request.connection.protocol, data)
          .finish,
        output_limit:
          request.payload.max_tokens ||
          request.payload.max_completion_tokens ||
          request.payload.max_output_tokens,
        usage: Object.fromEntries(
          Object.entries((data as any)?.usage || {}).filter(
            ([k, v]) =>
              [
                "input_tokens",
                "output_tokens",
                "prompt_tokens",
                "completion_tokens",
                "total_tokens",
              ].includes(k) &&
              Number.isInteger(v) &&
              Number(v) >= 0,
          ),
        ),
      },
    };
  } catch (error) {
    if (
      controller.signal.aborted &&
      !(error instanceof Error && /2 MB/.test(error.message))
    )
      throw new Error("模型回复超时，请稍后重试或缩短需求");
    if (error instanceof TypeError)
      throw new Error(
        "浏览器无法直连接口：请检查网络、HTTPS 地址及服务商的 CORS 支持。服务商禁止网页直连时，请使用允许浏览器访问的接口或完整后端版。",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export async function testBrowserConnection(connection: Connection) {
  const result = await completeBrowser(
    connection,
    [{ role: "user", content: "Reply with OK." }],
    512,
  );
  return {
    ok: true,
    model: result.connection.model,
    protocol: result.connection.protocol,
    base_url: result.connection.base_url,
  };
}
export function groundedMessages(context: {
  history: ModelMessage[];
  prompt: string;
  retrieved: unknown[];
  workflow?: Workflow;
  continuing?: boolean;
  web_search?: WebSearch;
}): ModelMessage[] {
  return [
    {
      role: "system",
      content:
        solutionPolicy.answer_prompt +
        "\n" +
        searchPolicy.prompt +
        (context.continuing ? "\n" + solutionPolicy.continue_prompt : ""),
    },
    ...context.history,
    {
      role: "user",
      content: JSON.stringify({
        BRIEF: context.workflow?.fields || {},
        SELECTION_CONTEXT: selectionContext(context.workflow),
        EDITORIAL_GUIDE: editorialGuide(context.workflow),
        EVIDENCE_JSON: context.retrieved,
        WEB_EVIDENCE_JSON: context.web_search?.results || [],
        WEB_SEARCH: { ...context.web_search, results: undefined },
        USER_INPUT: context.prompt,
      }),
    },
  ];
}
export function groundedResult(
  answer: string,
  finish: string,
  context: { retrieved: any[]; trace_id: string; web_search?: WebSearch },
  model: string,
) {
  const requested = new Set(
    [...answer.matchAll(/\[([KW]\d+)\]/g)].map((m) => m[1]),
  );
  const web = context.web_search || disabledSearch();
  const valid = new Set(
    [...context.retrieved, ...web.results].map((r) => r.citation_id),
  );
  const warnings: string[] = searchWarnings(web);
  if ([...requested].some((c) => !valid.has(c))) {
    answer = answer.replace(/\[([KW]\d+)\]/g, (whole, key) =>
      valid.has(key) ? whole : "[引用待核验]",
    );
    warnings.push("模型返回了未知引用编号，已标记为待核验。");
  }
  const citations = context.retrieved.filter((r) =>
    requested.has(r.citation_id),
  );
  const web_citations = web.results.filter((r) => requested.has(r.citation_id));
  if (!context.retrieved.length && !web.results.length)
    warnings.push("本轮没有匹配的已发布知识，产品结论需要进一步核验。");
  else if (!citations.length && !web_citations.length)
    warnings.push("已检索资料，但模型没有标注有效引用，请核对来源。");
  if (finish === "length")
    warnings.push(
      "模型因输出上限停止，当前回复不完整。可点击“续写剩余内容”；若仍截断，请提高输出上限。",
    );
  if (finish === "content_filter")
    warnings.push("模型服务限制了本轮输出，请调整请求；这不是长度截断。");
  return {
    answer,
    citations,
    retrieved: context.retrieved,
    trace_id: context.trace_id,
    warnings,
    model,
    finish_reason: finish,
    web_search: web,
    web_citations,
  };
}

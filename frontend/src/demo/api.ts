import { searchWeb, testBrowserSearch } from "../webSearch";
import {
  extractionMessages,
  applyExtraction,
  isConfirmation,
  clarification,
} from "../solutionFlow";
import { createDemoStore } from "./store";
import { upgradeDemoState } from "./stateUpgrade";
import {
  completeBrowser,
  testBrowserConnection,
  completeGroundedBrowser,
  groundedResult,
} from "../browserModel";
const STORAGE = "archmind-pages-state-v1";
let initial: Promise<Record<string, any>> | undefined;
let memory: ReturnType<typeof createDemoStore> | undefined;
let serial: Promise<unknown> = Promise.resolve();
const seed = () =>
  (initial ||= fetch(`${import.meta.env.BASE_URL}demo/knowledge.json`).then(
    async (response) => {
      if (!response.ok) throw new Error("公开资料加载失败，请刷新页面");
      return response.json();
    },
  ));
export function resetDemo() {
  try {
    localStorage.removeItem(STORAGE);
  } catch {
    /* reload also clears memory */
  }
  window.location.reload();
}
function transaction<T>(
  run: (engine: ReturnType<typeof createDemoStore>) => T,
): Promise<T> {
  const task = serial.then(async () => {
    const base = await seed();
    let engine = memory;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) || "null");
      if (saved?.state?.metadata?.schema_version === 1)
        engine = createDemoStore(
          saved.fingerprint === base.metadata.fingerprint
            ? saved.state
            : upgradeDemoState(saved.state, base),
        );
    } catch {
      /* damaged or unavailable browser storage: use session memory */
    }
    engine ||= createDemoStore(base);
    const result = run(engine);
    memory = engine;
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify({
          fingerprint: base.metadata.fingerprint,
          state: engine.exportState(),
        }),
      );
    } catch {
      /* session still works without persistence */
    }
    return result;
  });
  serial = task.catch(() => undefined);
  return task;
}
export async function demoApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const body =
    typeof options.body === "string" ? JSON.parse(options.body) : undefined;
  if (path === "/agent/search/test" && options.method === "POST")
    return (await testBrowserSearch(body)) as T;
  if (path === "/agent/test" && options.method === "POST")
    return (await testBrowserConnection(body)) as T;
  if (
    path === "/agent/chat" &&
    options.method === "POST" &&
    body?.connection?.api_key?.trim()
  ) {
    // Persist only trace context, then release the queue while the provider responds.
    const call = {
      conversation_id: body.conversation_id,
      revision: body.revision,
      messages: body.messages,
      action: body.action,
    };
    const context = await transaction((engine) =>
      engine.prepareBrowserChat(call),
    );
    let workflow = context.previous;
    if (
      isConfirmation(workflow, context.prompt, body.action) ||
      body.action === "continue"
    )
      workflow = { ...workflow, phase: "generated" };
    else {
      const extraction = await completeBrowser(
        body.connection,
        extractionMessages(
          workflow,
          context.extractionInput,
          context.lastQuestion,
        ),
        body.connection.max_output_tokens,
      );
      if (extraction.finish === "length")
        throw Error(
          "需求识别达到输出上限，请提高输出上限后重试；尚未生成方案。",
        );
      workflow = applyExtraction(
        workflow,
        extraction.answer,
        context.extractionInput,
      );
    }
    const prepared = await transaction((engine) =>
      engine.prepareBrowserChat(call, workflow),
    );
    let result;
    if (workflow.phase !== "generated")
      result = {
        answer: clarification(workflow),
        citations: [],
        retrieved: [],
        trace_id: "",
        warnings: [],
        model: body.connection.model,
        workflow,
        finish_reason: "stop",
        diagnostics: { stage: "requirements" },
      };
    else {
      if (!prepared.continuing) {
        prepared.web_search = await searchWeb(
          body.web_search,
          workflow,
          prepared.prompt,
          [body.connection.api_key],
        );
        await transaction((engine) =>
          engine.attachWebTrace(prepared.trace_id, prepared.web_search),
        );
      }
      const reply = await completeGroundedBrowser(body.connection, prepared);
      const grounded = groundedResult(
        reply.answer,
        reply.finish,
        prepared,
        reply.connection.model,
      );
      result = {
        ...grounded,
        warnings: [...grounded.warnings, ...reply.grounding_warnings],
        grounding_repair: reply.grounding_repair,
        workflow,
        saved_solution_cases: prepared.saved_solution_cases,
        diagnostics: reply.diagnostics,
      };
    }
    return (await transaction((engine) =>
      engine.commitBrowserChat(call, result),
    )) as T;
  }
  return transaction((engine) =>
    engine.request(
      options.method || "GET",
      path,
      path === "/agent/chat"
        ? {
            conversation_id: body?.conversation_id,
            revision: body?.revision,
            messages: body?.messages,
            action: body?.action,
            search_requested: !!body?.web_search?.enabled,
          }
        : body,
    ),
  ) as Promise<T>;
}

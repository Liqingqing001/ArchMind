import { createDemoStore } from "./store";
import { upgradeDemoState } from "./stateUpgrade";
import {
  completeBrowser,
  testBrowserConnection,
  groundedMessages,
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
    };
    const context = await transaction((engine) =>
      engine.prepareBrowserChat(call),
    );
    const reply = await completeBrowser(
      body.connection,
      groundedMessages(context),
    );
    const result = groundedResult(
      reply.answer,
      reply.finish,
      context,
      reply.connection.model,
    );
    return (await transaction((engine) =>
      engine.commitBrowserChat(call, result),
    )) as T;
  }
  return transaction((engine) =>
    engine.request(options.method || "GET", path, body),
  ) as Promise<T>;
}

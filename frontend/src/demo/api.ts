import { createDemoStore } from "./store";
const STORAGE = "archmind-pages-state-v1";
let initial: Promise<Record<string, any>> | undefined;
let memory: ReturnType<typeof createDemoStore> | undefined;
let serial: Promise<unknown> = Promise.resolve();
const seed = () =>
  (initial ||= fetch(`${import.meta.env.BASE_URL}demo/knowledge.json`).then(
    async (response) => {
      if (!response.ok) throw new Error("演示资料加载失败，请刷新页面");
      return response.json();
    },
  ));
export function resetDemo() {
  try {
    localStorage.removeItem(STORAGE);
  } catch {
    /* session memory is also reset by reload */
  }
  window.location.reload();
}
export function demoApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const task = serial.then(async () => {
    const base = await seed();
    let engine = memory;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) || "null");
      if (
        saved?.fingerprint === base.metadata.fingerprint &&
        saved.state?.metadata?.schema_version === 1
      )
        engine = createDemoStore(saved.state);
    } catch {
      /* private browsing or damaged demo state: use the in-memory snapshot */
    }
    engine ||= createDemoStore(base);
    const body =
      typeof options.body === "string" ? JSON.parse(options.body) : undefined;
    const result = engine.request(options.method || "GET", path, body);
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
      /* demo still works in session memory when browser storage is unavailable */
    }
    return result as T;
  });
  serial = task.catch(() => undefined);
  return task;
}

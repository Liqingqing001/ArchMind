import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeSearch,
  saveSearchSettings,
  loadSearchSettings,
  clearSearchSettings,
  SEARCH_SETTINGS_KEY,
  searchWeb,
  parseSearchResults,
  searchQueries,
  disabledSearch,
  searchRequest,
} from "../src/webSearch.ts";
import { emptyWorkflow } from "../src/solutionFlow.ts";
import { groundedMessages, groundedResult } from "../src/browserModel.ts";
import { createDemoStore } from "../src/demo/store.ts";
const connection = {
    provider: "tavily",
    api_key: "search-test-only-secret",
    enabled: true,
  },
  modelKey = "model-test-only-secret";
const workflow = emptyWorkflow();
workflow.phase = "generated";
workflow.fields = {
  goal: { value: "租 GPU 做视频" },
  delivery: { value: "云GPU自部署" },
};
const storage = (() => {
  const data = new Map([["other", "keep"]]);
  return {
    getItem: (k) => data.get(k),
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
})();
saveSearchSettings(connection, storage);
assert.equal(loadSearchSettings(storage).api_key, connection.api_key);
clearSearchSettings(storage);
assert.equal(storage.getItem("other"), "keep");
assert.equal(loadSearchSettings(storage).enabled, false);
assert.throws(() =>
  normalizeSearch({
    ...connection,
    provider: "custom",
    base_url: "http://localhost",
  }),
);
assert.throws(() => normalizeSearch({ ...connection, api_key: "" }));
assert.throws(
  () =>
    saveSearchSettings(connection, {
      setItem() {
        throw Error("blocked");
      },
    }),
  /不允许/,
);
const queries = searchQueries(workflow, "生成方案 " + modelKey, [
  connection.api_key,
  modelKey,
]);
assert.ok(queries.every((q) => !q.includes(modelKey) && q.length <= 190));
assert.ok(queries.length <= 2);
let requests = [];
const response = {
  results: [
    {
      title: "AutoDL docs",
      url: "https://www.autodl.com/docs/price/#a",
      content: "按量、存储和计费",
      raw_content: "实例关机后付费数据盘仍计费。 " + connection.api_key,
    },
    {
      title: "ordinary",
      url: "https://community.example/post",
      content: "未核验建议",
    },
    { title: "private", url: "https://127.0.0.1/x", content: "私网" },
    { title: "bad", url: "javascript:alert(1)", content: "脚本" },
    {
      title: "secret",
      url: "https://example.com/?key=" + connection.api_key,
      content: "不可保存",
    },
  ],
};
const fetcher = async (url, options) => {
  requests.push({ url, options });
  return new Response(JSON.stringify(response));
};
const web = await searchWeb(
  connection,
  workflow,
  "生成简版方案",
  [modelKey],
  fetcher,
);
assert.equal(web.status, "ok");
assert.equal(requests.length, 2);
assert.equal(web.results.length, 2);
assert.equal(web.results[0].source_type, "official");
assert.equal(web.results[1].source_type, "web");
assert.equal(web.results[0].content_kind, "page_excerpt");
assert.ok(web.results[0].excerpt.includes("按量、存储和计费"));
assert.ok(!JSON.stringify(web).includes(connection.api_key));
assert.equal(web.results[0].url, "https://www.autodl.com/docs/price/");
assert.equal(web.results[0].citation_id, "W1");
for (const req of requests) {
  assert.equal(
    req.options.headers.Authorization,
    "Bearer " + connection.api_key,
  );
  assert.equal(req.options.redirect, "error");
  assert.equal(req.options.credentials, "omit");
  assert.equal(JSON.parse(req.options.body).max_results, 4);
  assert.ok(!req.options.body.includes(connection.api_key));
}
const bocha = parseSearchResults(
  "bocha",
  {
    code: 200,
    data: {
      webPages: {
        value: [
          {
            name: "AnyGPU",
            url: "https://www.anygpu.cn/gpu.html",
            summary: "按小时租 GPU",
            datePublished: "2026-11-01",
          },
        ],
      },
    },
  },
  "2026-11-07T00:00:00Z",
);
assert.equal(bocha[0].title, "AnyGPU");
assert.equal(bocha[0].content_kind, "search_summary");
assert.equal(
  searchRequest({ ...connection, provider: "bocha" }, "gpu").payload.summary,
  true,
);
const partial = await searchWeb(
  connection,
  workflow,
  "生成方案",
  [],
  async (url, opt) =>
    JSON.parse(opt.body).query.includes("官方 文档")
      ? new Response(JSON.stringify(response))
      : new Response("private body " + connection.api_key, { status: 401 }),
);
assert.equal(partial.status, "partial");
assert.ok(!JSON.stringify(partial).includes(connection.api_key));
const failure = await searchWeb(
  connection,
  workflow,
  "生成方案",
  [],
  async () => {
    throw new TypeError("Failed to fetch");
  },
);
assert.equal(failure.status, "error");
assert.ok(failure.errors[0].includes("CORS"));
assert.deepEqual(
  await searchWeb(
    { ...connection, enabled: false },
    workflow,
    "生成方案",
    [],
    async () => assert.fail("disabled search called"),
  ),
  disabledSearch(),
);
const empty = await searchWeb(
  connection,
  workflow,
  "生成方案",
  [],
  async () => new Response('{"results":[]}'),
);
assert.equal(empty.status, "empty");
const result = groundedResult(
  "资料 [K1]、网页 [W1]，错误 [W999]",
  "length",
  { retrieved: [{ citation_id: "K1" }], trace_id: "trace", web_search: web },
  "model",
);
assert.equal(result.web_citations.length, 1);
assert.equal(result.citations.length, 1);
assert.ok(!result.answer.includes("[W999]"));
assert.match(
  groundedMessages({
    history: [],
    prompt: "生成",
    retrieved: [],
    workflow,
    web_search: web,
  })[1].content,
  /WEB_EVIDENCE_JSON/,
);
const seed = JSON.parse(
  readFileSync(
    new URL("../public/demo/knowledge.json", import.meta.url),
    "utf8",
  ),
);
let db = createDemoStore(seed);
const c = db.request("POST", "/conversations", { title: "web-test" });
const body = {
  conversation_id: c.id,
  revision: 0,
  messages: [{ role: "user", content: "生成方案" }],
};
const ctx = db.prepareBrowserChat(body, workflow);
db.attachWebTrace(ctx.trace_id, web);
db.commitBrowserChat(body, { ...result, trace_id: ctx.trace_id, workflow });
db = createDemoStore(db.exportState());
const next = db.prepareBrowserChat({
  ...body,
  revision: 1,
  action: "continue",
  messages: [{ role: "user", content: "请续写" }],
});
assert.deepEqual(next.web_search, web);
assert.equal(next.trace_id, ctx.trace_id);
assert.ok(!JSON.stringify(db.exportState()).includes(connection.api_key));
assert.ok(
  db.request("GET", "/traces/" + ctx.trace_id).request_context.web_search
    .results.length,
);
for (const name of [
  "OneThingAI",
  "AnyGPU 算力云",
  "火山引擎 GPU 云服务器",
  "AutoDL",
  "矩池云",
  "Featurize",
  "RunPod GPU Pods",
  "Vast.ai",
  "RunningHub",
])
  assert.ok(
    seed.entities.find((e) => e.name === name),
    name,
  );
console.log(
  "PASS: search settings isolation, bounded official API requests, safe URLs, separate web citations, explicit errors/empty/partial states, frozen continuation and researched GPU coverage",
);
const { matchesSceneTask, solutionPolicy } = await import(
  "../src/solutionFlow.ts"
);
const gpuScene = solutionPolicy.scenes.find((s) => s.id === "gpu");
const gpuTask = (name) => {
  const entity = seed.entities.find((e) => e.name === name);
  const labels = seed.links
    .filter((l) => l.entity_id === entity.id)
    .map((l) => seed.categories.find((c) => c.id === l.category_id).name);
  return gpuScene.tasks.find((t) =>
    matchesSceneTask(
      t,
      entity,
      (entity.name + " " + entity.description).toLowerCase(),
      labels,
    ),
  )?.name;
};
assert.equal(gpuTask("AnyGPU 算力云"), "GPU算力");
assert.equal(gpuTask("火山方舟"), "模型 API 与托管推理");
assert.equal(gpuTask("Modal Serverless"), "模型 API 与托管推理");
assert.equal(gpuTask("ComfyUI"), "工作流工具与托管");
assert.equal(gpuTask("Dify"), undefined);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeConnection,
  browserRequest,
  completeBrowser,
  loadModelSettings,
  saveModelSettings,
  clearModelSettings,
  MODEL_SETTINGS_KEY,
  groundedMessages,
  groundedResult,
} from "../src/browserModel.ts";
import { createDemoStore } from "../src/demo/store.ts";
import { upgradeDemoState } from "../src/demo/stateUpgrade.ts";
const cases = [];
const test = (name, run) => cases.push({ name, run });
const connection = {
  base_url: "https://model.example/v1",
  api_key: "test-only-private-key",
  model: "test-model",
  protocol: "chat_completions",
  token_parameter: "max_tokens",
  max_output_tokens: 1000,
};
const seed = JSON.parse(
  readFileSync(
    new URL("../public/demo/knowledge.json", import.meta.url),
    "utf8",
  ),
);
const storage = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
};

test("API settings survive reload and clear only their own key", () => {
  const local = storage();
  local.setItem("unrelated", "keep");
  const clean = saveModelSettings(
    {
      ...connection,
      base_url: connection.base_url + "/chat/completions/",
      api_key: "  " + connection.api_key + " ",
    },
    "自定义接口",
    local,
  );
  assert.equal(clean.base_url, connection.base_url);
  assert.equal(loadModelSettings(local).connection.api_key, connection.api_key);
  clearModelSettings(local);
  assert.equal(loadModelSettings(local), null);
  assert.equal(local.getItem("unrelated"), "keep");
  local.setItem(MODEL_SETTINGS_KEY, "broken json");
  assert.equal(loadModelSettings(local), null);
  assert.throws(
    () =>
      saveModelSettings(connection, "自定义接口", {
        setItem() {
          throw Error("blocked");
        },
      }),
    /不允许保存/,
  );
});
test("endpoint normalization enforces HTTPS and infers all three complete endpoint forms", () => {
  assert.equal(
    normalizeConnection({
      ...connection,
      base_url: "https://api.openai.com/responses",
    }).base_url,
    "https://api.openai.com/v1",
  );
  assert.equal(
    normalizeConnection({
      ...connection,
      base_url: "https://api.anthropic.com/v1/messages",
    }).protocol,
    "anthropic",
  );
  for (const base_url of [
    "http://model.example",
    "https://user:pass@model.example",
    "https://model.example?key=secret",
  ])
    assert.throws(() => normalizeConnection({ ...connection, base_url }));
  assert.throws(() => normalizeConnection({ ...connection, api_key: " " }));
});
test("protocol payloads use the right headers and token fields", () => {
  const messages = [
    { role: "system", content: "policy" },
    { role: "user", content: "hello" },
  ];
  const chat = browserRequest(
    { ...connection, token_parameter: "max_completion_tokens" },
    messages,
  );
  assert.equal(chat.payload.max_completion_tokens, 1000);
  assert.equal(chat.headers.Authorization, "Bearer " + connection.api_key);
  const responses = browserRequest(
    { ...connection, protocol: "responses" },
    messages,
  );
  assert.equal(responses.payload.store, false);
  assert.deepEqual(responses.payload.input, messages);
  const claude = browserRequest(
    { ...connection, protocol: "anthropic" },
    messages,
  );
  assert.equal(claude.headers["x-api-key"], connection.api_key);
  assert.equal(
    claude.headers["anthropic-dangerous-direct-browser-access"],
    "true",
  );
  assert.equal(claude.payload.messages.length, 1);
  assert.equal(claude.payload.system, "policy");
});
test("browser calls parse each protocol and omit cookies and redirects", async () => {
  const samples = {
    chat_completions: {
      choices: [
        { message: { content: "真实返回 [K1]" }, finish_reason: "stop" },
      ],
    },
    responses: {
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "真实返回 [K1]" }],
        },
      ],
    },
    anthropic: {
      content: [{ type: "text", text: "真实返回 [K1]" }],
      stop_reason: "end_turn",
    },
  };
  for (const [protocol, data] of Object.entries(samples)) {
    let request;
    const result = await completeBrowser(
      { ...connection, protocol },
      [{ role: "user", content: "需求" }],
      undefined,
      async (url, options) => {
        request = { url, ...options };
        return new Response(JSON.stringify(data), { status: 200 });
      },
    );
    assert.equal(result.answer, "真实返回 [K1]");
    assert.equal(request.credentials, "omit");
    assert.equal(request.redirect, "error");
    assert.equal(request.mode, "cors");
    assert.ok(!JSON.parse(request.body).api_key);
    assert.ok(!JSON.parse(request.body).connection);
  }
});
test("errors do not echo provider bodies or silently fall back to demo", async () => {
  await assert.rejects(
    completeBrowser(
      connection,
      [],
      undefined,
      async () =>
        new Response("contains " + connection.api_key, { status: 401 }),
    ),
    (e) => /拒绝/.test(e.message) && !e.message.includes(connection.api_key),
  );
  await assert.rejects(
    completeBrowser(connection, [], undefined, async () => {
      throw new TypeError("Failed to fetch");
    }),
    /CORS/,
  );
  await assert.rejects(
    completeBrowser(
      connection,
      [],
      undefined,
      async () =>
        new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    ),
    /没有返回文本/,
  );
});
test("unknown citations and truncation are clearly marked", () => {
  const result = groundedResult(
    "证据 [K1] 与幻觉 [K99]",
    "length",
    { retrieved: [{ citation_id: "K1" }], trace_id: "trace" },
    "test-model",
  );
  assert.equal(result.citations.length, 1);
  assert.match(result.answer, /引用待核验/);
  assert.ok(!result.answer.includes("[K99]"));
  assert.equal(result.warnings.length, 2);
});
test("real provider preparation shares knowledge, keeps history and never stores its key", () => {
  const db = createDemoStore(seed),
    c = db.request("POST", "/conversations", { title: "新对话" });
  const body = {
    conversation_id: c.id,
    revision: 0,
    messages: [{ role: "user", content: "RAG 知识问答" }],
    connection,
  };
  const context = db.prepareBrowserChat(body);
  assert.equal(context.retrieved.length,0);
  assert.equal(context.previous.phase,"collecting");
  assert.equal(context.history.length, 0);
  const result = groundedResult("方案 [K1]", "stop", context, connection.model);
  db.commitBrowserChat(body, result);
  const second = {
    ...body,
    revision: 1,
    messages: [{ role: "user", content: "继续展开" }],
  };
  const next = db.prepareBrowserChat(second);
  assert.equal(next.history.length, 2);
  assert.equal(groundedMessages(next).at(-1).role, "user");
  assert.ok(!JSON.stringify(db.exportState()).includes(connection.api_key));
  assert.ok(!JSON.stringify(db.exportState()).includes('"connection"'));
  assert.throws(() => db.commitBrowserChat(body, result), /另一页面/);
});
test("one real category contains all open-weight models without losing capability categories", () => {
  const db = createDemoStore(seed),
    categories = db.request("GET", "/categories");
  const parent = categories.find((c) => c.name === "AI 模型" && !c.parent_id);
  const open = categories.find(
    (c) => c.name === "开源与开放权重模型" && c.parent_id === parent.id,
  );
  assert.ok(open);
  const models = db.request("GET", "/entities?category_id=" + open.id);
  assert.equal(models.length, 20);
  assert.ok(models.every((e) => e.category_ids.length >= 2));
  assert.equal(db.request("GET", "/entities").length, 172);
  const qwen = models.find((e) => e.name === "Qwen3-8B");
  assert.ok(qwen.model_resources);
  assert.ok(qwen.category_ids.some((id) => id !== open.id));
});
test("new category data preserves existing browser history, traces and review edits", () => {
  const old = structuredClone(seed);
  const category = old.categories.find((c) => c.name === "开源与开放权重模型");
  old.categories = old.categories.filter((c) => c.id !== category.id);
  old.links = old.links.filter((l) => l.category_id !== category.id);
  old.metadata.fingerprint = "old";
  const db = createDemoStore(old),
    c = db.request("POST", "/conversations", { title: "保留此会话" });
  db.request("POST", "/agent/chat", {
    conversation_id: c.id,
    revision: 0,
    messages: [{ role: "user", content: "知识问答" }],
  });
  const pending = db.request("GET", "/changes?status=pending")[0];
  db.request("POST", "/changes/" + pending.id + "/review", {
    decision: "approved",
  });
  const next = createDemoStore(upgradeDemoState(db.exportState(), seed));
  assert.equal(next.request("GET", "/conversations/" + c.id).message_count, 2);
  assert.equal(next.request("GET", "/conversations/"+c.id).messages[1].result.workflow.phase,"collecting");
  assert.equal(
    next.request("GET", "/entities?category_id=" + category.id).length,
    20,
  );
  assert.equal(
    next.request("GET", "/changes").find((x) => x.id === pending.id).status,
    "approved",
  );
});
let passed = 0;
for (const { name, run } of cases) {
  await run();
  console.log("PASS: " + name);
  passed++;
}
console.log(`${passed} browser model tests passed`);

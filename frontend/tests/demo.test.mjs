const cases = [];
const test = (name, run) => cases.push({ name, run });
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDemoStore } from "../src/demo/store.ts";
const seed = JSON.parse(
  readFileSync(
    new URL("../public/demo/knowledge.json", import.meta.url),
    "utf8",
  ),
);
const setup = () => createDemoStore(seed);
const atlas = seed.entities.find((e) => e.name === "演示模型 · Atlas");
const snapshot = seed.snapshots.find(
  (s) =>
    seed.sources.find((source) => source.id === s.source_id)?.entity_id ===
    atlas.id,
);

test("public export contains the updated catalog with traceable excerpts and model downloads", () => {
  assert.equal(seed.entities.filter((e) => !e.is_demo).length, 116);
  assert.equal(seed.facts.filter((f) => f.entity_id !== atlas.id).length, 211);
  for (const f of seed.facts)
    assert.ok(
      seed.snapshots
        .find((s) => s.id === f.snapshot_id)
        .content.includes(f.evidence),
    );
  const models = setup()
    .request("GET", "/entities")
    .filter((e) => e.model_resources);
  assert.equal(models.length, 20);
  assert.ok(
    models.every((e) => e.model_resources.download_url.startsWith("https://")),
  );
});

test("console and Agent consume the same current facts; demo is opt-in for Agent", () => {
  const db = setup();
  const console = db.request("GET", "/search?q=Qwen");
  const agent = db.request("POST", "/knowledge/retrieve", {
    query: "Qwen",
    top_k: 30,
  });
  assert.deepEqual(agent.results, console.results);
  assert.equal(
    db.request("POST", "/knowledge/retrieve", {
      query: "上下文",
      entity_ids: [atlas.id],
    }).results.length,
    0,
  );
});

test("review updates shared retrieval but freezes the previous trace and all history", () => {
  const db = setup();
  const before = db.request("POST", "/knowledge/retrieve", {
    query: "上下文窗口",
    include_demo: true,
  });
  const candidate = seed.changes.find(
    (c) => c.entity_id === atlas.id && c.key === "上下文窗口",
  );
  db.request("POST", `/changes/${candidate.id}/review`, {
    decision: "approved",
  });
  const after = db.request("POST", "/knowledge/retrieve", {
    query: "上下文窗口",
    include_demo: true,
  });
  assert.equal(after.results.find((f) => f.entity_id === atlas.id).version, 2);
  assert.equal(
    db
      .request("GET", `/traces/${before.trace_id}`)
      .results.find((f) => f.entity_id === atlas.id).version,
    1,
  );
  assert.throws(
    () =>
      db.request("POST", `/changes/${candidate.id}/review`, {
        decision: "approved",
      }),
    /已处理/,
  );
  const old = db
    .request("GET", `/entities/${atlas.id}`)
    .facts.find((f) => f.key === "上下文窗口" && f.version === 1);
  const restore = db.request("POST", `/facts/${old.id}/restore`);
  assert.equal(restore.status, "pending");
  db.request("POST", `/changes/${restore.id}/review`, { decision: "approved" });
  assert.equal(
    db
      .request("GET", `/entities/${atlas.id}`)
      .facts.find((f) => f.key === "上下文窗口" && !f.valid_to).version,
    3,
  );
});

test("evidence ownership, duplicate proposals and stale candidate conflicts are enforced", () => {
  const db = setup(),
    input = {
      entity_id: atlas.id,
      snapshot_id: snapshot.id,
      key: "支持输入",
      value: "文本",
      evidence: "支持输入：文本、图像",
    };
  assert.throws(
    () =>
      db.request("POST", "/changes", { ...input, evidence: "不存在的证据" }),
    /证据/,
  );
  assert.throws(
    () =>
      db.request("POST", "/changes", {
        ...input,
        entity_id: seed.entities[0].id,
      }),
    /不属于/,
  );
  const a = db.request("POST", "/changes", input),
    b = db.request("POST", "/changes", { ...input, value: "图像" });
  assert.equal(db.request("POST", "/changes", input).id, a.id);
  db.request("POST", `/changes/${a.id}/review`, { decision: "approved" });
  assert.throws(
    () =>
      db.request("POST", `/changes/${b.id}/review`, { decision: "approved" }),
    /过期/,
  );
});

test("conversation demo has citations, persists through reconstruction, and never saves provider keys", () => {
  let db = setup();
  const c = db.request("POST", "/conversations", { title: "新对话" });
  const result = db.request("POST", "/agent/chat", {
    conversation_id: c.id,
    revision: 0,
    messages: [{ role: "user", content: "企业知识问答 RAG 本地部署" }],
    connection: { api_key: "must-never-be-saved" },
  });
  assert.match(result.answer, /未调用大模型/);
  assert.ok(result.citations.length > 0);
  for (const citation of result.citations)
    assert.match(
      result.answer,
      new RegExp("\\[" + citation.citation_id + "\\]"),
    );
  assert.ok(!JSON.stringify(db.exportState()).includes("must-never-be-saved"));
  db = createDemoStore(db.exportState());
  assert.equal(db.request("GET", `/conversations/${c.id}`).message_count, 2);
  db.request("PATCH", `/conversations/${c.id}`, { title: "面试演示" });
  assert.equal(db.request("GET", "/conversations")[0].title, "面试演示");
  db.request("DELETE", `/conversations/${c.id}`);
  assert.equal(db.request("GET", "/conversations").length, 0);
  assert.equal(
    db.request("POST", `/conversations/${c.id}/restore`).message_count,
    2,
  );
});

test("browser instances are isolated, responses cannot mutate store, and revision conflicts reject", () => {
  const a = setup(),
    b = setup();
  const c = a.request("POST", "/conversations", { title: "独立会话" });
  assert.equal(b.request("GET", "/conversations").length, 0);
  c.title = "outside mutation";
  assert.equal(a.request("GET", `/conversations/${c.id}`).title, "独立会话");
  assert.throws(
    () =>
      a.request("POST", "/agent/chat", {
        conversation_id: c.id,
        revision: 99,
        messages: [{ content: "问答" }],
      }),
    /另一页面/,
  );
});

test("sources never collect; model credentials are excluded from knowledge storage", () => {
  const db = setup();
  assert.throws(
    () => db.request("POST", `/sources/${seed.sources[0].id}/collect`),
    /不执行联网/,
  );
  assert.throws(
    () => db.request("POST", "/agent/test", { api_key: "secret" }),
    /直连适配器/,
  );
  assert.ok(!JSON.stringify(db.exportState()).includes('"api_key"'));
  assert.throws(
    () => db.request("POST", "/knowledge/retrieve", { query: "%", top_k: 0 }),
    /数量/,
  );
  assert.equal(
    db.request("POST", "/knowledge/retrieve", { query: "%" }).results.length,
    0,
  );
});

test("category descendants and multi-category edits preserve filtering", () => {
  const db = setup();
  const root = db.request("POST", "/categories", { name: "演示分类" });
  const child = db.request("POST", "/categories", {
    name: "子分类",
    parent_id: root.id,
  });
  const e = db.request("POST", "/entities", {
    name: "体验实体",
    kind: "model",
    category_ids: [child.id],
  });
  assert.equal(
    db.request("GET", `/entities?category_id=${root.id}`)[0].id,
    e.id,
  );
  assert.throws(
    () =>
      db.request("POST", "/sources", {
        entity_id: e.id,
        name: "坏来源",
        url: "http://example.com",
      }),
    /HTTPS/,
  );
});

let passed = 0;
for (const { name, run } of cases) {
  await run();
  console.log("PASS: " + name);
  passed++;
}
console.log(`${passed} demo behavior tests passed`);

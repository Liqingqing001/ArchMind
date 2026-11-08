import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDemoStore } from "../src/demo/store.ts";
import {
  emptyWorkflow,
  rankKnowledge,
  applyExtraction,
} from "../src/solutionFlow.ts";
import { selectionContext } from "../src/recommendations.ts";
import { groundedMessages } from "../src/browserModel.ts";
const data = JSON.parse(
  readFileSync(
    new URL("../public/demo/knowledge.json", import.meta.url),
    "utf8",
  ),
);
const entities = createDemoStore(data).request("GET", "/entities");
const facts = data.facts.map((f) => {
  const e = entities.find((e) => e.id === f.entity_id);
  return { ...f, entity_name: e.name, entity_kind: e.kind, is_demo: e.is_demo };
});
const cases = JSON.parse(
  readFileSync(
    new URL("../../backend/tests/fixtures/advisor-cases.json", import.meta.url),
    "utf8",
  ),
);
for (const c of cases) {
  const w = emptyWorkflow();
  w.fields = Object.fromEntries(
    ["goal", "delivery", "requirements"].map((k) => [
      k,
      { value: c[k], evidence: c[k] },
    ]),
  );
  const context = selectionContext(w),
    rows = rankKnowledge(
      facts,
      entities,
      data.categories,
      data.links,
      w,
      "生成简版方案",
    );
  if(c.needs_website!==undefined)assert.equal(context.needs_website,c.needs_website);
  assert.deepEqual(
    context.capabilities.map((c) => c.id),
    c.caps,
    c.id,
  );
  assert.deepEqual(
    context.routes.map((c) => c.id),
    c.routes,
    c.id,
  );
  for (const name of c.include)
    assert.ok(
      rows.some((r) => r.entity_name === name),
      `${c.id}: missing ${name}`,
    );
  if (c.id === "video_generation") {
    const h3 = rows.filter(r => r.entity_name === "MiniMax-H3");
    assert.ok(h3.every(r => r.recommendation_route === "local"));
    assert.deepEqual(new Set(h3.map(r => r.key)), new Set(["许可边界", "部署方式"]));
  }
  for (const name of c.exclude)
    assert.ok(
      !rows.some((r) => r.entity_name === name),
      `${c.id}: unwanted ${name}`,
    );
  for (const name of c.references || [])
    assert.ok(
      rows
        .filter((r) => r.entity_name === name)
        .every((r) => r.recommendation_route === "reference"),
    );
  assert.ok(
    rows.length <= 12 &&
      rows.every(
        (r) =>
          c.routes.includes(r.recommendation_route) ||
          r.recommendation_route === "reference",
      ),
  );
  for (const id of new Set(rows.map((r) => r.entity_id)))
    assert.ok(rows.filter((r) => r.entity_id === id).length <= 2);
  for (const row of rows)
    assert.ok(
      data.snapshots
        .find((s) => s.id === row.snapshot_id)
        .content.includes(row.evidence),
    );
  const messages = groundedMessages({
    history: [],
    prompt: "生成简版方案",
    workflow: w,
    retrieved: rows,
  });
  assert.deepEqual(
    JSON.parse(messages.at(-1).content).SELECTION_CONTEXT,
    context,
  );
}
const db = createDemoStore(data),
  c = db.request("POST", "/conversations", { title: "新对话" });
const commit = (current, title) =>
  db.commitBrowserChat(
    {
      conversation_id: c.id,
      revision: current.revision,
      messages: [{ role: "user", content: "写小说网站" }],
    },
    {
      answer: "继续确认需求",
      workflow: applyExtraction(
        emptyWorkflow(),
        JSON.stringify({
          updates: { goal: { value: "写小说网站", evidence: "写小说网站" } },
          title,
        }),
        "写小说网站",
      ),
      citations: [],
      retrieved: [],
    },
  ).conversation;
let current = commit(c, "低成本小说网站选型");
assert.equal(current.title, "低成本小说网站选型");
assert.equal(current.title_mode, "auto");
current = commit(current, "小说网站模型成本比较");
assert.equal(current.title, "小说网站模型成本比较");
db.request("PATCH", `/conversations/${c.id}`, { title: "新对话" });
current = commit(current, "AI 不应覆盖手动标题");
assert.equal(current.title, "新对话");
assert.equal(current.title_mode, "manual");
db.request("PATCH", `/conversations/${c.id}`, { title: "生成时改名" });
current = commit(current, "新的自动摘要");
assert.equal(current.title, "生成时改名");
const legacy = structuredClone(data);
legacy.conversations = [
  { ...current, title: "保留的历史标题", title_mode: undefined },
];
assert.equal(
  createDemoStore(legacy).request("GET", `/conversations/${c.id}`).title_mode,
  "manual",
);
console.log(
  "PASS: task/route selection, negation, offline constraints, reference-only mismatches, source ownership, auto summaries and manual-title locks.",
);

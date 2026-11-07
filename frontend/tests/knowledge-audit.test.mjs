import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { upgradeDemoState } from "../src/demo/stateUpgrade.ts";
import { createDemoStore } from "../src/demo/store.ts";
import { emptyWorkflow, rankKnowledge } from "../src/solutionFlow.ts";
const seed = JSON.parse(
  readFileSync(
    new URL("../public/demo/knowledge.json", import.meta.url),
    "utf8",
  ),
);
const base = createDemoStore(seed);
const entities = base.request("GET", "/entities");
const citations = seed.facts.map((f) => {
  const e = entities.find((e) => e.id === f.entity_id);
  return { ...f, entity_name: e.name, entity_kind: e.kind, is_demo: e.is_demo };
});
const w = emptyWorkflow();
w.fields = { goal: { value: "图像生成" }, delivery: { value: "API" } };
let found = rankKnowledge(
  citations,
  entities,
  seed.categories,
  seed.links,
  w,
  "生成方案",
);
assert.ok(!found.some((r) => r.entity_name.startsWith("Sora")));
w.fields.goal.value = "Sora 2 Pro 视频生成";
found = rankKnowledge(
  citations,
  entities,
  seed.categories,
  seed.links,
  w,
  "Sora 2 Pro 可以调用吗",
);
assert.ok(
  found.some(
    (r) =>
      r.entity_name === "Sora 2 Pro" &&
      r.key === "接入状态" &&
      r.value.includes("停止服务"),
  ),
);
w.fields.goal.value = "FLUX.1-dev 图像生成";
found = rankKnowledge(
  citations,
  entities,
  seed.categories,
  seed.links,
  w,
  "FLUX.1-dev 商用",
);
assert.ok(
  found.some((r) => r.entity_name === "FLUX.1-dev" && r.key === "商业使用边界"),
);
assert.ok(found.length <= 12);
for (const id of new Set(found.map((r) => r.entity_id)))
  assert.ok(found.filter((r) => r.entity_id === id).length <= 2);
// Reconcile old public data through review, preserving history, edits, retired fields and traces.
const saved = structuredClone(seed);
const sora = entities.find((e) => e.name === "Sora 2 Pro");
const old = saved.facts.find(
  (f) => f.entity_id === sora.id && f.key === "文档状态",
);
old.value = "Legacy（历史型号）；本条不代表账户仍可调用。";
saved.facts = saved.facts.filter(
  (f) => !(f.entity_id === sora.id && f.key === "接入状态"),
);
const retired = saved.facts.find(
  (f) => f.entity_id === sora.id && f.key === "输入方式",
);
retired.valid_to = "2026-11-01T00:00:00Z";
const db = createDemoStore(saved);
const trace = db.request("POST", "/knowledge/retrieve", {
  query: "Sora",
  entity_ids: [sora.id],
});
const history = db.exportState();
const next = createDemoStore(upgradeDemoState(history, seed));
assert.deepEqual(
  next.request("GET", `/traces/${trace.trace_id}`),
  db.request("GET", `/traces/${trace.trace_id}`),
);
assert.equal(
  next.exportState().facts.find((f) => f.id === old.id).value,
  old.value,
);
assert.ok(next.exportState().facts.find((f) => f.id === retired.id).valid_to);
const pending = next
  .request("GET", "/changes?status=pending")
  .find((c) => c.entity_id === sora.id && c.key === "文档状态");
assert.ok(pending && pending.old_value === old.value);
next.request("POST", `/changes/${pending.id}/review`, { decision: "approved" });
const latest = next
  .exportState()
  .facts.find(
    (f) => f.entity_id === sora.id && f.key === "文档状态" && !f.valid_to,
  );
assert.equal(latest.version, 2);
assert.ok(latest.value.includes("2026-09-24"));
assert.ok(next.exportState().facts.find((f) => f.id === old.id).valid_to);
const twice = upgradeDemoState(next.exportState(), seed);
assert.equal(
  twice.changes.filter(
    (c) =>
      c.entity_id === sora.id && c.key === "文档状态" && c.status === "pending",
  ).length,
  0,
);
console.log(
  "PASS: lifecycle and license constraints accompany retrieval; public corrections preserve local history and require review.",
);

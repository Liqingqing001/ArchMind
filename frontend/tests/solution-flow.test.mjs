import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  emptyWorkflow,
  applyExtraction,
  isConfirmation,
  clarification,
  rankKnowledge,
  previousWorkflow,
  previewExtraction,
} from "../src/solutionFlow.ts";
import { createDemoStore } from "../src/demo/store.ts";
const seed = JSON.parse(
  readFileSync(
    new URL("../public/demo/knowledge.json", import.meta.url),
    "utf8",
  ),
);
let w = emptyWorkflow();
const apply = (text) =>
  (w = applyExtraction(w, previewExtraction(text, w), text));
apply("我想做AI视频短剧");
assert.equal(w.phase, "collecting");
assert.ok(!isConfirmation(w, "可以"));
assert.ok(clarification(w).includes("预算"));
assert.equal(clarification(w).match(/\n\d\./g).length, 2);
apply("每月预算1000元，用现成平台，不会部署");
assert.ok(w.missing.includes("scale"));
assert.ok(!w.missing.includes("experience"));
apply("每周两条一分钟短剧，写实风格，人物一致");
assert.equal(w.phase, "ready");
assert.ok(isConfirmation(w, "可以"));
assert.ok(!isConfirmation(w, "不可以，预算要修改"));
assert.ok(clarification(w).includes("现在为你生成简版方案吗"));
const generated = { ...w, phase: "generated" };
assert.ok(!isConfirmation(generated, "可以"));
assert.equal(
  applyExtraction(generated, '{"updates":{}}', "请解释一下").phase,
  "generated",
);
const edited = applyExtraction(
  generated,
  JSON.stringify({
    updates: { budget: { value: "每月200元", evidence: "预算改成每月200元" } },
  }),
  "预算改成每月200元",
);
assert.equal(edited.phase, "ready");
assert.equal(edited.fields.goal.value, w.fields.goal.value);
assert.throws(() => applyExtraction(w, "不是JSON", "任意输入"), /JSON/);
assert.throws(
  () =>
    applyExtraction(
      w,
      '{"updates":{"budget":{"value":"100元","evidence":"不存在的文字"}}}',
      "没有说过",
    ),
  /原文/,
);
const longHistory = Array.from({ length: 30 }, (_, i) => ({
  role: i % 2 ? "assistant" : "user",
  content: "讨论细节",
}));
longHistory[1].result = { workflow: w };
assert.equal(
  previousWorkflow(longHistory).fields.budget.value,
  w.fields.budget.value,
);
const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../backend/tests/fixtures/solution-parity.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
for (const test of fixture.cases) {
  const wf = structuredClone(w);
  wf.fields.delivery = { value: test.delivery, evidence: test.delivery };
  const rows = rankKnowledge(
    fixture.rows,
    fixture.entities,
    fixture.categories,
    fixture.links,
    wf,
    "生成简版方案",
  );
  assert.deepEqual(
    rows.map((r) => r.entity_name),
    test.expected,
  );
}
const store = createDemoStore(seed);
let c = store.request("POST", "/conversations", { title: "新对话" });
let result;
for (const text of [
  "我想做AI视频短剧",
  "每月预算1000元，用现成平台，不会部署",
  "每周两条一分钟短剧，写实风格，人物一致",
]) {
  result = store.request("POST", "/agent/chat", {
    conversation_id: c.id,
    revision: c.revision,
    messages: [{ role: "user", content: text }],
  });
  assert.equal(result.retrieved.length, 0);
  c = result.conversation;
}
assert.equal(result.workflow.phase, "ready");
for (let i = 0; i < 6; i++) {
  result = store.request("POST", "/agent/chat", {
    conversation_id: c.id,
    revision: c.revision,
    messages: [{ role: "user", content: "还在考虑，请等我确认" }],
  });
  assert.equal(result.workflow.phase, "ready");
  c = result.conversation;
}
result = store.request("POST", "/agent/chat", {
  conversation_id: c.id,
  revision: c.revision,
  action: "generate",
  messages: [{ role: "user", content: "生成简版方案" }],
});
assert.equal(result.workflow.phase, "generated");
assert.ok(result.retrieved.length);
assert.ok(
  result.retrieved.every(
    (r) =>
      r.entity_kind !== "vendor" &&
      !["Dify", "ComfyUI", "腾讯云"].includes(r.entity_name),
  ),
);
assert.ok(result.workflow.fields.goal.value.includes("短剧"));
assert.ok(result.answer.length < 600);
assert.throws(
  () =>
    store.prepareBrowserChat({
      conversation_id: c.id,
      revision: result.conversation.revision,
      action: "continue",
      messages: [{ role: "user", content: "续写" }],
    }),
  /没有需要续写/,
);
console.log(
  "PASS: enforced confirmation, evidence-checked extraction, edits, persistent brief, scenario routing, shared ranking fixtures and no premature recommendations",
);

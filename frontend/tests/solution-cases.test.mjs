import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDemoStore } from "../src/demo/store.ts";
import {
  caseScene,
  eligibleSolution,
  solutionSnapshot,
  caseReferences,
  linkEvidence,
} from "../src/solutionCases.ts";
import { modelAccess } from "../src/modelAccess.ts";
import { upgradeDemoState } from "../src/demo/stateUpgrade.ts";
import { groundedMessages, groundedResult } from "../src/browserModel.ts";
import { combineSearch, searchQueries } from "../src/webSearch.ts";
const data = JSON.parse(
  readFileSync(
    new URL("../public/demo/knowledge.json", import.meta.url),
    "utf8",
  ),
);
const wf = {
  version: 1,
  phase: "generated",
  scene: null,
  fields: {
    goal: { value: "AI小说写作", evidence: "AI小说写作" },
    budget: { value: "每月100元" },
    delivery: { value: "无偏好" },
    experience: { value: "不会编程" },
    scale: { value: "每天一章" },
    requirements: { value: "中文长篇" },
  },
  missing: [],
};
const web = {
  citation_id: "W1",
  title: "创作平台",
  url: "https://writer.example/plans",
  excerpt: "按章创作，订阅另计",
  searched_at: "2026-11-08T01:00:00Z",
};
const turn = {
  id: "reply",
  role: "assistant",
  content: "先用创作平台 [W1]。",
  result: {
    workflow: wf,
    finish_reason: "stop",
    model: "contract-model",
    trace_id: "trace",
    retrieved: [],
    citations: [],
    web_citations: [web],
  },
};
const conv = {
  id: "case-conv",
  title: "低成本小说创作选型",
  title_mode: "auto",
  revision: 2,
  created_at: "2026-11-08",
  updated_at: "2026-11-08",
  deleted_at: null,
  messages: [{ id: "user", role: "user", content: "AI小说写作" }, turn],
};
const db = createDemoStore({ ...data, conversations: [conv] });
const feedback = (rating) =>
  db.request("POST", "/conversations/case-conv/messages/reply/feedback", {
    rating,
  });
assert.equal(caseScene(wf.fields).id, "novel");
assert.ok(eligibleSolution(turn));
assert.throws(
  () =>
    solutionSnapshot(
      {
        ...conv,
        messages: [
          { ...turn, result: { ...turn.result, finish_reason: "length" } },
        ],
      },
      "reply",
    ),
  /已完成/,
);
assert.throws(
  () =>
    db.request("POST", "/conversations/case-conv/messages/user/feedback", {
      rating: "good",
    }),
  /已完成/,
);
assert.throws(() => feedback("unknown"), /有效/);
assert.throws(
  () =>
    db.request("POST", "/conversations/case-conv/messages/reply/feedback", {
      rating: "good",
      answer: "forged",
    }),
  /有效/,
);
const beforeFacts = db.exportState().facts.length;
let first = feedback("good");
assert.equal(first.saved, true);
assert.equal(db.request("GET", "/solution-cases").length, 1);
assert.equal(db.request("GET", "/solution-cases?scene_id=video").length, 0);
assert.equal(feedback("okay").case_id, first.case_id);
assert.equal(db.request("GET", "/solution-cases").length, 1);
const saved = db.request("GET", "/solution-cases")[0];
assert.equal(saved.answer, turn.content);
assert.equal(saved.references[0].url, web.url);
assert.equal(saved.evidence_status, "user_endorsed_unverified");
assert.equal(
  db.request("GET", "/conversations/case-conv").feedback.reply.rating,
  "okay",
);
assert.equal(db.request("GET", "/conversations/case-conv").revision, 2);
assert.equal(caseReferences([saved], wf, "case-conv").length, 0);
assert.equal(caseReferences([saved], wf, "another").length, 1);
assert.equal(
  caseReferences([{ ...saved, is_demo: true }], wf, "another").length,
  0,
);
let other = db.request("POST", "/conversations", { title: "新对话" });
const prepared = db.prepareBrowserChat(
  {
    conversation_id: other.id,
    revision: 0,
    messages: [{ role: "user", content: "确认需求" }],
    action: "generate",
  },
  wf,
);
assert.equal(prepared.saved_solution_cases.length, 1);
assert.ok(
  groundedMessages(prepared).at(-1).content.includes("SAVED_SOLUTION_CASES"),
);
assert.equal(db.exportState().facts.length, beforeFacts);
const reload = createDemoStore(upgradeDemoState(db.exportState(), data));
assert.equal(
  reload.request("GET", "/solution-cases")[0].references[0].url,
  web.url,
);
feedback("bad");
assert.equal(db.request("GET", "/solution-cases").length, 0);
assert.equal(
  db.request("GET", "/conversations/case-conv").feedback.reply.rating,
  "bad",
);
feedback("good");
db.request("DELETE", "/conversations/case-conv");
assert.equal(db.request("GET", "/solution-cases").length, 1);
assert.throws(() => feedback("okay"), /对话/);
const truncated = {
  ...turn,
  id: "partial",
  content: "第一部分 [W1]",
  result: { ...turn.result, finish_reason: "length" },
};
const continued = { ...turn, id: "continued", content: "第二部分" };
assert.match(
  solutionSnapshot(
    {
      ...conv,
      messages: [
        conv.messages[0],
        truncated,
        { role: "user", id: "continue", content: "续写" },
        continued,
      ],
    },
    "continued",
  ).answer,
  /第一部分[\s\S]*第二部分/,
);
assert.equal(
  modelAccess({ license: "Apache-2.0；完整协议" }).id,
  "open_source",
);
assert.equal(modelAccess({ license: "MIT" }).label, "开源模型");
assert.equal(
  modelAccess({ license: "FLUX.1 Dev Non-Commercial" }).id,
  "open_weights",
);
assert.equal(
  modelAccess({ license: "Llama 3.1 Community License" }).id,
  "open_weights",
);
assert.equal(modelAccess(null), null);
assert.match(
  linkEvidence("参考[W1]，保留[W2]", [web]),
  /\[W1\]\(https:\/\/writer.example\/plans\)/,
);
assert.equal(
  linkEvidence("[W1]", [{ ...web, url: "javascript:alert(1)" }]),
  "[W1]",
);
assert.equal(
  linkEvidence("[W1](https://existing.example)", [web]),
  "[W1](https://existing.example)",
);
assert.ok(
  linkEvidence("[W1]", [
    { ...web, url: "https://writer.example/(plans)" },
  ]).includes("%28plans%29"),
);
const q = searchQueries(wf, "确认需求，生成方案");
assert.match(q[0], /写作平台/);
assert.match(q[1], /部署.*费用/);
const rows = [0, 1].map((batch) =>
  Array.from({ length: 4 }, (_, i) => ({
    ...web,
    url: `https://batch${batch}.example/${i}`,
    source_type: batch === 0 ? "official" : "web",
  })),
);
const combined = combineSearch("tavily", q, "today", rows, []);
assert.equal(combined.results.length, 6);
assert.equal(
  combined.results.filter((r) => r.url.includes("batch1")).length,
  3,
);
const warning = groundedResult(
  "只用了知识库[K1]",
  "stop",
  {
    trace_id: "t",
    retrieved: [{ citation_id: "K1" }],
    web_search: { status: "ok", results: [web], queries: [], errors: [] },
  },
  "model",
);
assert.ok(warning.warnings.some((w) => w.includes("正文未引用")));
console.log(
  "PASS: scenario feedback is idempotent, preserves evidence, excludes rejected/demo/self references, survives reload, stays out of facts; capability license labels, bounded balanced search and clickable citations.",
);

assert.equal(caseScene({ goal: { value: "不要小说，只做视频" } }).id, "video");
assert.equal(
  modelAccess({ license: "Llama custom license; tokenizer MIT" }).id,
  "open_weights",
);

const { completeGroundedBrowser } = await import("../src/browserModel.ts");
const connection = {
  base_url: "https://model.example/v1",
  api_key: "contract-only-secret",
  model: "writer",
  protocol: "chat_completions",
  token_parameter: "max_tokens",
  max_output_tokens: 2400,
};
const context = {
  history: [],
  prompt: "确认需求",
  retrieved: [],
  workflow: wf,
  web_search: { status: "ok", results: [web], queries: [], errors: [] },
};
let attempts = 0;
const repaired = await completeGroundedBrowser(
  connection,
  context,
  async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: ++attempts === 1 ? "只用了库内" : "创作平台解释[W1]",
            },
            finish_reason: "stop",
          },
        ],
      }),
    ),
);
assert.equal(attempts, 2);
assert.equal(repaired.grounding_repair.adopted, true);
assert.equal(repaired.grounding_warnings.length, 0);
attempts = 0;
const fallback = await completeGroundedBrowser(
  connection,
  context,
  async () => {
    attempts++;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "完整首稿" }, finish_reason: "stop" }],
      }),
    );
  },
);
assert.equal(attempts, 2);
assert.equal(fallback.answer, "完整首稿");
assert.equal(fallback.grounding_repair.adopted, false);
assert.ok(fallback.grounding_warnings.length);
const continuedReply = await completeGroundedBrowser(
  connection,
  { ...context, continuing: true },
  async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "接着补完" }, finish_reason: "stop" }],
      }),
    ),
);
assert.equal(continuedReply.grounding_repair.attempted, false);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDemoStore } from "../src/demo/store.ts";
import {
  buildKnowledgeNavigation,
  entityVendor,
} from "../src/knowledgeNavigation.ts";
const data = JSON.parse(
  readFileSync(
    new URL("../public/demo/knowledge.json", import.meta.url),
    "utf8",
  ),
);
const db = createDemoStore(data),
  entities = db.request("GET", "/entities"),
  navigation = db.request("GET", "/knowledge/navigation");
const node = (path) =>
  navigation.nodes.find((n) => JSON.stringify(n.path) === JSON.stringify(path));
const names = (n) =>
  n.entity_ids.map((id) => entities.find((e) => e.id === id).name);
assert.deepEqual(
  navigation.nodes.filter((n) => !n.parent_id).map((n) => n.name),
  ["生成类", "理解类", "检索与表征", "工具与平台", "其他知识"],
);
assert.equal(node(["生成类", "大语言模型", "OpenAI"]).entity_ids.length, 3);
assert.equal(node(["生成类", "大语言模型", "阿里云"]).entity_ids.length, 8);
assert.ok(names(node(["生成类", "大语言模型", "阿里云"])).includes("Qwen3-8B"));
assert.ok(
  names(node(["理解类", "理解图片", "阿里云"])).includes(
    "Qwen2.5-VL-7B-Instruct",
  ),
);
assert.ok(
  !names(node(["理解类", "理解文字"])).includes("Qwen3-Embedding-0.6B"),
);
assert.equal(node(["理解类", "理解视频"]).entity_ids.length, 10);
assert.equal(
  new Set(navigation.nodes.flatMap((n) => n.direct_entity_ids)).size,
  172,
);
for (const n of navigation.nodes) {
  assert.equal(new Set(n.entity_ids).size, n.entity_ids.length);
  if (n.parent_id)
    assert.ok(navigation.nodes.some((p) => p.id === n.parent_id));
}
assert.equal(
  navigation.nodes.filter(
    (n) =>
      n.path.length === 3 &&
      n.path[0] === "生成类" &&
      n.path[1] === "大语言模型" &&
      n.name === "阿里云",
  ).length,
  1,
);
assert.equal(
  entityVendor({ id: "x", name: "Qwen3-8B", kind: "model" }, []),
  "阿里云",
);
const unknown = buildKnowledgeNavigation(
  [{ id: "u", name: "用户新模型", kind: "model", category_ids: ["c"] }],
  [{ id: "c", name: "大语言模型", parent_id: null }],
);
assert.ok(
  unknown.nodes.some(
    (n) => n.path.at(-1) === "厂家待核验" && n.direct_entity_ids.includes("u"),
  ),
);
console.log(
  "PASS: capability/type/vendor hierarchy, merged factories, shared multimodal IDs, complete coverage and explicit empty/unknown branches",
);

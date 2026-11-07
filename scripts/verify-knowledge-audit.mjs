/** Offline coverage/provenance checks, not a substitute for editorial web verification. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateDataset } from "./import-official-knowledge.mjs";
const root = new URL("../backend/data/", import.meta.url);
const audit = JSON.parse(
  readFileSync(new URL("audits/2026-11-07.json", root), "utf8"),
);
const entities = new Map();
for (const [file, hash] of Object.entries(audit.dataset_sha256)) {
  const bytes = readFileSync(new URL(file, root));
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    hash,
    `Audit is stale: ${file}`,
  );
  const data = JSON.parse(bytes);
  validateDataset(data);
  for (const e of data.entities) {
    assert.ok(!entities.has(e.name), `Duplicate entity: ${e.name}`);
    entities.set(e.name, {
      ...e,
      source: data.sources.find((s) => s.id === e.source),
    });
  }
}
assert.equal(audit.entities.length, 140);
assert.equal(
  audit.entities.reduce((n, e) => n + e.fields.length, 0),
  305,
);
assert.equal(new Set(audit.source_checks.map((s) => s.url)).size, 85);
assert.ok(
  audit.source_checks.every((s) => s.checked_at && s.review_method && s.note),
);
const covered = new Set();
const verdicts = new Set([
  "retained",
  "corrected",
  "evidence_repaired",
  "official_index_only",
  "needs_stronger_excerpt",
]);
for (const row of audit.entities) {
  const e = entities.get(row.name);
  assert.ok(e && !covered.has(row.name));
  covered.add(row.name);
  assert.ok(row.remaining.length);
  assert.equal(e.facts.length, row.fields.length + row.added_fields.length);
  for (const f of row.fields) {
    const current = e.facts.find((x) => x.key === f.key);
    assert.ok(verdicts.has(f.verdict));
    assert.equal(current.value, f.after);
    assert.equal(e.source.url, f.source_url);
    assert.equal(e.source.excerpts[current.evidence], f.evidence);
    assert.ok(f.verification_basis);
  }
  for (const f of row.added_fields)
    assert.deepEqual(
      e.facts.find((x) => x.key === f.key),
      f,
    );
}
for (const row of audit.added_entities) {
  assert.ok(!covered.has(row.name));
  covered.add(row.name);
  assert.deepEqual(entities.get(row.name).facts, row.facts);
}
assert.equal(covered.size, entities.size);
assert.equal(entities.size, audit.scope.current_entities);
assert.equal(
  [...entities.values()].reduce((n, e) => n + e.facts.length, 0),
  audit.scope.current_facts,
);
assert.equal(audit.hub_checks.length, 20);
assert.ok(
  audit.hub_checks.every(
    (r) => r.api_status === 200 && r.download_status === 200 && r.sha,
  ),
);
console.log(
  "PASS: all 140 baseline entities / 305 fields / 85 sources accounted for; current corpus and audit agree.",
);

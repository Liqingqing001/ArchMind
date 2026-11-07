/** Exercise import semantics against an in-memory clone of the current SQLite schema. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importDataset, validateDataset } from './import-official-knowledge.mjs';

const original = new DatabaseSync(fileURLToPath(new URL('../backend/knowledge.db', import.meta.url)), { readOnly: true });
const db = new DatabaseSync(':memory:');
const schema = original.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY type DESC").all();
original.close();
for (const { sql } of schema) db.exec(sql);
const dataset = process.argv.find(a => a.startsWith('--dataset='))?.slice(10) || new URL('../backend/data/official-knowledge-2026-11-07.json', import.meta.url);
const data = JSON.parse(readFileSync(dataset, 'utf8'));
validateDataset(data);
const first = importDataset(db, data);
assert.equal(first.added_entities, data.entities.length);
assert.equal(first.published_facts, data.entities.reduce((n,e) => n+e.facts.length,0));
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
const repeated = importDataset(db, data);
assert.ok(Object.values(repeated).every(n => n === 0), 'Repeat must be a no-op');
const conflict = structuredClone(data);
conflict.entities[0].facts[0].value = '测试冲突候选';
const before = db.prepare('SELECT count(*) AS n FROM entity_facts').get().n;
assert.equal(importDataset(db, conflict).pending_conflicts, 1);
assert.equal(db.prepare('SELECT count(*) AS n FROM entity_facts').get().n, before);
assert.equal(db.prepare("SELECT count(*) AS n FROM entity_facts WHERE value='测试冲突候选'").get().n, 0);
const invalid = structuredClone(data);
invalid.entities[0].facts[0].evidence = 999;
assert.throws(() => importDataset(db, invalid), /Invalid fact/);
// Force a mid-transaction failure after a new entity is inserted.
const rollback = structuredClone(data);
rollback.entities.unshift({ ...structuredClone(data.entities[0]), name: '事务回滚测试实体' });
const last = data.entities.at(-1);
db.prepare('UPDATE entities SET is_demo=1 WHERE name=?').run(last.name);
assert.throws(() => importDataset(db, rollback), /demo facts/);
assert.equal(db.prepare("SELECT count(*) AS n FROM entities WHERE name='事务回滚测试实体'").get().n, 0);
db.prepare('UPDATE entities SET is_demo=0 WHERE name=?').run(last.name);
// Empty demonstration placeholders can be promoted while retaining IDs.
const placeholder = structuredClone(data.entities[0]);
placeholder.name = '空白演示占位测试';
db.prepare('INSERT INTO entities(id,name,kind,description,website,is_demo,created_at) VALUES (?,?,?,?,?,?,?)').run('placeholder-id', placeholder.name, placeholder.kind, 'demo', '', 1, new Date().toISOString());
assert.equal(importDataset(db, { ...data, entities: [placeholder] }).upgraded_placeholders, 1);
assert.equal(db.prepare('SELECT is_demo FROM entities WHERE id=?').get('placeholder-id').is_demo, 0);
console.log(JSON.stringify({ result: 'PASS', checks: ['schema compatibility','fact publication','idempotency','conflict preservation','invalid evidence rejection','transaction rollback','placeholder upgrade','foreign keys','database integrity'], ...first },null,2));
db.close();

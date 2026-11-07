/** Offline curated-data import into the existing SQLite schema. Node 22.16+. */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultDataset = resolve(root, 'backend/data/official-knowledge-2026-11-07.json');
const digest = value => createHash('sha256').update(value).digest('hex');

export function validateDataset(data) {
  if (data.schema_version !== 1 || !data.batch_id || !/^\d{4}-\d{2}-\d{2}$/.test(data.checked_on)) throw Error('Invalid dataset metadata');
  const sources = new Map(data.sources.map(s => [s.id, s]));
  if (sources.size !== data.sources.length) throw Error('Duplicate source ID');
  for (const s of sources.values()) {
    const url = new URL(s.url);
    if (url.protocol !== 'https:' || !s.title || !s.excerpts.length || s.excerpts.some(x => !x.trim())) throw Error(`Invalid source: ${s.id}`);
  }
  const names = new Set();
  for (const e of data.entities) {
    if (!e.name || names.has(e.name)) throw Error(`Duplicate entity: ${e.name}`);
    names.add(e.name);
    if (!['vendor','product','model','api','project','framework','cloud','solution'].includes(e.kind)) throw Error('Invalid entity type');
    const source = sources.get(e.source);
    if (!source || !e.facts.length || !e.categories.length) throw Error(`Incomplete entity: ${e.name}`);
    const keys = new Set();
    for (const f of e.facts) {
      if (!f.key || !f.value || keys.has(f.key) || !Number.isInteger(f.evidence) || !source.excerpts[f.evidence]) throw Error(`Invalid fact: ${e.name}/${f.key}`);
      keys.add(f.key);
    }
    if (e.categories.some(p => !p.length || p.some(n => typeof n !== 'string' || !n.trim()))) throw Error('Invalid category path');
  }
  for (const e of data.entities) if (e.vendor && !data.entities.some(v => v.name === e.vendor && v.kind === 'vendor')) throw Error(`Missing vendor: ${e.vendor}`);
}

export function importDataset(db, data) {
  validateDataset(data);
  const now = new Date().toISOString();
  const stats = { added_entities: 0, upgraded_placeholders: 0, categories: 0, sources: 0, snapshots: 0, published_facts: 0, pending_conflicts: 0, relations: 0 };
  const sources = new Map(data.sources.map(s => [s.id, s]));
  const ids = new Map();
  const insert = (table, row) => {
    const keys = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(row));
  };
  function category(path) {
    let parent = null;
    for (const name of path) {
      let row = db.prepare('SELECT id FROM categories WHERE name=? AND parent_id IS ?').get(name, parent);
      if (!row) {
        row = { id: randomUUID() };
        insert('categories', { id: row.id, name, parent_id: parent });
        stats.categories++;
      }
      parent = row.id;
    }
    return parent;
  }
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000; BEGIN IMMEDIATE');
  try {
    for (const e of data.entities) {
      const matches = db.prepare('SELECT * FROM entities WHERE name=? AND kind=?').all(e.name, e.kind);
      if (matches.length > 1) throw Error(`Ambiguous existing entity: ${e.name}`);
      let row = matches[0];
      const source = sources.get(e.source);
      if (!row) {
        row = { id: randomUUID(), is_demo: 0 };
        insert('entities', { id: row.id, name: e.name, kind: e.kind, description: e.description, website: source.url, is_demo: 0, created_at: now });
        stats.added_entities++;
      } else if (row.is_demo) {
        if (db.prepare('SELECT 1 FROM entity_facts WHERE entity_id=? LIMIT 1').get(row.id)) throw Error(`Refusing to relabel entity with demo facts: ${e.name}`);
        db.prepare('UPDATE entities SET description=?, website=?, is_demo=0 WHERE id=?').run(e.description, source.url, row.id);
        stats.upgraded_placeholders++;
      }
      ids.set(e.name, row.id);
      for (const path of e.categories) db.prepare('INSERT OR IGNORE INTO entity_categories(entity_id,category_id) VALUES (?,?)').run(row.id, category(path));
      const sourceMatches = db.prepare('SELECT * FROM sources WHERE entity_id=? AND url=? AND is_demo=0').all(row.id, source.url);
      if (sourceMatches.length > 1) throw Error(`Ambiguous source for ${e.name}`);
      let sourceRow = sourceMatches[0];
      if (!sourceRow) {
        sourceRow = { id: randomUUID() };
        insert('sources', { id: sourceRow.id, entity_id: row.id, name: source.title + '（联网整理摘录）', url: source.url, source_type: 'web', interval_hours: 168, enabled: 0, is_demo: 0, last_checked_at: now, next_check_at: now, status: 'unchanged', etag: null, last_modified: null });
        stats.sources++;
      }
      const content = `[官方资料短摘录；不是完整网页]\n资料核验日期：${data.checked_on}\n来源：${source.url}\n${source.excerpts.join('\n')}\n说明：中文事实为 Codex 基于官方资料的编辑归纳，未由内置采集器抓取完整原文。`;
      const hash = digest(content);
      let snapshot = db.prepare('SELECT id FROM source_snapshots WHERE source_id=? AND content_hash=?').get(sourceRow.id, hash);
      if (!snapshot) {
        snapshot = { id: randomUUID() };
        insert('source_snapshots', { id: snapshot.id, source_id: sourceRow.id, content, raw_content: JSON.stringify({ provenance: 'web_tool_excerpt_not_raw_http_response', batch_id: data.batch_id, ...source }, null, 2), content_hash: hash, fetched_at: now });
        stats.snapshots++;
      }
      for (const f of e.facts) {
        const current = db.prepare('SELECT * FROM entity_facts WHERE entity_id=? AND key=? AND valid_to IS NULL').get(row.id, f.key);
        if (current?.value === f.value) continue;
        if (db.prepare('SELECT 1 FROM change_events WHERE entity_id=? AND key=? AND new_value=? AND base_version=? AND status IN (\'pending\',\'rejected\')').get(row.id, f.key, f.value, current?.version || 0)) continue;
        // Archived history must not be silently resurrected by a bulk import.
        const historical = db.prepare('SELECT max(version) AS version FROM entity_facts WHERE entity_id=? AND key=?').get(row.id, f.key).version;
        if (!current && historical) throw Error(`Archived field requires manual review: ${e.name}/${f.key}`);
        const id = randomUUID();
        const evidence = source.excerpts[f.evidence];
        const approved = !current;
        insert('change_events', { id, entity_id: row.id, snapshot_id: snapshot.id, key: f.key, old_value: current?.value || null, new_value: f.value, base_version: current?.version || 0, evidence, status: approved ? 'approved' : 'pending', risk: 'normal', origin: 'curated_web', reviewer: approved ? 'Codex 官方资料整理' : null, review_note: `${data.batch_id}；用户授权联网补库；AI 编辑核对官方资料，非人工复核。现有事实冲突需另行审核。`, created_at: now, reviewed_at: approved ? now : null });
        if (approved) {
          insert('entity_facts', { id: randomUUID(), entity_id: row.id, key: f.key, value: f.value, version: 1, snapshot_id: snapshot.id, evidence, valid_from: now, valid_to: null, change_id: id });
          stats.published_facts++;
        } else stats.pending_conflicts++;
      }
    }
    for (const e of data.entities.filter(e => e.vendor)) {
      const relation = e.kind === 'model' ? '开发模型' : '提供产品与服务';
      const result = db.prepare('INSERT OR IGNORE INTO entity_relations(id,from_id,to_id,relation) VALUES (?,?,?,?)').run(randomUUID(), ids.get(e.vendor), ids.get(e.name), relation);
      stats.relations += Number(result.changes);
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw Error('Foreign-key validation failed');
    db.exec('COMMIT');
    return stats;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const database = resolve(args.find(a => a.startsWith('--db='))?.slice(5) || resolve(root, 'backend/knowledge.db'));
  const dataset = resolve(args.find(a => a.startsWith('--dataset='))?.slice(10) || defaultDataset);
  const data = JSON.parse(readFileSync(dataset, 'utf8'));
  validateDataset(data);
  if (!apply) {
    console.log(JSON.stringify({ mode: 'validate-only', entities: data.entities.length, facts: data.entities.reduce((n,e) => n+e.facts.length,0), sources: data.sources.length, database },null,2));
  } else {
    if (!existsSync(database)) throw Error('Database must already exist and have current migrations');
    const db = new DatabaseSync(database);
    try {
      const dir = resolve(root, 'artifacts/backups');
      mkdirSync(dir, { recursive: true });
      const backup = resolve(dir, `knowledge-before-${Date.now()}.db`);
      db.prepare('VACUUM INTO ?').run(backup);
      console.log(JSON.stringify({ backup, ...importDataset(db, data) },null,2));
    } finally { db.close(); }
  }
}

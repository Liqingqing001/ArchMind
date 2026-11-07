/** Export only checked-in public knowledge; never reads a live DB, env or secrets. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDataset } from './import-official-knowledge.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const id = value => digest(value).slice(0, 32);
const datasets = ['official-knowledge-2026-11-07.json', 'open-model-knowledge-2026-11-07.json']
  .map(name => JSON.parse(readFileSync(resolve(root, 'backend/data', name), 'utf8')));
const data = { metadata: { schema_version: 1, checked_on: '2026-11-07', fingerprint: digest(JSON.stringify(datasets)), provenance: 'checked_in_public_excerpts_not_live_collection' }, categories: [], entities: [], links: [], relations: [], sources: [], snapshots: [], facts: [], changes: [], runs: [] };
const ensureCategory = path => {
  let parent = null;
  for (const name of path) {
    const key = id('category:' + (parent || '') + ':' + name);
    if (!data.categories.some(c => c.id === key)) data.categories.push({ id: key, name, parent_id: parent });
    parent = key;
  }
  return parent;
};
for (const dataset of datasets) {
  validateDataset(dataset);
  for (const entity of dataset.entities) {
    if (data.entities.some(e => e.name === entity.name)) throw Error('Ambiguous public entity: ' + entity.name);
    const source = dataset.sources.find(s => s.id === entity.source);
    const entityId = id('entity:' + entity.kind + ':' + entity.name);
    const sourceId = id('source:' + entityId + ':' + source.url);
    const snapshotId = id('snapshot:' + sourceId + ':' + dataset.batch_id);
    const stamp = (source.checked_on || dataset.checked_on) + 'T00:00:00.000Z';
    const content = `[官方资料短摘录；不是完整网页]\n资料核验日期：${dataset.checked_on}\n来源：${source.url}\n${source.excerpts.join('\n')}\n说明：沿用仓库中的官方资料编辑归纳，本体验站未实时采集。`;
    data.entities.push({ id: entityId, name: entity.name, kind: entity.kind, description: entity.description, website: source.url, is_demo: false, created_at: stamp });
    for (const path of entity.categories) data.links.push({ entity_id: entityId, category_id: ensureCategory(path) });
    data.sources.push({ id: sourceId, entity_id: entityId, name: source.title + '（静态资料摘录）', url: source.url, source_type: 'web', interval_hours: 168, enabled: false, is_demo: false, status: 'unchanged', last_checked_at: stamp, next_check_at: stamp });
    data.snapshots.push({ id: snapshotId, source_id: sourceId, content, raw_content: JSON.stringify({ provenance: data.metadata.provenance, batch_id: dataset.batch_id, ...source }, null, 2), content_hash: digest(content), fetched_at: stamp });
    for (const fact of entity.facts) {
      const factId = id('fact:' + entityId + ':' + fact.key);
      const changeId = id('change:' + factId);
      data.facts.push({ id: factId, entity_id: entityId, key: fact.key, value: fact.value, version: 1, snapshot_id: snapshotId, evidence: source.excerpts[fact.evidence], valid_from: stamp, valid_to: null, change_id: changeId });
      data.changes.push({ id: changeId, entity_id: entityId, snapshot_id: snapshotId, key: fact.key, old_value: null, new_value: fact.value, base_version: 0, evidence: source.excerpts[fact.evidence], status: 'approved', risk: 'normal', origin: 'curated_web', reviewer: '公开资料快照', review_note: '沿用仓库已有的编辑整理记录；非本站实时审核或采集。', created_at: stamp, reviewed_at: stamp });
    }
  }
}
for (const dataset of datasets) for (const entity of dataset.entities.filter(e => e.vendor)) {
  const vendor = data.entities.find(e => e.name === entity.vendor && e.kind === 'vendor');
  const target = data.entities.find(e => e.name === entity.name);
  data.relations.push({ id: id('relation:' + vendor.id + ':' + target.id), from_id: vendor.id, to_id: target.id, relation: entity.kind === 'model' ? '开发模型' : '提供产品与服务' });
}
// A visibly fictional entity is the only place where a seeded review changes model specs.
const stamp = '2026-11-07T00:00:00.000Z';
const atlas = id('demo:atlas'), source = id('demo:source'), snapshot = id('demo:snapshot');
const content = '[虚构演示文档，非真实产品资料]\n支持输入：文本、图像\n上下文窗口：64K tokens\n新版上下文窗口：128K tokens\n示例价格：每百万输入 tokens 2 元（虚构）。';
data.entities.push({ id: atlas, name: '演示模型 · Atlas', kind: 'model', description: '用于体验证据审核、版本发布和检索追溯的虚构模型；所有参数均为演示。', website: 'https://example.com/atlas', is_demo: true, created_at: stamp });
data.links.push({ entity_id: atlas, category_id: ensureCategory(['AI 模型', '大语言模型', '通用对话']) });
data.sources.push({ id: source, entity_id: atlas, name: 'Atlas 文档（虚构演示）', url: 'https://example.com/atlas', source_type: 'web', interval_hours: 24, enabled: false, is_demo: true, status: 'changed', last_checked_at: stamp, next_check_at: stamp });
data.snapshots.push({ id: snapshot, source_id: source, content, raw_content: content, content_hash: digest(content), fetched_at: stamp });
for (const [key, value, evidence] of [['支持输入', '文本、图像', '支持输入：文本、图像'], ['上下文窗口', '64K tokens', '上下文窗口：64K tokens']]) data.facts.push({ id: id('demo:fact:' + key), entity_id: atlas, key, value, evidence, version: 1, snapshot_id: snapshot, valid_from: stamp, valid_to: null, change_id: null });
for (const [key, value, old, base, evidence, risk] of [['上下文窗口', '128K tokens', '64K tokens', 1, '新版上下文窗口：128K tokens', 'normal'], ['示例价格', '每百万输入 tokens 2 元（虚构）', null, 0, '示例价格：每百万输入 tokens 2 元（虚构）。', 'high']]) data.changes.push({ id: id('demo:change:' + key), entity_id: atlas, snapshot_id: snapshot, key, old_value: old, new_value: value, base_version: base, evidence, status: 'pending', risk, origin: 'manual', reviewer: null, review_note: '', created_at: stamp, reviewed_at: null });
data.runs.push({ id: id('demo:run'), source_id: source, status: 'changed', started_at: stamp, finished_at: stamp, snapshot_id: snapshot, message: '演示巡检记录，未执行网络请求；两条虚构变更等待体验审核。' });
const destination = resolve(root, 'frontend/public/demo/knowledge.json');
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, JSON.stringify(data));
console.log(`Public demo snapshot: ${data.entities.length} entities, ${data.facts.length} facts; no live database or secrets read.`);

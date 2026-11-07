/** Add new public categories without deleting a visitor's conversations or review edits. */
export function upgradeDemoState(
  saved: Record<string, any>,
  base: Record<string, any>,
) {
  const state = structuredClone(saved);
  for (const table of [
    "entities",
    "categories",
    "sources",
    "snapshots",
    "relations",
    "facts",
    "changes",
    "runs",
  ]) {
    if (!Array.isArray(state[table])) throw new Error("Invalid saved state");
    const ids = new Set(state[table].map((row: any) => row.id));
    for (const row of base[table] || []) {
      if (ids.has(row.id)) continue;
      if (
        table === "facts" &&
        state.facts.some(
          (f: any) => f.entity_id === row.entity_id && f.key === row.key,
        )
      )
        continue;
      state[table].push(structuredClone(row));
    }
  }
  const links = new Set(
    (state.links || []).map((l: any) => l.entity_id + ":" + l.category_id),
  );
  for (const link of base.links || [])
    if (!links.has(link.entity_id + ":" + link.category_id))
      state.links.push(structuredClone(link));
  // Public corrections become reviewable proposals; keep local facts, edits and traces.
  for (const incoming of base.facts || []) {
    const entity = base.entities.find((e: any) => e.id === incoming.entity_id);
    if (!entity || entity.is_demo) continue;
    const current = state.facts.find(
      (f: any) =>
        f.entity_id === incoming.entity_id &&
        f.key === incoming.key &&
        !f.valid_to,
    );
    if (!current || current.value === incoming.value) continue;
    if (
      state.changes.some(
        (c: any) =>
          c.entity_id === current.entity_id &&
          c.key === current.key &&
          c.new_value === incoming.value &&
          c.base_version === current.version,
      )
    )
      continue;
    const original = base.changes.find((c: any) => c.id === incoming.change_id);
    state.changes.push({
      ...structuredClone(original),
      id: `public-update:${base.metadata.fingerprint}:${incoming.id}:${current.version}`,
      old_value: current.value,
      base_version: current.version,
      status: "pending",
      reviewer: null,
      reviewed_at: null,
      review_note: "公开资料更新与本地已发布值不同，保留原版本，等待你审核。",
    });
  }
  state.metadata = { ...base.metadata };
  return state;
}

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
  state.metadata = { ...base.metadata };
  return state;
}

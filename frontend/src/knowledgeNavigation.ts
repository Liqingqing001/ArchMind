/** A navigation view over the original entity IDs, never a second knowledge store. */
import policy from "../../backend/data/navigation-policy.json" with { type: "json" };
type Row = Record<string, any>;
export type KnowledgeNode = {
  id: string;
  name: string;
  parent_id: string | null;
  path: string[];
  entity_ids: string[];
  direct_entity_ids: string[];
  order: number;
  description: string;
};
export type KnowledgeNavigation = {
  version: number;
  roots: string[];
  nodes: KnowledgeNode[];
};
export function entityVendor(
  entity: Row,
  entities: Row[],
  relations: Row[] = [],
): string {
  let vendor = entity.vendor_name || "";
  if (!vendor) {
    for (const relation of relations) {
      if (!policy.vendor_relations.includes(relation.relation)) continue;
      const other =
        relation.to_id === entity.id
          ? relation.from_id
          : relation.from_id === entity.id
            ? relation.to_id
            : null;
      const match = entities.find((e) => e.id === other && e.kind === "vendor");
      if (match) {
        vendor = match.name;
        break;
      }
    }
  }
  vendor ||=
    (policy.model_vendors as Record<string, string>)[entity.name] || "";
  return (policy.vendor_aliases as Record<string, string>)[vendor] || vendor;
}
export function buildKnowledgeNavigation(
  entities: Row[],
  categories: Row[],
): KnowledgeNavigation {
  const rows = new Map<string, KnowledgeNode>(),
    categoryMap = new Map(categories.map((c) => [c.id, c]));
  const key = (path: string[]) => "nav:" + JSON.stringify(path);
  const ensure = (path: string[], order = 100, description = "") => {
    const id = key(path);
    if (!rows.has(id))
      rows.set(id, {
        id,
        name: path.at(-1)!,
        parent_id: path.length > 1 ? key(path.slice(0, -1)) : null,
        path: [...path],
        entity_ids: [],
        direct_entity_ids: [],
        order,
        description,
      });
    return rows.get(id)!;
  };
  policy.roots.forEach((root, i) => {
    ensure([root.name], i, root.description);
    root.children.forEach((name, j) => ensure([root.name, name], j));
  });
  for (const entity of entities) {
    const tags = new Set<string>();
    for (const cid of entity.category_ids || []) {
      let category = categoryMap.get(cid);
      const visited = new Set<string>();
      while (category && !visited.has(category.id)) {
        visited.add(category.id);
        tags.add(category.name);
        category = categoryMap.get(category.parent_id);
      }
    }
    const vendor = entityVendor(entity, entities) || "厂家待核验";
    let paths: string[][] = [];
    if (entity.is_demo) paths = [["其他知识", "演示条目"]];
    else if (entity.kind === "vendor") paths = [["其他知识", "厂商与组织"]];
    else if (entity.kind === "solution")
      paths = [["其他知识", "行业方案", vendor]];
    else if (entity.kind === "model") {
      let rules = policy.model_rules.filter((rule) => tags.has(rule.category));
      if (rules.some((rule) => "exclusive" in rule && rule.exclusive))
        rules = rules.filter((rule) => "exclusive" in rule && rule.exclusive);
      paths = rules.flatMap((rule) =>
        rule.paths.map((path) => [...path, vendor]),
      );
      if (!paths.length) paths = [["其他知识", "待整理模型", vendor]];
    } else {
      const services = policy.service_rules.filter((rule) =>
        tags.has(rule.category),
      );
      paths = services.length
        ? services.map((rule) => [...rule.path, vendor])
        : [
            [
              ...((policy.kind_paths as Record<string, string[]>)[
                entity.kind
              ] || ["其他知识", "待整理模型"]),
              vendor,
            ],
          ];
    }
    for (const path of paths) {
      path.forEach((_, i) => {
        const node = ensure(path.slice(0, i + 1));
        if (!node.entity_ids.includes(entity.id))
          node.entity_ids.push(entity.id);
      });
      const leaf = ensure(path);
      if (!leaf.direct_entity_ids.includes(entity.id))
        leaf.direct_entity_ids.push(entity.id);
    }
  }
  const nodes = [...rows.values()];
  return {
    version: policy.version,
    roots: policy.roots.map((root) => key([root.name])),
    nodes,
  };
}

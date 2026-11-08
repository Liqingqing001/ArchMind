import policy from "../../backend/data/recommendation-policy.json" with { type: "json" };
export { policy as recommendationPolicy };
type Row = Record<string, any>;
const negative = () =>
  /(?:不需要|不要|不想|不用|不做|不考虑|无需|禁止|不允许|不生成|不涉及|而不是)[^，。；;！!？?\n]*/g;
export const positive = (text: string) =>
  text
    .toLowerCase()
    .replace(/(但|而是|只做|只想|只要|只用|只写|只生成|只理解|改成)/g, "，$1")
    .replace(negative(), " ");
export function selectionContext(workflow?: Row) {
  const fields = workflow?.fields || {},
    goal = fields.goal?.value || "";
  const intent = positive(goal + "，" + (fields.requirements?.value || ""));
  const priorities = [
    "video_generation",
    "image_generation",
    "audio_generation",
    "image_understanding",
    "audio_understanding",
    "video_understanding",
    "text_understanding",
    "text_generation",
    "code_generation",
    "retrieval",
  ];
  const capabilities = policy.capabilities
    .filter((c) => c.cues.some((t) => intent.includes(t)))
    .sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id));
  const delivery: string = fields.delivery?.value || "",
    cleaned = positive(delivery),
    negatives = delivery.toLowerCase().match(negative()) || [];
  const denied = policy.routes
    .filter((r) => negatives.some((n) => r.cues.some((t) => n.includes(t))))
    .map((r) => r.id);
  const explicit = policy.routes
    .filter((r) => r.cues.some((t) => cleaned.includes(t)))
    .map((r) => r.id);
  let allowed = policy.routes
    .filter(
      (r) =>
        !denied.includes(r.id) &&
        (!explicit.length ||
          /无偏好|不限|随意/.test(cleaned) ||
          explicit.includes(r.id)),
    )
    .map((r) => r.id);
  const offline = /不出网|不上网|完全离线|数据不外传|禁止出网|不得出网/.test(
    fields.requirements?.value || "",
  );
  if (offline) allowed = allowed.filter((r) => r === "local");
  return {
    purpose: "模型、项目与成本方向选型",
    capabilities: capabilities.map((c) => ({ id: c.id, label: c.label })),
    routes: policy.routes
      .filter((r) => allowed.includes(r.id))
      .map((r) =>
        offline
          ? {
              ...r,
              name: "本地离线部署",
              cost: "本地硬件、电费与维护；数据不得出网，不使用云GPU、远程API或在线平台。",
            }
          : r,
      ),
    needs_website: /网站|网页|建站|站点|\bweb\b/.test(intent),
    offline,
    candidate_note:
      "下列是按能力与路线匹配的候选，不是效果、最低价、硬件兼容或账户可用性的保证。",
    output:
      "先主推一句，再比较适用路线：模型/项目、费用结构、关键代价、官方链接。",
  };
}
export function rankRecommendations(
  rows: Row[],
  _entities: Row[],
  categories: Row[],
  links: Row[],
  workflow: Row,
  prompt: string,
): Row[] | null {
  const context = selectionContext(workflow);
  if (
    !categories.length ||
    !context.capabilities.length ||
    context.capabilities[0].id === "retrieval"
  )
    return null;
  const capIds = context.capabilities.map((c) => c.id),
    primary = policy.capabilities.find((c) => c.id === capIds[0])!;
  const routes = context.routes.map((r) => r.id);
  if (!routes.length) return [];
  const grouped = new Map<string, Row[]>();
  for (const r of rows)
    if (!r.is_demo && r.entity_kind !== "vendor")
      grouped.set(r.entity_id, [...(grouped.get(r.entity_id) || []), r]);
  const referenced = (workflow.fields?.goal?.value || "") + " " + prompt;
  const candidates: Row[] = [];
  for (const [eid, facts] of grouped) {
    const name = facts[0].entity_name,
      kind = facts[0].entity_kind;
    const named = referenced.toLowerCase().includes(name.toLowerCase());
    const labels: string[] = [];
    for (const link of links.filter((l) => l.entity_id === eid)) {
      let category = categories.find((c) => c.id === link.category_id);
      const visited = new Set<string>();
      while (category && !visited.has(category.id)) {
        visited.add(category.id);
        labels.push(category.name);
        category = categories.find((c) => c.id === category!.parent_id);
      }
    }
    const inactive = facts.some(
      (f) =>
        ["接入状态", "文档状态", "开放状态"].includes(f.key) &&
        /legacy|停止服务|已关闭|已下线|不再向新客户|停止支持新购/i.test(
          f.value,
        ),
    );
    if (inactive && !named) continue;
    const tool = policy.platforms.find((t) => t.name === name);
    let matches: string[] = [],
      candidateRoutes: string[] = [],
      role = "";
    if (kind === "model") {
      for (const cap of policy.capabilities) {
        if (!capIds.includes(cap.id)) continue;
        const matching =
          cap.categories.some((c) => labels.includes(c)) ||
          (cap.id === "code_generation" &&
            policy.exact_code_models.includes(name));
        if (
          matching &&
          !(
            cap.id === "text_generation" &&
            !capIds.includes("code_generation") &&
            !cap.preferred_models.includes(name) &&
            cap.exclude_categories.some((c) => labels.includes(c))
          )
        )
          matches.push(cap.id);
      }
      if (!matches.length && !named) continue;
      candidateRoutes = [
        facts.some((f) => f.key === "官方下载入口") ? "local" : "api",
      ];
      role = "model";
    } else if (tool) {
      matches = capIds.filter((c) => tool.capabilities.includes(c));
      if (!matches.length) continue;
      candidateRoutes = tool.routes;
      role = tool.role;
    } else continue;
    candidateRoutes = candidateRoutes.filter((r) => routes.includes(r));
    if (named && (inactive || !candidateRoutes.length || !matches.length)) {
      candidateRoutes = ["reference"];
      matches = [primary.id];
    }
    if (!candidateRoutes.length) continue;
    const score =
      (tool ? 40 - policy.platforms.indexOf(tool) : 0) +
      (referenced.toLowerCase().includes(name.toLowerCase()) ? 1000 : 0) +
      (primary.preferred_models.includes(name)
        ? 100 - primary.preferred_models.indexOf(name) * 10
        : 0) -
      (name.includes("系列") ? 25 : 0);
    candidates.push({
      id: eid,
      name,
      facts,
      capabilities: matches,
      routes: candidateRoutes,
      role,
      score,
    });
  }
  candidates.sort(
    (a, b) =>
      b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  const groups: { route: string; items: Row[] }[] = [];
  const group = (route: string, role: string, cap = primary.id) => {
    const items = candidates.filter(
      (e) =>
        e.routes.includes(route) &&
        e.role === role &&
        e.capabilities.includes(cap),
    );
    if (items.length) groups.push({ route, items });
  };
  group("reference", "model");
  for (const route of routes)
    group(route, route === "platform" ? "platform" : "model");
  if (routes.includes("local")) group("local", "runtime");
  else if (routes.includes("api")) group("api", "application");
  if (context.needs_website && routes.includes("api"))
    group("api", "hosting", "code_generation");
  if (
    capIds.includes("code_generation") &&
    primary.id !== "code_generation" &&
    routes.includes("platform")
  )
    group("platform", "platform", "code_generation");
  if (routes.includes("api")) group("api", "gateway");
  const chosen: Row[] = [],
    seen = new Set<string>();
  for (const { route, items } of groups) {
    const entity = items.find((e) => !seen.has(e.id));
    if (!entity || chosen.length >= 12) continue;
    seen.add(entity.id);
    const facts: Row[] = entity.facts;
    const first = (keys: string[]) =>
      keys.flatMap((key) => facts.filter((f) => f.key === key))[0];
    const constraint = first(policy.constraint_fields),
      feature = first(policy.feature_fields) || facts[0],
      cost = first(policy.cost_fields);
    const selected: Row[] = [];
    for (const f of [constraint, feature, cost, ...facts]) {
      if (f && !selected.includes(f)) selected.push(f);
      if (selected.length === 2) break;
    }
    chosen.push(
      ...selected.map((f) => ({
        ...f,
        task: primary.label,
        recommendation_route: route,
        recommendation_role: entity.role,
      })),
    );
  }
  return chosen
    .slice(0, 12)
    .map((r, i) => ({ ...r, citation_id: `K${i + 1}` }));
}

export function previewTitle(workflow: Row) {
  const goal = workflow.fields?.goal?.value || "";
  if (goal.includes("小说") && /网站|建站|网页/.test(goal))
    return /低成本|成本低|省钱/.test(goal)
      ? "低成本小说网站选型"
      : "小说网站模型选型";
  const labels = selectionContext(workflow)
    .capabilities.slice(0, 2)
    .map((c) => c.label);
  return labels.length
    ? labels.join("与") + "选型"
    : Array.from(goal).slice(0, 32).join("") || "新对话";
}
export function previewRecommendation(workflow: Row, retrieved: Row[]) {
  const context = selectionContext(workflow);
  if (
    !context.capabilities.length ||
    context.capabilities[0].id === "retrieval"
  )
    return null;
  const citations: Row[] = [];
  const sections = context.routes.map((route) => {
    const ids = new Set<string>();
    const entries = retrieved.filter(
      (r) =>
        r.recommendation_route === route.id &&
        !ids.has(r.entity_id) &&
        !!ids.add(r.entity_id),
    );
    citations.push(...entries);
    const names = entries
      .map((r) => `[${r.entity_name}](${r.source_url}) [${r.citation_id}]`)
      .join(" + ");
    const boundary =
      route.id === "platform" && context.needs_website
        ? "聊天平台仅试写；独立网站还需建站产品与接口。"
        : "";
    return `- **${route.name}**：${names || "当前没有匹配的已发布候选，需补充资料"}。成本：${route.cost}${boundary}`;
  });
  const novice = /不会|零基础|不懂|免维护/.test(
    workflow.fields?.experience?.value || "",
  );
  const lead =
    novice && context.routes.some((r) => r.id === "platform")
      ? "先用现成工具验证创作和页面；要交付独立网站，还需确认开发与维护门槛。"
      : context.routes.some((r) => r.id === "api") && context.needs_website
        ? "有独立网站目标，优先比较 API 自建，避免一开始购买推理硬件。"
        : "按你的使用约束比较以下模型和工具。";
  return {
    answer: `> 交互演示：以下为按知识能力与路线匹配的静态候选，未调用大模型。\n\n${lead}\n\n${sections.join("\n\n")}`,
    citations,
  };
}

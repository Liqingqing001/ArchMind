import policy from "../../backend/data/solution-policy.json" with { type: "json" };
export { policy as solutionPolicy };
type Row = Record<string, any>;
export type Workflow = {
  version: number;
  phase: "collecting" | "ready" | "generated";
  fields: Record<string, { value: string; evidence: string }>;
  scene: string | null;
  missing: string[];
};
export const emptyWorkflow = (): Workflow => ({
  version: 1,
  phase: "collecting",
  fields: {},
  scene: null,
  missing: policy.slots.map((s) => s.id),
});
export const sceneFor = (text: string) =>
  policy.scenes.find((s) =>
    s.cues.some((c) => text.toLowerCase().includes(c)),
  ) || null;
export function previousWorkflow(messages: Row[]): Workflow {
  return structuredClone(
    [...messages].reverse().find((m) => m.result?.workflow?.version === 1)
      ?.result.workflow || emptyWorkflow(),
  );
}
export function extractionMessages(
  previous: Workflow,
  prompt: string,
  lastQuestion = "",
) {
  return [
    { role: "system" as const, content: policy.extraction_prompt },
    {
      role: "user" as const,
      content: JSON.stringify({
        BRIEF: previous.fields,
        LAST_QUESTION: lastQuestion,
        USER_INPUT: prompt,
      }),
    },
  ];
}
export function applyExtraction(
  previous: Workflow,
  raw: string,
  prompt: string,
): Workflow {
  const clean = raw
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  let parsed: Row;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw Error("需求识别未返回有效 JSON，请重试；尚未生成方案。");
  }
  if (
    !parsed.updates ||
    typeof parsed.updates !== "object" ||
    Array.isArray(parsed.updates)
  )
    throw Error("需求识别格式无效，请重试；尚未生成方案。");
  const next = structuredClone(previous);
  let changed = false;
  for (const slot of policy.slots) {
    const entry = parsed.updates[slot.id];
    if (!entry) continue;
    if (
      typeof entry.value !== "string" ||
      typeof entry.evidence !== "string" ||
      !entry.value.trim() ||
      entry.value.length > 500 ||
      !entry.evidence.trim() ||
      !prompt.includes(entry.evidence)
    )
      throw Error("需求识别缺少对应用户原文，请重试；尚未生成方案。");
    if (next.fields[slot.id]?.value !== entry.value.trim()) changed = true;
    next.fields[slot.id] = {
      value: entry.value.trim(),
      evidence: entry.evidence,
    };
  }
  const newScene = sceneFor(next.fields.goal?.value || "")?.id || null;
  if (previous.fields.goal && previous.scene !== newScene)
    for (const id of ["scale", "requirements"])
      if (!parsed.updates[id]) delete next.fields[id];
  next.scene = newScene;
  next.missing = policy.slots
    .filter((s) => !next.fields[s.id])
    .map((s) => s.id);
  next.phase = next.missing.length
    ? "collecting"
    : previous.phase === "generated" && !changed
      ? "generated"
      : "ready";
  return next;
}
export function isConfirmation(
  previous: Workflow,
  prompt: string,
  action?: string,
) {
  return (
    previous.phase === "ready" &&
    (action === "generate" ||
      policy.confirmations.includes(prompt.trim().replace(/[。！!？?]+$/, "")))
  );
}
export function clarification(workflow: Workflow) {
  const scene = policy.scenes.find((s) => s.id === workflow.scene),
    summary = policy.slots
      .filter((s) => workflow.fields[s.id])
      .map((s) => `- ${s.label}：${workflow.fields[s.id].value}`)
      .join("\n");
  if (workflow.phase === "ready")
    return `我理解的需求是：\n\n${summary}\n\n现在为你生成简版方案吗？你也可以直接修改上面的条件。`;
  const questions = workflow.missing
    .slice(0, 2)
    .map(
      (id) =>
        (scene && "questions" in scene
          ? (scene.questions as Record<string, string>)?.[id]
          : null) || policy.slots.find((s) => s.id === id)!.question,
    );
  return `${summary ? "已记下你的条件。我们再确认关键条件：" : "我们先把需求聊清楚。"}\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
}
export function searchTerms(text: string) {
  const terms = new Set<string>();
  for (const t of text.toLowerCase().match(/[a-z0-9][a-z0-9._+-]{1,}/g) || [])
    terms.add(t);
  for (const b of text.match(/[\u4e00-\u9fff]+/g) || [])
    for (let i = 0; i < b.length - 1; i++) terms.add(b.slice(i, i + 2));
  for (const [key, values] of Object.entries(policy.expansions))
    if (text.toLowerCase().includes(key)) values.forEach((v) => terms.add(v));
  policy.stop_terms.forEach((t) => terms.delete(t));
  return [...terms].sort();
}
export function rankKnowledge(
  rows: Row[],
  entities: Row[],
  categories: Row[],
  links: Row[],
  workflow: Workflow,
  prompt: string,
) {
  const goal = workflow.fields.goal?.value || prompt,
    scene = sceneFor(goal),
    query = searchTerms(
      goal + " " + prompt + " " + (workflow.fields.requirements?.value || ""),
    );
  const platform = /现成|免部署|一站式/.test(
    workflow.fields.delivery?.value || "",
  );
  const inactive = new Set(
    rows
      .filter(
        (r) =>
          policy.availability_fields.includes(r.key) &&
          policy.unavailable_markers.some((marker) =>
            r.value.toLowerCase().includes(marker),
          ) &&
          !(goal + " " + prompt).toLowerCase().includes(r.entity_name.toLowerCase()),
      )
      .map((r) => r.entity_id),
  );
  const ranked = rows
    .filter(
      (r) =>
        !r.is_demo && r.entity_kind !== "vendor" && !inactive.has(r.entity_id),
    )
    .map((r): Row | null => {
      const e = entities.find((e) => e.id === r.entity_id) || {};
      const tags = links
        .filter((l) => l.entity_id === r.entity_id)
        .map((l) => categories.find((c) => c.id === l.category_id)?.name || "")
        .join(" ");
      const text =
        `${r.entity_name} ${e.description || ""} ${r.key} ${r.value} ${tags}`.toLowerCase();
      const task =
        (
          scene?.tasks.find((t) =>
            t.terms.includes(r.entity_name.toLowerCase()),
          ) ||
          scene?.tasks.find((t) =>
            matchesSceneTask(
              t,
              { ...e, name: r.entity_name, kind: r.entity_kind },
              text,
              links
                .filter((l) => l.entity_id === r.entity_id)
                .map(
                  (l) =>
                    categories.find((c) => c.id === l.category_id)?.name || "",
                ),
            ),
          )
        )?.name || "";
      if (scene && !task) return null;
      if (
        task === "算力" &&
        !/gpu|自部署|本地/i.test(workflow.fields.delivery?.value || "")
      )
        return null;
      if (
        platform &&
        (task === "算力" ||
          task === "工作流" ||
          /开放权重/.test(e.description || "") ||
          /官方下载入口|官方模型仓库/.test(r.key))
      )
        return null;
      const exact = (
        prompt.toLowerCase().match(/[a-z0-9][a-z0-9._+-]{1,}/g) || []
      ).filter((t) => !policy.stop_terms.includes(t));
      const base =
        query.reduce((s, t) => s + (text.includes(t) ? 2 : 0), 0) +
        exact.reduce(
          (s, t) => s + (r.entity_name.toLowerCase().includes(t) ? 20 : 0),
          0,
        );
      const score =
        base + (/能力|用途|输入|部署|限制|兼容|价格/.test(r.key) ? 1 : 0);
      return base > 0 || task ? { ...r, task, score } : null;
    })
    .filter((r): r is Row => !!r)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.entity_name < b.entity_name
          ? -1
          : a.entity_name > b.entity_name
            ? 1
            : 0) ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );
  const chosen: Row[] = [],
    perEntity: Record<string, number> = {};
  const add = (r: Row) => {
    if (chosen.includes(r) || (perEntity[r.entity_id] || 0) >= 2) return;
    if (!perEntity[r.entity_id]) {
      const constraints = ranked
        .filter(
          (x) =>
            x.entity_id === r.entity_id &&
            policy.constraint_fields.includes(x.key),
        )
        .sort(
          (a, b) =>
            policy.constraint_fields.indexOf(a.key) -
            policy.constraint_fields.indexOf(b.key),
        );
      if (constraints.length && constraints[0] !== r) {
        chosen.push(constraints[0]);
        perEntity[r.entity_id] = 1;
      }
    }
    chosen.push(r);
    perEntity[r.entity_id] = (perEntity[r.entity_id] || 0) + 1;
  };
  if (scene)
    for (const task of scene.tasks)
      ranked
        .filter((r) => r.task === task.name)
        .slice(0, 2)
        .forEach(add);
  for (const r of ranked) {
    if (chosen.length >= 12) break;
    add(r);
  }
  return chosen
    .slice(0, 12)
    .map(({ score, ...r }, i) => ({ ...r, citation_id: `K${i + 1}` }));
}
/** Deterministic preview only; real connections use evidence-checked model extraction. */
export function previewExtraction(prompt: string, previous: Workflow) {
  const updates: Row = {};
  const set = (id: string, value: string) =>
    (updates[id] = { value, evidence: prompt });
  if (
    (sceneFor(prompt) && /想做|改做|目标|改成/.test(prompt)) ||
    (!previous.fields.goal && prompt.length > 4)
  )
    set("goal", prompt);
  if (/预算|\d+\s*(元|块|美元|人民币)/.test(prompt))
    set(
      "budget",
      prompt.match(
        /[^，。]*(?:\d+\s*(?:元|块|美元|人民币)|不确定)[^，。]*/,
      )?.[0] || prompt,
    );
  if (/现成|平台|API|api|自部署|本地|云.?GPU|无偏好/.test(prompt))
    set(
      "delivery",
      prompt.match(
        /现成平台|一站式平台|免部署|API|api|云.?GPU自部署|本地自部署|本地|自部署|无偏好/,
      )?.[0] || prompt,
    );
  if (/不会|会部署|会编程|新手|免维护|有经验|愿意维护/.test(prompt))
    set(
      "experience",
      prompt.match(
        /不会部署|不会编程|新手|会部署|会编程|免维护|有经验|愿意维护/,
      )?.[0] || prompt,
    );
  if (/分钟|秒|[一两三四\d]+条|小样|人数|\d+人/.test(prompt))
    set("scale", prompt);
  if (/风格|写实|一致|隐私|商用|无特别|质量|速度/.test(prompt))
    set("requirements", prompt);
  if (/不确定|不知道|无偏好/.test(prompt))
    for (const id of previous.missing.slice(0, 2))
      if (!updates[id]) set(id, "暂不确定，方案须注明假设");
  return JSON.stringify({ updates });
}

export function editorialGuide(workflow?: Workflow) {
  const scene = policy.scenes.find((s) => s.id === workflow?.scene);
  if (!scene) return null;
  const delivery = workflow?.fields.delivery?.value || "";
  const index = /现成|免部署|一站式/.test(delivery)
    ? 0
    : /gpu|自部署|本地/i.test(delivery)
      ? 2
      : /api|工作流/i.test(delivery)
        ? 1
        : null;
  return {
    name: scene.name,
    description: scene.description,
    routes:
      index === null ? scene.routes : [scene.routes[index] || scene.routes[0]],
    gaps: scene.gaps,
  };
}

export function matchesSceneTask(
  task: Row,
  entity: Row,
  text: string,
  labels: string[],
) {
  if (task.categories || task.entities)
    return (
      (!task.kinds || task.kinds.includes(entity.kind)) &&
      ((task.categories || []).some((c: string) => labels.includes(c)) ||
        (task.entities || []).includes(entity.name))
    );
  return task.terms.some((term: string) => text.includes(term));
}

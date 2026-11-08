import { positive } from "./recommendations.ts";
import policy from "../../backend/data/solution-case-policy.json" with { type: "json" };
export const casePolicy = policy;
export type SolutionRating = "good" | "okay" | "bad";
export type SolutionFeedback = {
  rating: SolutionRating;
  case_id: string;
  saved: boolean;
  scene_id: string;
  scene_name: string;
};
export type SolutionCase = Record<string, any> & {
  id: string;
  scene_id: string;
  scene_name: string;
  title: string;
  answer: string;
  rating: SolutionRating;
  references: Record<string, any>[];
  is_demo: boolean;
};
export const CASES_CHANGED_EVENT = "archmind-solution-cases-changed";
export function caseScene(fields: Record<string, any>) {
  const goal = positive(fields.goal?.value || "");
  return (
    policy.scenes.find((scene) =>
      scene.cues.some((cue) => goal.includes(cue)),
    ) || policy.fallback
  );
}
export function eligibleSolution(turn: Record<string, any>) {
  return (
    turn.role === "assistant" &&
    turn.result?.workflow?.phase === "generated" &&
    turn.result?.finish_reason === "stop" &&
    !!turn.content?.trim()
  );
}
export function solutionSnapshot(
  conversation: Record<string, any>,
  messageId: string,
) {
  const index = conversation.messages.findIndex((m: any) => m.id === messageId),
    turn = conversation.messages[index];
  if (!turn || !eligibleSolution(turn))
    throw Error("只能评价已完成的方案；请先补完被截断的内容。");
  // Continuation turns share a trace; keep the complete answer and frozen evidence together.
  const turns = [turn];
  for (let i = index - 2; i >= 0; i -= 2) {
    const previous = conversation.messages[i];
    if (
      previous?.result?.finish_reason !== "length" ||
      !turn.result.trace_id ||
      previous.result.trace_id !== turn.result.trace_id
    )
      break;
    turns.unshift(previous);
  }
  const fields = structuredClone(turn.result.workflow.fields || {}),
    scene = caseScene(fields);
  const references = new Map<string, Record<string, any>>();
  for (const item of turns)
    for (const source of [
      ...(item.result.citations || []),
      ...(item.result.web_citations || []),
    ]) {
      const url = source.source_url || source.url;
      if (!url || !/^https:\/\//i.test(url)) continue;
      references.set(source.citation_id + ":" + url, {
        citation_id: source.citation_id,
        title: source.entity_name || source.title,
        url,
        excerpt: source.evidence || source.excerpt || source.value || "",
        kind: source.citation_id?.startsWith("W") ? "web" : "knowledge",
        version: source.version || null,
        snapshot_id: source.snapshot_id || null,
        searched_at: source.searched_at || null,
      });
    }
  return {
    conversation_id: conversation.id,
    message_id: messageId,
    title: conversation.title,
    scene_id: scene.id,
    scene_name: scene.name,
    answer: turns.map((item) => item.content).join("\n\n"),
    brief: fields,
    references: [...references.values()],
    trace_id: turn.result.trace_id || "",
    model: turn.result.model || "",
    is_demo: turn.result.model === "本地交互演示",
    evidence_status: "user_endorsed_unverified",
  };
}
export function caseReferences(
  cases: Record<string, any>[],
  workflow: Record<string, any>,
  conversationId?: string,
) {
  const scene = caseScene(workflow.fields || {});
  return cases
    .filter(
      (row) =>
        row.rating !== "bad" &&
        !row.is_demo &&
        row.scene_id === scene.id &&
        row.conversation_id !== conversationId,
    )
    .slice(0, 2)
    .map((row) => ({
      id: row.id,
      title: row.title,
      scene: row.scene_name,
      brief: row.brief,
      answer: row.answer.slice(0, 5000),
      references: row.references,
      saved_at: row.updated_at,
      status: "用户认可的历史参考，未经实测；引用、价格和适用条件需重新核验",
    }));
}
/** Make numbered citations useful links even if a provider omitted its own Markdown links. */
export function linkEvidence(
  text: string,
  references: Record<string, any>[] = [],
) {
  const urls = new Map(
    references.map((row) => [row.citation_id, row.url || row.source_url]),
  );
  return text.replace(/\[([KW]\d+)\](?!\()/g, (whole, id) => {
    const url = urls.get(id);
    if (typeof url !== "string" || !/^https:\/\//i.test(url)) return whole;
    const safe = url
      .replace(/\s/g, (c) => encodeURIComponent(c))
      .replace(
        /[()<>]/g,
        (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
      );
    return `[${id}](${safe})`;
  });
}

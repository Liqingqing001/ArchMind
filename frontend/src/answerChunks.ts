import policy from "../../backend/data/generation-policy.json" with { type: "json" };
import type { ModelMessage } from "./browserModel.ts";
export { policy as generationPolicy };
export type GenerationBudget = { remaining: number; attempts: number; calls: number; usage: Record<string, number> };
export type ContinuationInfo = {
  enabled: boolean;
  attempts: number;
  segments: number;
  completed: boolean;
  stop_reason: string;
};
export function newGenerationBudget(): GenerationBudget {
  return {remaining: policy.max_continuations, attempts: 0, calls: 0, usage: {}};
}
export function recordUsage(budget: GenerationBudget, diagnostics: {usage?: Record<string,unknown>}) {
  for (const [key,value] of Object.entries(diagnostics.usage || {}))
    if (["input_tokens","output_tokens","prompt_tokens","completion_tokens","total_tokens"].includes(key) && typeof value === "number" && Number.isInteger(value) && value>=0)
      budget.usage[key]=(budget.usage[key] || 0)+value;
}
export function mergeChunk(existing: string, incoming: string) {
  if (!incoming.trim() || existing.trim() === incoming.trim()) return existing;
  if (Array.from(incoming.trim()).length >= policy.min_overlap_chars && existing.trimEnd().endsWith(incoming.trim())) return existing;
  if (Array.from(existing).length >= policy.min_overlap_chars && incoming.startsWith(existing)) return incoming;
  const a=Array.from(existing), b=Array.from(incoming);
  for (let size=Math.min(a.length,b.length,policy.overlap_chars);size>=policy.min_overlap_chars;size--)
    if (a.slice(-size).join("") === b.slice(0,size).join("")) return existing+b.slice(size).join("");
  let separator="";
  if (existing && incoming && !/\s$/.test(existing) && !/^\s/.test(incoming)) {
    if (existing.endsWith("|") && incoming.startsWith("|")) separator="\n";
    else if (/[。！？]$/.test(existing) || existing.endsWith("```")) separator="\n\n";
  }
  return existing+separator+incoming;
}
export function continuationMessages(messages: ModelMessage[], answer: string, remaining: number): ModelMessage[] {
  return [...messages,{role:"assistant",content:answer},{role:"user",content:JSON.stringify({
    CONTINUE_REQUEST:policy.continuation_prompt,
    last_automatic_part:remaining === 0,
    already_written_chars:Array.from(answer).length,
  })}];
}
export function incompleteWarning(diagnostics: {automatic_continuation?: Partial<ContinuationInfo>} = {}) {
  const reason=diagnostics.automatic_continuation?.stop_reason || "";
  const prefixes: Record<string,string> = {
    error:"自动补写未成功，已保留前面生成的内容。",
    no_progress:"自动补写重复了已有内容，已停止并保留原文。",
    round_limit:"已达到本轮自动补写次数上限，已合并收到的内容。",
    size_limit:"回复已较长，已停止自动补写并保留原文。",
  };
  return (prefixes[reason] || "模型因输出上限停止。")+"当前回复仍不完整，可点击“续写剩余内容”或调整单次输出上限。";
}

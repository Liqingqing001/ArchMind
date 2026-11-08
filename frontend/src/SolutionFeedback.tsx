import { useState } from "react";
import { api } from "./api";
import { casePolicy, CASES_CHANGED_EVENT } from "./solutionCases";
import type {
  SolutionFeedback as Feedback,
  SolutionRating,
} from "./solutionCases";
export function SolutionFeedback({
  conversationId,
  messageId,
  feedback,
  onSaved,
}: {
  conversationId: string;
  messageId: string;
  feedback?: Feedback;
  onSaved: (value: Feedback) => void;
}) {
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const rate = async (rating: SolutionRating) => {
    setSaving(true);
    setError("");
    try {
      const result = await api<Feedback>(
        `/conversations/${conversationId}/messages/${messageId}/feedback`,
        { method: "POST", body: JSON.stringify({ rating }) },
      );
      onSaved(result);
      window.dispatchEvent(new Event(CASES_CHANGED_EVENT));
    } catch (error) {
      setError(error instanceof Error ? error.message : "评价未保存，请重试");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="solution-feedback" aria-label="方案评价">
      <p>你觉得这个方案怎么样？</p>
      <div>
        {(Object.entries(casePolicy.ratings) as [SolutionRating, string][]).map(
          ([rating, label]) => (
            <button
              key={rating}
              aria-pressed={feedback?.rating === rating}
              disabled={saving}
              onClick={() => rate(rating)}
            >
              {label}
            </button>
          ),
        )}
      </div>
      <small role="status">
        {saving
          ? "正在保存评价…"
          : feedback
            ? feedback.saved
              ? `已沉淀到「${feedback.scene_name}」：知识库 → 按场景查看。用户认可不等于实测或价格已核验。`
              : "收到，这份方案不进入场景知识库。你可以继续说说哪里不合适。"
            : "选择“挺好的”或“还可以”，会保存方案、需求摘要及引用，供按场景回看与后续选型参考。"}
      </small>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

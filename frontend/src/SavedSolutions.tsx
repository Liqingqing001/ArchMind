import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "./api";
import { casePolicy, CASES_CHANGED_EVENT, linkEvidence } from "./solutionCases";
import type { SolutionCase } from "./solutionCases";
import { isDemo } from "./demo/mode";
export function SavedSolutions() {
  const [cases, setCases] = useState<SolutionCase[]>([]),
    [scene, setScene] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const update = () => setVersion((v) => v + 1);
    window.addEventListener(CASES_CHANGED_EVENT, update);
    return () => window.removeEventListener(CASES_CHANGED_EVENT, update);
  }, []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    api<SolutionCase[]>("/solution-cases")
      .then((rows) => {
        if (live) {
          setCases(rows);
          setError("");
        }
      })
      .catch((error) => {
        if (live) setError(error.message || "无法读取已沉淀方案");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [version]);
  const scenes = [...casePolicy.scenes, casePolicy.fallback].filter((s) =>
    cases.some((row) => row.scene_id === s.id),
  );
  return (
    <section className="saved-solutions panel" aria-label="已沉淀方案">
      <h2>已沉淀方案 · 按场景</h2>
      <p>
        {isDemo
          ? "仅保存在当前浏览器，不会发布到公共网站。"
          : "保存在当前工作空间。"}
        用户评价为“挺好的”或“还可以”的方案会出现在这里，供后续相同场景选型参考。
      </p>
      {error ? (
        <p role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => setVersion((v) => v + 1)}
          >
            重试
          </button>
        </p>
      ) : loading ? (
        <p role="status">正在读取方案…</p>
      ) : (
        <>
          <div className="saved-scene-tabs" aria-label="沉淀方案场景">
            <button aria-pressed={!scene} onClick={() => setScene("")}>
              全部（{cases.length}）
            </button>
            {scenes.map((s) => (
              <button
                key={s.id}
                aria-pressed={scene === s.id}
                onClick={() => setScene(s.id)}
              >
                {s.name}（{cases.filter((row) => row.scene_id === s.id).length}
                ）
              </button>
            ))}
          </div>
          {!cases.length && (
            <p className="muted">
              还没有已沉淀方案。完成一次方案对话并评价后，会自动按小说写作、视频、建站等场景归档。
            </p>
          )}
          {cases
            .filter((row) => !scene || row.scene_id === scene)
            .map((row) => (
              <details className="saved-solution" key={row.id}>
                <summary>
                  <b>{row.title}</b>
                  <span>
                    {row.scene_name} · {casePolicy.ratings[row.rating]}
                    {row.is_demo ? " · 交互演示" : ""}
                  </span>
                </summary>
                <p className="saved-case-status">
                  用户认可 · 未经实测 · 保存于{" "}
                  {new Date(row.updated_at).toLocaleString()}
                  。以下为当时方案与引用，旧价格及可用性需重新核验。
                </p>
                <dl>
                  {Object.entries(row.brief || {}).map(
                    ([key, field]: [string, any]) => (
                      <div key={key}>
                        <dt>
                          {{
                            goal: "目标",
                            budget: "预算",
                            delivery: "使用方式",
                            experience: "操作经验",
                            scale: "产出规模",
                            requirements: "关键要求",
                          }[key] || key}
                        </dt>
                        <dd>{field.value}</dd>
                      </div>
                    ),
                  )}
                </dl>
                <div className="answer-markdown">
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    skipHtml
                    components={{
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      ),
                      img: ({ alt }) => <span>{alt || "图片"}</span>,
                      table: ({ children }) => (
                        <div className="answer-table">
                          <table>{children}</table>
                        </div>
                      ),
                    }}
                  >
                    {linkEvidence(row.answer, row.references)}
                  </Markdown>
                </div>
                {!!row.references.length && (
                  <details>
                    <summary>原始依据（{row.references.length}）</summary>
                    {row.references.map((ref, i) => (
                      <article key={i}>
                        <a href={ref.url} target="_blank" rel="noreferrer">
                          [{ref.citation_id}] {ref.title} ↗
                        </a>
                        <p>{ref.excerpt}</p>
                        {ref.version && (
                          <small>
                            事实 v{ref.version} · 快照 {ref.snapshot_id}
                          </small>
                        )}
                        {ref.searched_at && (
                          <small>检索时间：{ref.searched_at}</small>
                        )}
                      </article>
                    ))}
                  </details>
                )}
                <small>
                  来源对话：{row.conversation_id} · 模型：{row.model} ·
                  检索记录：{row.trace_id || "无"}
                </small>
              </details>
            ))}
        </>
      )}
    </section>
  );
}

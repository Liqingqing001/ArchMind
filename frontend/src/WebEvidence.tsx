import { Globe2 } from "lucide-react";
import type { WebSearch, WebResult } from "./webSearch";
export function WebEvidence({
  web,
  citations = [],
}: {
  web?: WebSearch;
  citations?: WebResult[];
}) {
  if (!web || web.status === "disabled" || !Array.isArray(web.results))
    return null;
  return (
    <details className="web-evidence">
      <summary>
        <Globe2 size={14} />
        本轮联网依据 ·{" "}
        {citations.length
          ? `正文引用 ${citations.length} 条 · `
          : web.results.length
            ? "正文尚未引用 · "
            : ""}{" "}
        {
          {
            ok: "已取得网页",
            partial: "部分成功",
            error: "检索失败",
            empty: "没有可用结果",
            disabled: "未启用",
          }[web.status]
        }
      </summary>
      <p>
        检索时间：
        {web.searched_at
          ? new Date(web.searched_at).toLocaleString()
          : "未取得"}{" "}
        · {web.provider}
      </p>
      <p>关键词：{web.queries.join("；")}</p>
      {web.results.map((w) => (
        <article key={w.citation_id}>
          <a href={w.url} target="_blank" rel="noreferrer">
            [{w.citation_id}] {w.title} ↗
          </a>
          <small>
            {w.source_type === "official" ? "官网域名" : "普通网页，需核验"} ·{" "}
            {w.content_kind === "page_excerpt" ? "页面摘录" : "搜索摘要"}
            {citations.some((c) => c.citation_id === w.citation_id)
              ? " · 本文引用"
              : ""}
          </small>
          <p>{w.excerpt}</p>
          {w.published_at && <small>来源提供的日期：{w.published_at}</small>}
        </article>
      ))}
      <p>
        本轮网页依据未经知识库审核，未自动入库；检索时间不等于网页更新时间。
      </p>
    </details>
  );
}

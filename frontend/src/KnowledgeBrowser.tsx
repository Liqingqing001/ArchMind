import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Layers3,
  Search,
} from "lucide-react";
import type { KnowledgeNavigation, KnowledgeNode } from "./knowledgeNavigation";
import { kinds } from "./api";
import "./knowledgeBrowser.css";
type Row = Record<string, any>;
export function KnowledgeBrowser({
  entities,
  navigation,
  kind,
  onClearKind,
  onOpen,
}: {
  entities: Row[];
  navigation: KnowledgeNavigation;
  kind: string;
  onClearKind: () => void;
  onOpen: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const panel = useRef<HTMLElement>(null);
  const nodes = navigation.nodes,
    current = nodes.find((n) => n.id === selected);
  const byId = useMemo(
    () => new Map(entities.map((e) => [e.id, e])),
    [entities],
  );
  const members = (node: KnowledgeNode) =>
    node.entity_ids
      .map((id) => byId.get(id))
      .filter((e): e is Row => !!e && (!kind || e.kind === kind));
  const count = (node: KnowledgeNode) => members(node).length;
  const children = (id: string | null) =>
    nodes
      .filter((n) => n.parent_id === id)
      .sort(
        (a, b) =>
          a.order - b.order || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
      );
  const scope = current
    ? members(current)
    : entities.filter((e) => !kind || e.kind === kind);
  const needle = query.trim().toLowerCase();
  const matches = scope.filter((e) =>
    `${e.name} ${e.description} ${e.vendor_name || ""}`
      .toLowerCase()
      .includes(needle),
  );
  const childNodes = children(current?.id || null).filter(
    (n) => !kind || count(n) > 0,
  );
  const select = (node: KnowledgeNode | null) => {
    setSelected(node?.id || null);
    setQuery("");
    if (node)
      setExpanded((before) => {
        const next = new Set(before);
        for (const parent of nodes)
          if (
            parent.path.length <= node.path.length &&
            parent.path.every((part, i) => part === node.path[i])
          )
            next.add(parent.id);
        return next;
      });
    requestAnimationFrame(() =>
      panel.current?.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  };
  const toggle = (id: string) =>
    setExpanded((before) => {
      const next = new Set(before);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const tree = (parent: string | null = null, depth = 0) => (
    <ul>
      {children(parent)
        .filter((n) => !kind || count(n) > 0)
        .map((node) => {
          const hasChildren = children(node.id).length > 0,
            open = expanded.has(node.id);
          return (
            <li key={node.id}>
              <div
                className={`knowledge-tree-row ${selected === node.id ? "selected" : ""}`}
                style={{ paddingLeft: depth * 12 }}
              >
                {hasChildren ? (
                  <button
                    className="tree-toggle"
                    aria-label={`${open ? "折叠" : "展开"}${node.path.join(" / ")}`}
                    aria-expanded={open}
                    onClick={() => toggle(node.id)}
                  >
                    {open ? (
                      <ChevronDown size={13} />
                    ) : (
                      <ChevronRight size={13} />
                    )}
                  </button>
                ) : (
                  <span className="tree-leaf-dot" />
                )}
                <button
                  className="tree-select"
                  aria-current={selected === node.id ? "page" : undefined}
                  onClick={() => select(node)}
                >
                  <span>{node.name}</span>
                  <small>{count(node)}</small>
                </button>
              </div>
              {hasChildren && open && tree(node.id, depth + 1)}
            </li>
          );
        })}
    </ul>
  );
  const cards = (rows: Row[]) => (
    <div className="entity-grid">
      {rows.map((e) => (
        <button key={e.id} className="entity-card" onClick={() => onOpen(e.id)}>
          <div>
            <span className={`entity-letter ${e.kind}`}>
              {e.name.slice(0, 1)}
            </span>
            <span className="entity-type">{kinds[e.kind]}</span>
          </div>
          <h3>
            {e.name}
            {e.is_demo && <span className="demo-tag">演示</span>}
            {e.model_resources && (
              <span className="open-model-tag">开放权重</span>
            )}
          </h3>
          <p>{e.description || "尚未填写描述"}</p>
          <footer>
            <span>
              {e.fact_count || 0} 条已发布事实
              {e.model_resources ? " · 资料与下载" : ""}
            </span>
            <ArrowUpRight size={15} />
          </footer>
        </button>
      ))}
    </div>
  );
  const grouped = new Map<string, Row[]>();
  if (needle)
    for (const e of matches) {
      const vendor = e.vendor_name || "其他条目";
      grouped.set(vendor, [...(grouped.get(vendor) || []), e]);
    }
  return (
    <div className="hierarchy-browser">
      <aside className="panel knowledge-tree-panel">
        <div className="knowledge-tree-heading">
          <b>
            <FolderTree size={16} />
            知识目录
          </b>
          <button
            onClick={() => {
              setExpanded(new Set());
              setSelected(null);
              setQuery("");
            }}
          >
            全部折叠
          </button>
        </div>
        <nav aria-label="知识分类树">
          <button
            className={`knowledge-all ${!current ? "selected" : ""}`}
            onClick={() => {
              onClearKind();
              select(null);
            }}
          >
            <Layers3 size={15} />
            <span>全部知识</span>
            <small>{entities.length}</small>
          </button>
          {tree()}
        </nav>
        <p className="knowledge-tree-note">
          能力 → 类型 → 厂家 → 模型
          <br />
          多能力模型共用同一条资料。
        </p>
      </aside>
      <section className="panel knowledge-browser-panel" ref={panel}>
        <nav className="knowledge-breadcrumb" aria-label="知识路径">
          <button
            onClick={() => {
              onClearKind();
              select(null);
            }}
          >
            全部知识
          </button>
          {current?.path.map((part, i) => {
            const node = nodes.find(
              (n) =>
                n.path.length === i + 1 &&
                n.path.every((v, j) => v === current.path[j]),
            );
            return (
              <span key={i}>
                <ChevronRight size={12} />
                <button
                  aria-current={
                    i === current.path.length - 1 ? "page" : undefined
                  }
                  onClick={() => node && select(node)}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </nav>
        <header className="knowledge-branch-heading">
          <div>
            <h2>{current?.name || "按能力探索知识"}</h2>
            <p>
              {current?.description ||
                (current?.path.length === 2 && childNodes.length
                  ? "同一厂家集中展示，选择厂家后查看具体模型。"
                  : current?.path.length === 3
                    ? "点击模型查看事实、版本、来源与下载资料。"
                    : "先选生成或理解，再按类型和厂家逐层浏览。")}
            </p>
          </div>
          {current && (
            <button
              className="button small"
              onClick={() =>
                select(nodes.find((n) => n.id === current.parent_id) || null)
              }
            >
              <ArrowLeft size={14} />
              返回上一级
            </button>
          )}
        </header>
        <div className="filter-bar">
          <label className="search-input">
            <Search size={16} />
            <input
              aria-label="搜索当前知识分支"
              placeholder="搜索名称、描述或厂家…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {kind && (
            <button className="text-button" onClick={onClearKind}>
              当前：{kinds[kind]} · 查看全部
            </button>
          )}
          <span className="count">
            {needle ? matches.length : scope.length} 个条目
          </span>
        </div>
        {needle ? (
          matches.length ? (
            <div className="knowledge-search-groups">
              {[...grouped].map(([vendor, rows]) => (
                <section key={vendor}>
                  <h3>
                    <Building2 size={15} />
                    {vendor}
                    <small>{rows.length} 个</small>
                  </h3>
                  {cards(rows)}
                </section>
              ))}
            </div>
          ) : (
            <div className="knowledge-empty">
              <Search size={25} />
              <h3>未找到匹配条目</h3>
              <p>试试模型名或厂家名，或返回上一级扩大范围。</p>
            </div>
          )
        ) : childNodes.length ? (
          <div className="knowledge-group-grid">
            {childNodes.map((node) => {
              const entries = members(node),
                hasChildren = children(node.id).length > 0;
              return (
                <button
                  key={node.id}
                  className={`knowledge-group-card ${!entries.length ? "is-empty" : ""}`}
                  onClick={() => select(node)}
                >
                  {node.path.length === 3 ? (
                    <Building2 size={23} />
                  ) : (
                    <FolderTree size={23} />
                  )}
                  <span className="knowledge-group-count">
                    {entries.length} 个条目
                  </span>
                  <h3>{node.name}</h3>
                  <p>
                    {node.description ||
                      (entries.length
                        ? node.path.length === 2
                          ? "按厂家继续浏览"
                          : entries
                              .slice(0, 3)
                              .map((e) => e.name)
                              .join(" · ")
                        : "暂无已核验资料")}
                  </p>
                  <footer>
                    {hasChildren
                      ? `${children(node.id).length} 个分组 · 继续展开`
                      : "查看具体资料"}
                    <ChevronRight size={15} />
                  </footer>
                </button>
              );
            })}
          </div>
        ) : scope.length ? (
          cards(scope)
        ) : (
          <div className="knowledge-empty">
            <BookOpen size={26} />
            <h3>这个分支暂无已核验条目</h3>
            <p>保留能力层级，后续登记可靠资料后会显示在这里。</p>
          </div>
        )}
      </section>
    </div>
  );
}

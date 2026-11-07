import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowRight,
  ArrowUp,
  MessageSquare,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderTree,
  GitBranch,
  Globe2,
  History,
  Layers3,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { api, post, setToken, kinds, states, time } from "./api";
import "./styles.css";
import "./workspace.css";
import "./chat.css";
import { fieldTemplates } from "./knowledge";
import { AgentWorkspace } from "./AgentWorkspace";
import { ModelDownloads } from "./ModelDownloads";

type Row = Record<string, any>;
type Page =
  | "chat"
  | "overview"
  | "entities"
  | "sources"
  | "runs"
  | "reviews"
  | "search"
  | "settings";
const nav = [
  { id: "chat", label: "方案对话", icon: MessageSquare },
  { id: "overview", label: "知识总览", icon: Layers3 },
  { id: "entities", label: "知识浏览", icon: BookOpen },
  { id: "sources", label: "数据来源", icon: Globe2 },
  { id: "runs", label: "更新任务", icon: Activity },
  { id: "reviews", label: "版本与审核", icon: FileCheck2 },
  { id: "search", label: "检索调试", icon: Terminal },
] as const;
const title: Record<Page, string> = {
  chat: "方案对话",
  overview: "知识总览",
  entities: "知识浏览",
  sources: "数据来源",
  runs: "更新任务",
  reviews: "版本与审核",
  search: "检索调试",
  settings: "系统设置",
};
const subtitle: Record<Page, string> = {
  chat: "从你的需求出发，参考可信知识，生成可执行的解决方案。",
  overview: "让每一份技术知识，都有据可循。",
  entities: "从分类到实体，构建相互连接的 AI 技术知识。",
  sources: "连接可靠的信息源，让知识保持更新。",
  runs: "观察每一次巡检，追踪变化与失败原因。",
  reviews: "让变更经过验证，让历史始终可追溯。",
  search: "查看命中的事实、证据与版本，验证检索质量。",
  settings: "查看运行边界与后续接入状态。",
};

function Badge({
  value,
  children,
}: {
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={`badge ${value || ""}`}>
      <i />
      {children || states[value || ""] || value}
    </span>
  );
}
function Empty({
  text = "暂无记录",
  detail = "创建第一条数据，开始构建你的知识库。",
}: {
  text?: string;
  detail?: string;
}) {
  return (
    <div className="empty">
      <Database size={30} />
      <h3>{text}</h3>
      <p>{detail}</p>
    </div>
  );
}
function App() {
  const [page, setPage] = useState<Page>("chat");
  const [showTop, setShowTop] = useState(false);
  const toTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 360);
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.key === "ArrowUp" && !(event.target instanceof HTMLElement && (event.target.matches("input, textarea, select") || event.target.isContentEditable))) {
        event.preventDefault(); toTop();
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("keydown", onKey); };
  }, []);
  const [overview, setOverview] = useState<Row>({});
  const [entities, setEntities] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Row[]>([]);
  const [sources, setSources] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Row[]>([]);
  const [changes, setChanges] = useState<Row[]>([]);
  const [config, setConfig] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [login, setLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const [detailTab, setDetailTab] = useState("facts");
  const [snapshot, setSnapshot] = useState<Row | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [form, setForm] = useState<Row>({});
  const [snapshots, setSnapshots] = useState<Row[]>([]);
  const [reviewTab, setReviewTab] = useState("pending");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Row | null>(null);
  const [traceId, setTraceId] = useState("");
  const [traces, setTraces] = useState<Row[]>([]);
  const [traceCaller, setTraceCaller] = useState("");
  const [searchMode, setSearchMode] = useState("console");
  const [includeDemo, setIncludeDemo] = useState(false);

  const load = useCallback(async () => {
    const values = await Promise.all([
      api("/overview"),
      api("/entities"),
      api("/categories"),
      api("/sources"),
      api("/runs"),
      api("/changes"),
      api("/config"),
      api("/traces"),
    ]);
    setOverview(values[0]);
    setEntities(values[1]);
    setCategories(values[2]);
    setSources(values[3]);
    setRuns(values[4]);
    setChanges(values[5]);
    setConfig(values[6]);
    setTraces(values[7]);
  }, []);
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const handler = () => setLogin(true);
    window.addEventListener("unauthorized", handler);
    return () => window.removeEventListener("unauthorized", handler);
  }, [load]);
  useEffect(() => {
    if (notice) {
      const timeout = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(timeout);
    }
  }, [notice]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        setModal(null);
        setSnapshot(null);
        setDetail(null);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [busy]);
  const action = async (fn: () => Promise<unknown>, message = "") => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const openEntity = async (id: string) => {
    try {
      setDetail(await api(`/entities/${id}`));
      setDetailTab("facts");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const openSnapshot = async (id: string) => {
    try {
      setSnapshot(await api(`/snapshots/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const name = (id: string) =>
    entities.find((e) => e.id === id)?.name || "未知实体";
  const sourceName = (id: string) =>
    sources.find((s) => s.id === id)?.name || "未知来源";
  const go = (p: Page) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "instant" });
    setFilter("");
    setCategory("");
    setKind("");
    setOpenOnly(false);
  };
  const openForm = async (type: string, initial: Row = {}) => {
    setForm(
      type === "entity"
        ? { kind: "model", category_ids: [], ...initial }
        : type === "source"
          ? { source_type: "web", interval_hours: 24, ...initial }
          : initial,
    );
    if (type === "change") {
      try {
        setSnapshots(await api("/snapshots"));
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    setModal(type);
  };
  const saveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modal === "login") return;
    const ok = await action(
      async () => {
        if (modal === "entity") {
          const body = {
            name: form.name,
            kind: form.kind,
            description: form.description || "",
            website: form.website || "",
            category_ids: form.category_ids || [],
          };
          if (form.id)
            await api(`/entities/${form.id}`, {
              method: "PUT",
              body: JSON.stringify(body),
            });
          else await post("/entities", body);
        } else if (modal === "category")
          await post("/categories", {
            name: form.name,
            parent_id: form.parent_id || null,
          });
        else if (modal === "source") await post("/sources", form);
        else if (modal === "change")
          await post("/changes", {
            entity_id: form.entity_id,
            snapshot_id: form.snapshot_id,
            key: form.key,
            value: form.value,
            evidence: form.evidence,
          });
        else if (modal === "relation") await post("/relations", form);
        else if (modal === "review")
          await post(`/changes/${form.id}/review`, {
            decision: form.decision,
            note: form.note || "",
          });
      },
      modal === "review" ? "审核结果已保存" : "保存成功",
    );
    if (ok) {
      setModal(null);
      if (detail) setDetail(await api(`/entities/${detail.id}`));
    }
  };
  const collect = (s: Row) =>
    action(async () => {
      const run = await post(`/sources/${s.id}/collect`);
      if (run.status === "failed") throw new Error(run.message);
      setNotice(run.message);
    });
  const descendants = (id: string): string[] => [
    id,
    ...categories
      .filter((c) => c.parent_id === id)
      .flatMap((c) => descendants(c.id)),
  ];
  const openModels = entities.filter(e => e.model_resources);
  const scopedEntities = openOnly ? openModels : entities;
  const modelCategory = categories.find(c => c.name === "AI 模型" && !c.parent_id);
  const modelBranches = categories.filter(c => c.parent_id === modelCategory?.id);
  const browseOpenModels = (categoryId = "") => {
    go("entities"); setOpenOnly(true); setKind("model"); setCategory(categoryId);
  };
  const filtered = scopedEntities.filter(
    (e) =>
      (!filter ||
        `${e.name} ${e.description}`
          .toLowerCase()
          .includes(filter.toLowerCase())) &&
      (!kind || e.kind === kind) &&
      (!category ||
        e.category_ids.some((id: string) =>
          descendants(category).includes(id),
        )),
  );
  const categoryTree = (
    parent: string | null = null,
    depth = 0,
  ): React.ReactNode =>
    categories
      .filter((c) => c.parent_id === parent && (!openOnly || openModels.some(e => e.category_ids.some((id: string) => descendants(c.id).includes(id)))))
      .map((c) => (
        <React.Fragment key={c.id}>
          <button
            className={`tree-item ${category === c.id ? "selected" : ""}`}
            style={{ paddingLeft: 14 + depth * 16 }}
            onClick={() => setCategory(c.id)}
          >
            {categories.some((x) => x.parent_id === c.id) ? (
              <ChevronDown size={13} />
            ) : (
              <span className="tree-line" />
            )}
            <span>{c.name}</span>
            <small>
              {
                scopedEntities.filter((e) =>
                  e.category_ids.some((id: string) =>
                    descendants(c.id).includes(id),
                  ),
                ).length
              }
            </small>
          </button>
          {categoryTree(c.id, depth + 1)}
        </React.Fragment>
      ));
  const submitSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await action(async () => {
      const result =
        searchMode === "agent"
          ? await post("/knowledge/retrieve", {
              query,
              include_demo: includeDemo,
              request_id: "console-debug",
            })
          : await api(`/search?q=${encodeURIComponent(query)}`);
      setResults(result);
      setTraceId(result.trace_id);
    });
  };

  return (
    <div className={`app-shell ${page === "chat" ? "chat-shell" : ""}`}>
      <aside className="sidebar">
        <a
          className="brand"
          aria-label="ArchMind 方案对话"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("chat");
          }}
        >
          <span className="brand-icon">
            <span aria-hidden="true">♛</span>
          </span>
          <span>
            ArchMind<span className="brand-en">THE KNOWLEDGE ATELIER</span>
          </span>
        </a>
        <nav className="primary-nav" aria-label="主导航">
          {([{ id: "chat", label: "方案对话", icon: MessageSquare }, { id: "entities", label: "知识库", icon: BookOpen }, { id: "overview", label: "知识管理", icon: Settings2 }] as const).map(({ id, label, icon: Icon }) => (
            <button key={id} className={(page === id || (id === "overview" && !["chat", "entities"].includes(page))) ? "active" : ""} onClick={() => go(id)}><Icon size={18} />{label}</button>
          ))}
        </nav>
        <div id="conversation-history-slot" hidden={page !== "chat"} />
      </aside>
      <main className="main">
        {page !== "chat" && <header className="topbar">
          <div>
            <span>工作空间</span>
            <ChevronRight size={14} />
            <b>{title[page]}</b>
          </div>
          <div>
            <span className="status-pill">
              <span className="live-dot" />
              知识管理控制台
            </span>
            <button
              className="icon-button"
              title="刷新全部数据"
              disabled={busy}
              onClick={() => action(load, "数据已刷新")}
            >
              <RefreshCw size={16} className={busy ? "spin" : ""} />
            </button>
            <span className="avatar">A</span>
          </div>
        </header>}
        <div className={`content ${page === "chat" ? "chat-content" : ""}`}>
          {page !== "chat" && <div className="page-heading">
            <div>
              <div className="eyebrow">
                AI KNOWLEDGE CONSOLE{" "}
                <span>
                  /{" "}
                  {String(nav.findIndex((n) => n.id === page) + 1).padStart(
                    2,
                    "0",
                  )}
                </span>
              </div>
              <h1>{title[page]} <span className="heading-flourish" aria-hidden="true">❦</span></h1>
              <p>{subtitle[page]}</p>
            </div>
            <div className="heading-actions">
              {page === "overview" && (
                <button className="button" onClick={() => go("runs")}>
                  <Activity size={16} />
                  查看更新任务
                </button>
              )}
              {(page === "overview" || page === "entities") && (
                <button
                  className="button primary"
                  onClick={() => openForm("entity")}
                >
                  <Plus size={17} />
                  新建实体
                </button>
              )}
              {page === "sources" && (
                <button
                  className="button primary"
                  onClick={() => openForm("source")}
                >
                  <Plus size={17} />
                  注册数据源
                </button>
              )}
              {page === "reviews" && (
                <button
                  className="button primary"
                  onClick={() => openForm("change")}
                >
                  <Plus size={17} />
                  提交变更
                </button>
              )}
            </div>
          </div>}
          {!["chat", "entities"].includes(page) && <nav className="management-nav" aria-label="知识管理导航">
            {[...nav.filter(n => !["chat", "entities"].includes(n.id)), { id: "settings" as const, label: "系统设置", icon: Settings2 }].map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? "active" : ""} onClick={() => go(id)}><Icon size={15} />{label}{id === "reviews" && overview.pending > 0 && <b>{overview.pending}</b>}</button>)}
          </nav>}
          {error && (
            <div className="alert error" role="alert">
              <span>{error}</span>
              <button aria-label="关闭错误" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}
          <AgentWorkspace visible={page === "chat"} openSnapshot={openSnapshot} />
          {loading && page !== "chat" ? (
            <div className="empty">
              <Loader2 className="spin" />
              <p>正在读取知识库…</p>
            </div>
          ) : (
            <>
              {overview.demo_entities > 0 && page !== "chat" && (
                <div className="demo-notice">
                  <ShieldCheck size={16} />
                  <span>
                    当前包含 {overview.demo_entities}{" "}
                    个演示条目，仅用于体验管理流程，产品参数与价格尚未实时核验。
                  </span>
                  <button onClick={() => go("sources")}>
                    管理真实来源 <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {page === "overview" && (
                <>
                  <section className="palace-welcome">
                    <div><span className="eyebrow">A GARDEN OF IDEAS</span>
                      <h2>让知识，在此盛放。</h2>
                      <p>收藏灵感，梳理脉络，让每一份知识都有可靠的出处。</p>
                      <button className="text-button" onClick={() => go("entities")}>探索我的知识馆 <ArrowRight size={15} /></button>
                    </div>
                    <div className="palace-seal" aria-hidden="true"><span>✧</span><b>AM</b><small>EST. 2026</small><span>❦</span></div>
                  </section>
                  <div className="metrics">
                    {[
                      {
                        label: "知识实体",
                        value: overview.entities,
                        icon: Boxes,
                        sub: `${overview.categories || 0} 个分类 · 多类型关联`,
                        color: "blue",
                      },
                      {
                        label: "已发布事实",
                        value: overview.facts,
                        icon: Database,
                        sub: "每条事实都有来源证据",
                        color: "green",
                      },
                      {
                        label: "注册数据源",
                        value: overview.sources,
                        icon: Globe2,
                        sub: `${overview.snapshots || 0} 份原文快照已保存`,
                        color: "violet",
                      },
                      {
                        label: "待审核变更",
                        value: overview.pending,
                        icon: FileCheck2,
                        sub: overview.pending
                          ? "审核后发布至知识库"
                          : "当前没有待处理变更",
                        color: "amber",
                      },
                    ].map((m) => (
                      <div className="metric" key={m.label}>
                        <div>
                          <span>{m.label}</span>
                          <span className={`metric-icon ${m.color}`}>
                            <m.icon size={18} />
                          </span>
                        </div>
                        <strong>
                          {m.value || 0}
                          <small>条</small>
                        </strong>
                        <p>
                          <span className={`mini-dot ${m.color}`} />
                          {m.sub}
                        </p>
                      </div>
                    ))}
                  </div>
                  <section className="panel open-model-overview">
                    <div><h2>开源与开放权重模型 <span>{openModels.length} 个</span></h2><p>已纳入知识库，按分类浏览模型资料、官方权重与许可证。</p></div>
                    <button className="button" onClick={() => browseOpenModels()}>浏览模型知识 <ArrowRight size={16} /></button>
                    <div className="model-category-links">{modelBranches.map(c => {
                      const count = openModels.filter(e => e.category_ids.some((id: string) => descendants(c.id).includes(id))).length;
                      return count > 0 && <button key={c.id} onClick={() => browseOpenModels(c.id)}>{c.name}<b>{count}</b></button>;
                    })}</div>
                  </section>
                  <div className="overview-grid">
                    <section className="panel ecology">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            知识版图 <span>KNOWLEDGE MAP</span>
                          </h2>
                          <p>从模型到基础设施，构建你的技术视野</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => go("entities")}
                        >
                          浏览全部 <ArrowUpRight size={15} />
                        </button>
                      </div>
                      <div className="kind-grid">
                        {Object.entries(kinds)
                          .filter(([k]) =>
                            [
                              "model",
                              "product",
                              "framework",
                              "cloud",
                              "project",
                              "vendor",
                            ].includes(k),
                          )
                          .map(([k, label], i) => {
                            const icons = [
                              Sparkles,
                              Boxes,
                              GitBranch,
                              Globe2,
                              Layers3,
                              BuildingIcon,
                            ];
                            const Icon = icons[i];
                            return (
                              <button
                                className="kind-card"
                                key={k}
                                onClick={() => {
                                  go("entities");
                                  setKind(k);
                                }}
                              >
                                <span className={`kind-symbol c${i}`}>
                                  <Icon size={21} />
                                </span>
                                <span>
                                  <b>{label}</b>
                                  <small>
                                    {overview.kinds?.find(
                                      (r: Row) => r.kind === k,
                                    )?.count || 0}{" "}
                                    个实体
                                  </small>
                                </span>
                                <ChevronRight size={15} />
                              </button>
                            );
                          })}
                      </div>
                      <div className="map-footer">
                        <GitBranch size={15} />
                        分类组织知识，关系连接实体，证据建立信任。
                      </div>
                    </section>
                    <section className="panel review-card">
                      <div className="panel-heading">
                        <h2>需要你的关注</h2>
                        <span className="amber-circle">
                          {overview.pending || 0}
                        </span>
                      </div>
                      <p>把可靠的变化，变成可信的知识。</p>
                      {changes
                        .filter((c) => c.status === "pending")
                        .slice(0, 2)
                        .map((c) => (
                          <button
                            className="attention-item"
                            key={c.id}
                            onClick={() => go("reviews")}
                          >
                            <span className={`attention-icon ${c.risk}`}>
                              <FileText size={16} />
                            </span>
                            <span>
                              <b>{c.key}更新</b>
                              <small>{name(c.entity_id)}</small>
                            </span>
                            <ChevronRight size={14} />
                          </button>
                        ))}
                      {!overview.pending && (
                        <div className="all-clear">
                          <ShieldCheck size={28} />
                          <span>所有变更均已处理</span>
                        </div>
                      )}
                      <button
                        className="button full"
                        onClick={() => go("reviews")}
                      >
                        进入审核工作台 <ArrowRight size={15} />
                      </button>
                    </section>
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          最近更新 <span>RECENT ACTIVITY</span>
                        </h2>
                        <p>每一次巡检，都留下可追溯的记录</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => go("runs")}
                      >
                        全部记录 <ArrowRight size={15} />
                      </button>
                    </div>
                    {runs.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>数据来源</th>
                              <th>关联实体</th>
                              <th>巡检结果</th>
                              <th>检查时间</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {runs.slice(0, 5).map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <span className="table-source">
                                    <span className="source-icon">
                                      <Globe2 size={17} />
                                    </span>
                                    {sourceName(r.source_id)}
                                  </span>
                                </td>
                                <td>
                                  {name(
                                    sources.find((s) => s.id === r.source_id)
                                      ?.entity_id,
                                  )}
                                </td>
                                <td>
                                  <Badge value={r.status} />
                                </td>
                                <td className="muted">{time(r.started_at)}</td>
                                <td>
                                  <button
                                    className="text-button"
                                    disabled={!r.snapshot_id}
                                    onClick={() => openSnapshot(r.snapshot_id)}
                                  >
                                    查看快照 <ArrowUpRight size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty
                        text="还没有巡检记录"
                        detail="注册真实来源后，可以手动巡检或启动独立调度器。"
                      />
                    )}
                  </section>
                  <div className="workflow-strip">
                    <div>
                      <span className="workflow-icon">
                        <ShieldCheck size={23} />
                      </span>
                      <span>
                        <b>让知识的每一步，都清晰可见</b>
                        <small>
                          从原始资料到已发布事实，完整保留来源与历史。
                        </small>
                      </span>
                    </div>
                    <div className="workflow-steps">
                      <span>来源采集</span>
                      <ChevronRight />
                      <span>变化检测</span>
                      <ChevronRight />
                      <span>证据审核</span>
                      <ChevronRight />
                      <span className="final-step">知识发布</span>
                    </div>
                  </div>
                </>
              )}
              {page === "entities" && (
                <div className="browser-grid">
                  <aside className="panel category-panel">
                    <div className="category-title">
                      <span>
                        <FolderTree size={16} />
                        知识分类
                      </span>
                      <button
                        className="icon-button"
                        aria-label="添加分类"
                        onClick={() => openForm("category")}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <button
                      className={`tree-item ${!category && !openOnly ? "selected" : ""}`}
                      onClick={() => { setCategory(""); setOpenOnly(false); setKind(""); }}
                    >
                      <Layers3 size={14} />
                      <span>全部知识</span>
                      <small>{entities.length}</small>
                    </button>
                    <button className={`tree-item ${openOnly && !category ? "selected" : ""}`} onClick={() => browseOpenModels()}><Download size={14} /><span>开源与开放权重</span><small>{openModels.length}</small></button>
                    {categoryTree()}
                  </aside>
                  <section className="panel entity-panel">
                    <div className="filter-bar">
                      <label className="search-input">
                        <Search size={17} />
                        <input
                          placeholder="搜索名称、描述…"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        />
                      </label>
                      <select aria-label="知识范围" value={openOnly ? "open" : "all"} onChange={e => { setOpenOnly(e.target.value === "open"); setCategory(""); setKind(e.target.value === "open" ? "model" : ""); }}>
                        <option value="all">全部知识</option><option value="open">开源与开放权重</option>
                      </select>
                      <select
                        className="mobile-category"
                        aria-label="知识分类"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        <option value="">全部分类</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="实体类型"
                        value={kind}
                        onChange={(e) => setKind(e.target.value)}
                      >
                        <option value="">全部类型</option>
                        {Object.entries(kinds).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <span className="count">{filtered.length} 个实体</span>
                    </div>
                    {filtered.length ? (
                      <div className="entity-grid">
                        {filtered.map((e) => (
                          <button
                            className="entity-card"
                            key={e.id}
                            onClick={() => openEntity(e.id)}
                          >
                            <div>
                              <span className={`entity-letter ${e.kind}`}>
                                {e.name.slice(0, 1)}
                              </span>
                              <span className="entity-type">
                                {kinds[e.kind]}
                              </span>
                            </div>
                            <h3>
                              {e.name}
                              {e.model_resources && <span className="open-model-tag">开放权重</span>}
                              {e.is_demo && (
                                <span className="demo-tag">演示</span>
                              )}
                            </h3>
                            <p>{e.description || "尚未填写描述"}</p>
                            <footer>
                              <span>{e.fact_count} 条已发布事实{e.model_resources && " · 资料与下载"}</span>
                              <ArrowUpRight size={16} />
                            </footer>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        text="没有符合条件的实体"
                        detail="调整分类与搜索条件，或创建新的知识实体。"
                      />
                    )}
                  </section>
                </div>
              )}
              {page === "sources" && (
                <section className="panel">
                  <div className="filter-bar">
                    <label className="search-input">
                      <Search size={17} />
                      <input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="搜索来源或网址…"
                      />
                    </label>
                    <span className="count">{sources.length} 个来源</span>
                  </div>
                  {sources.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>来源 / 地址</th>
                            <th>实体</th>
                            <th>巡检周期</th>
                            <th>状态</th>
                            <th>最近检查</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sources
                            .filter((s) =>
                              `${s.name} ${s.url}`.includes(filter),
                            )
                            .map((s) => (
                              <tr key={s.id}>
                                <td>
                                  <b>{s.name}</b>
                                  {s.is_demo && (
                                    <span className="demo-tag">演示</span>
                                  )}
                                  <a
                                    className="source-url"
                                    href={s.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {s.url}
                                    <ExternalLink size={11} />
                                  </a>
                                </td>
                                <td>
                                  <button
                                    className="text-button"
                                    onClick={() => openEntity(s.entity_id)}
                                  >
                                    {name(s.entity_id)}
                                  </button>
                                </td>
                                <td>
                                  <select
                                    aria-label={`${s.name}巡检周期`}
                                    value={s.interval_hours}
                                    disabled={busy}
                                    onChange={(e) =>
                                      action(
                                        () =>
                                          api(`/sources/${s.id}`, {
                                            method: "PATCH",
                                            body: JSON.stringify({
                                              interval_hours: Number(
                                                e.target.value,
                                              ),
                                            }),
                                          }),
                                        "巡检周期已更新",
                                      )
                                    }
                                  >
                                    {[1, 6, 24, 168, 720, s.interval_hours]
                                      .filter((v, i, a) => a.indexOf(v) === i)
                                      .map((v) => (
                                        <option key={v} value={v}>
                                          每 {v} 小时
                                        </option>
                                      ))}
                                  </select>
                                </td>
                                <td>
                                  {!s.enabled ? (
                                    <Badge value="paused">已暂停</Badge>
                                  ) : (
                                    <Badge value={s.status} />
                                  )}
                                </td>
                                <td className="muted">
                                  {time(s.last_checked_at)}
                                </td>
                                <td>
                                  <div className="row-actions">
                                    <button
                                      className="icon-button"
                                      disabled={busy || !s.enabled || s.is_demo}
                                      title="立即巡检"
                                      onClick={() => collect(s)}
                                    >
                                      <RefreshCw size={15} />
                                    </button>
                                    <button
                                      className="icon-button"
                                      disabled={busy || s.is_demo}
                                      title={s.enabled ? "暂停" : "启用"}
                                      onClick={() =>
                                        action(
                                          () =>
                                            api(`/sources/${s.id}`, {
                                              method: "PATCH",
                                              body: JSON.stringify({
                                                enabled: !s.enabled,
                                              }),
                                            }),
                                          "来源状态已更新",
                                        )
                                      }
                                    >
                                      {s.enabled ? (
                                        <Pause size={15} />
                                      ) : (
                                        <Play size={15} />
                                      )}
                                    </button>
                                    <button
                                      className="text-button"
                                      onClick={async () => {
                                        try {
                                          setSnapshots(
                                            await api(
                                              `/snapshots?source_id=${s.id}`,
                                            ),
                                          );
                                          setModal("snapshots");
                                        } catch (e) {
                                          setError((e as Error).message);
                                        }
                                      }}
                                    >
                                      快照
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      text="尚未注册数据来源"
                      detail="从官方文档、GitHub 或公开 JSON 数据开始。"
                    />
                  )}
                </section>
              )}
              {page === "runs" && (
                <>
                  <div className="info-banner">
                    <Clock3 size={18} />
                    <div>
                      <b>独立调度 · 每分钟检查到期来源</b>
                      <p>
                        启动 python -m app.worker
                        后执行自动巡检。任务状态显示实际采集结果，失败后可手动重试。
                      </p>
                    </div>
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>巡检记录</h2>
                      <Badge>{runs.length} 条记录</Badge>
                    </div>
                    {runs.length ? (
                      <div className="run-list">
                        {runs.map((r) => (
                          <article className="run" key={r.id}>
                            <span className={`run-dot ${r.status}`}>
                              <Activity size={17} />
                            </span>
                            <div>
                              <h3>
                                {sourceName(r.source_id)}{" "}
                                <Badge value={r.status} />
                              </h3>
                              <p>{r.message || "正在执行网络请求"}</p>
                              <small>
                                {time(r.started_at)} → {time(r.finished_at)}
                              </small>
                            </div>
                            <div className="row-actions">
                              {r.snapshot_id && (
                                <button
                                  className="button small"
                                  onClick={() => openSnapshot(r.snapshot_id)}
                                >
                                  查看快照
                                </button>
                              )}
                              {!sources.find((s) => s.id === r.source_id)
                                ?.is_demo && (
                                <button
                                  disabled={
                                    busy ||
                                    !sources.find((s) => s.id === r.source_id)
                                      ?.enabled
                                  }
                                  className="text-button"
                                  onClick={() =>
                                    collect(
                                      sources.find(
                                        (s) => s.id === r.source_id,
                                      )!,
                                    )
                                  }
                                >
                                  <RefreshCw size={14} />
                                  重新巡检
                                </button>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        text="暂无任务记录"
                        detail="在数据来源中发起首次巡检。"
                      />
                    )}
                  </section>
                </>
              )}
              {page === "reviews" && (
                <section className="panel">
                  <div className="tabs">
                    {["pending", "approved", "rejected"].map((s) => (
                      <button
                        className={reviewTab === s ? "active" : ""}
                        onClick={() => setReviewTab(s)}
                        key={s}
                      >
                        {states[s]}
                        <span>
                          {changes.filter((c) => c.status === s).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="changes-list">
                    {changes.filter((c) => c.status === reviewTab).length ? (
                      changes
                        .filter((c) => c.status === reviewTab)
                        .map((c) => (
                          <article className="change-card" key={c.id}>
                            <div className="change-heading">
                              <div>
                                <button
                                  className="text-button"
                                  onClick={() => openEntity(c.entity_id)}
                                >
                                  {name(c.entity_id)}
                                </button>
                                <ChevronRight size={13} />
                                <h3>{c.key}</h3>
                                {c.risk === "high" && (
                                  <Badge value="high">高风险字段</Badge>
                                )}
                              </div>
                              <span>{time(c.created_at)}</span>
                            </div>
                            <div className="diff">
                              <div>
                                <small>当前值 · v{c.base_version}</small>
                                <p>{c.old_value || "尚未设置"}</p>
                              </div>
                              <ArrowRight size={18} />
                              <div className="new-value">
                                <small>建议新值</small>
                                <p>{c.new_value}</p>
                              </div>
                            </div>
                            <div className="evidence">
                              <Link2 size={14} />
                              <p>“{c.evidence}”</p>
                              <button
                                className="text-button"
                                onClick={() => openSnapshot(c.snapshot_id)}
                              >
                                核对原文 <ArrowUpRight size={13} />
                              </button>
                            </div>
                            <div className="change-footer">
                              <span>
                                {c.origin === "restore"
                                  ? "历史恢复"
                                  : c.origin === "json"
                                    ? "JSON 抽取"
                                    : "人工提交"}{" "}
                                · 基于事实 v{c.base_version}
                                {entities.find((e) => e.id === c.entity_id)
                                  ?.is_demo
                                  ? " · 演示数据"
                                  : ""}
                              </span>
                              {c.status === "pending" ? (
                                <div className="row-actions">
                                  <button
                                    className="button small"
                                    disabled={busy}
                                    onClick={() =>
                                      openForm("review", {
                                        id: c.id,
                                        decision: "rejected",
                                        key: c.key,
                                      })
                                    }
                                  >
                                    驳回
                                  </button>
                                  <button
                                    className="button primary small"
                                    disabled={busy}
                                    onClick={() =>
                                      openForm("review", {
                                        id: c.id,
                                        decision: "approved",
                                        key: c.key,
                                      })
                                    }
                                  >
                                    <Check size={15} />
                                    审核发布
                                  </button>
                                </div>
                              ) : (
                                <span>
                                  {c.reviewer} · {time(c.reviewed_at)}{" "}
                                  {c.review_note && `· ${c.review_note}`}
                                </span>
                              )}
                            </div>
                          </article>
                        ))
                    ) : (
                      <Empty
                        text="当前没有这类变更"
                        detail="巡检后的结构化候选或手工提交会出现在这里。"
                      />
                    )}
                  </div>
                </section>
              )}
              {page === "search" && (
                <>
                  <div className="info-banner">
                    <Terminal size={18} />
                    <div>
                      <b>后台知识库，就是 Agent 的检索知识库</b>
                      <p>
                        两个入口共用同一检索服务，只返回已发布事实。Agent
                        默认排除演示数据；每次调用保留版本、证据与检索记录。当前采用关键词检索。
                      </p>
                    </div>
                  </div>
                  <section className="panel search-panel">
                    <div className="retrieval-options">
                      <label>
                        检索入口
                        <select
                          aria-label="检索入口"
                          value={searchMode}
                          onChange={(e) => setSearchMode(e.target.value)}
                        >
                          <option value="console">后台关键词检索</option>
                          <option value="agent">模拟 Agent 工具调用</option>
                        </select>
                      </label>
                      {searchMode === "agent" && (
                        <label className="demo-checkbox">
                          <input
                            type="checkbox"
                            checked={includeDemo}
                            onChange={(e) => setIncludeDemo(e.target.checked)}
                          />
                          包含演示数据（仅调试）
                        </label>
                      )}
                    </div>
                    <form className="debug-search" onSubmit={submitSearch}>
                      <Search size={22} />
                      <input
                        required
                        maxLength={200}
                        placeholder="输入实体名称、能力或参数，例如：上下文"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <button className="button primary" disabled={busy}>
                        运行检索 <ArrowRight size={16} />
                      </button>
                    </form>
                    <form
                      className="trace-lookup"
                      onSubmit={(e) => {
                        e.preventDefault();
                        action(async () => {
                          const t = await api(
                            `/traces/${encodeURIComponent(traceId)}`,
                          );
                          setResults({
                            trace_id: t.id,
                            method: "keyword",
                            results: t.results,
                            caller: t.caller,
                            request_context: t.request_context,
                          });
                          setQuery(t.query);
                        });
                      }}
                    >
                      <History size={14} />
                      <input
                        aria-label="历史检索编号"
                        value={traceId}
                        onChange={(e) => setTraceId(e.target.value)}
                        placeholder="输入 trace ID 回查历史引用"
                      />
                      <button
                        className="text-button"
                        disabled={busy || !traceId}
                      >
                        回查
                      </button>
                    </form>
                  </section>
                  <section className="panel trace-history">
                    <div className="panel-heading">
                      <div>
                        <h2>Agent 与后台检索记录</h2>
                        <p>查询时的引用保持不变，可回查当时使用的事实版本。</p>
                      </div>
                      <select
                        aria-label="筛选调用方"
                        value={traceCaller}
                        onChange={(e) => setTraceCaller(e.target.value)}
                      >
                        <option value="">全部调用方</option>
                        <option value="agent">Agent</option>
                        <option value="console">后台</option>
                      </select>
                    </div>
                    {traces.filter(
                      (t) => !traceCaller || t.caller === traceCaller,
                    ).length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>查询内容</th>
                              <th>调用方</th>
                              <th>命中事实</th>
                              <th>调用时间</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {traces
                              .filter(
                                (t) => !traceCaller || t.caller === traceCaller,
                              )
                              .map((t) => (
                                <tr key={t.id}>
                                  <td>
                                    <b>{t.query}</b>
                                    <small className="trace-request">
                                      {t.request_context?.request_id ||
                                        t.id.slice(0, 8)}
                                    </small>
                                  </td>
                                  <td>
                                    <Badge>
                                      {t.caller === "agent"
                                        ? t.request_context?.request_id ===
                                          "console-debug"
                                          ? "Agent（调试）"
                                          : "Agent"
                                        : "后台"}
                                    </Badge>
                                  </td>
                                  <td>{t.result_count} 条</td>
                                  <td>{time(t.created_at)}</td>
                                  <td>
                                    <button
                                      className="text-button"
                                      disabled={busy}
                                      onClick={() =>
                                        action(async () => {
                                          const record = await api(
                                            `/traces/${t.id}`,
                                          );
                                          setResults({
                                            ...record,
                                            trace_id: record.id,
                                            method: "keyword",
                                          });
                                          setQuery(record.query);
                                          setTraceId(record.id);
                                        })
                                      }
                                    >
                                      查看依据 <ArrowUpRight size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty
                        text="暂无检索记录"
                        detail="Agent 调用检索工具后会自动出现在这里，也可以在上方模拟工具调用。"
                      />
                    )}
                  </section>
                  {results && (
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>
                          检索结果 <span>{results.results.length} 条事实</span>
                        </h2>
                        <code className="trace-id">
                          Trace: {results.trace_id}
                        </code>
                      </div>
                      <div className="retrieval-context">
                        <span>
                          调用方：
                          {results.caller === "agent" ? "Agent" : "后台"}
                        </span>
                        <span>
                          演示数据：
                          {results.request_context?.include_demo
                            ? "包含"
                            : "排除"}
                        </span>
                        {results.request_context?.request_id && (
                          <span>
                            请求：{results.request_context.request_id}
                          </span>
                        )}
                        <span>固定引用 · 查询时版本</span>
                      </div>
                      <div className="search-results">
                        {results.results.length ? (
                          results.results.map((r: Row) => (
                            <article key={r.fact_id}>
                              <div>
                                <button
                                  className="text-button"
                                  onClick={() => openEntity(r.entity_id)}
                                >
                                  {r.entity_name}
                                </button>
                                <Badge>v{r.version}</Badge>
                                {r.is_demo && (
                                  <span className="demo-tag">演示</span>
                                )}
                              </div>
                              <h3>
                                {r.key}：{r.value}
                              </h3>
                              <blockquote>{r.evidence}</blockquote>
                              <footer>
                                <a
                                  href={r.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Globe2 size={13} />
                                  {r.source_name}
                                </a>
                                <span>{time(r.fetched_at)}</span>
                                <button
                                  className="text-button"
                                  onClick={() => openSnapshot(r.snapshot_id)}
                                >
                                  原文快照 <ArrowUpRight size={14} />
                                </button>
                              </footer>
                            </article>
                          ))
                        ) : (
                          <Empty
                            text="没有命中已发布事实"
                            detail="尝试其他关键词，或先在审核工作台发布有证据的事实。"
                          />
                        )}
                      </div>
                    </section>
                  )}
                </>
              )}
              {page === "settings" && (
                <section className="panel settings-panel">
                  <h2>系统运行状态</h2>
                  {[
                    ["应用版本", config.version],
                    [
                      "访问模式",
                      config.auth_enabled
                        ? "管理口令已启用 · 单管理员"
                        : "本地模式 · 未配置管理口令",
                    ],
                    ["结构化数据", "SQLAlchemy · PostgreSQL / SQLite"],
                    [
                      "采集与抽取",
                      "HTTPS 公开网页快照 / 受控 JSON facts / 人工证据",
                    ],
                    ["检索方式", "后台与 Agent 共用已发布事实 · 关键词匹配"],
                    ["Agent 工具接口", "/api/knowledge/retrieve · 已提供"],
                    [
                      "Agent 独立口令",
                      config.knowledge_token_configured
                        ? "只读检索口令已配置"
                        : "尚未配置 KNOWLEDGE_TOKEN",
                    ],
                    ["模型服务", "在模型 API 配置页连接 · 密钥仅保存在当前页面会话"],
                    ["向量检索", "尚未启用 · 下一阶段接入 pgvector"],
                    [
                      "自动巡检",
                      "需独立启动 worker 进程；查看任务记录确认执行",
                    ],
                    ["部署方式", "本地开发 / Docker Compose"],
                  ].map(([k, v]) => (
                    <div className="setting-row" key={k}>
                      <span>{k}</span>
                      <b>{v}</b>
                    </div>
                  ))}
                  <div className="info-banner">
                    <ShieldCheck size={18} />
                    <p>
                      演示实体不代表实时规格。注册真实来源并完成证据审核后，事实才会用于检索。
                    </p>
                  </div>
                </section>
              )}
              {page !== "chat" && <footer className="page-footer">
                <span>ArchMind · AI 技术知识平台</span>
                <span>来源可溯 · 变更可审 · 版本可查</span>
              </footer>}
            </>
          )}
        </div>
      </main>
      {showTop && page !== "chat" && <button className="back-to-top" aria-label="回到顶部" title="回到顶部（Alt + ↑）" onClick={toTop}><ArrowUp size={20} /><span>回到顶部</span><kbd>Alt + ↑</kbd></button>}
      {detail && (
        <div className="drawer-backdrop" onClick={() => setDetail(null)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="实体详情"
            className="drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <span className="eyebrow">ENTITY / KNOWLEDGE</span>
              <button
                className="icon-button"
                aria-label="关闭详情"
                onClick={() => setDetail(null)}
              >
                <X size={20} />
              </button>
            </header>
            <div className="detail-heading">
              <span className={`entity-letter ${detail.kind}`}>
                {detail.name.slice(0, 1)}
              </span>
              <div>
                <h2>{detail.name}</h2>
                <span>
                  {kinds[detail.kind]}{" "}
                  {detail.is_demo && <span className="demo-tag">演示</span>}
                </span>
              </div>
            </div>
            <p className="detail-description">{detail.description}</p>
            {detail.model_resources && <ModelDownloads key={detail.id} resources={detail.model_resources} />}
            <div className="detail-buttons">
              <button
                className="button small"
                onClick={() => openForm("entity", detail)}
              >
                <Settings2 size={14} />
                编辑实体
              </button>
              <button
                className="button small"
                onClick={() => openForm("source", { entity_id: detail.id })}
              >
                <Plus size={14} />
                注册来源
              </button>
              {detail.website && (
                <a
                  className="button small"
                  href={detail.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  官网 <ExternalLink size={14} />
                </a>
              )}
            </div>
            <div className="tabs">
              {[
                ["facts", "已发布事实"],
                ["history", "历史版本"],
                ["sources", "来源与关系"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={detailTab === v ? "active" : ""}
                  onClick={() => setDetailTab(v)}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="detail-body">
              {detailTab === "facts" && (
                <>
                  {detail.facts.filter((f: Row) => !f.valid_to).length ? (
                    detail.facts
                      .filter((f: Row) => !f.valid_to)
                      .map((f: Row) => (
                        <article className="fact" key={f.id}>
                          <div>
                            <h3>{f.key}</h3>
                            <Badge>v{f.version}</Badge>
                          </div>
                          <p>{f.value}</p>
                          <blockquote>{f.evidence}</blockquote>
                          <button
                            className="text-button"
                            onClick={() => openSnapshot(f.snapshot_id)}
                          >
                            查看来源证据 <ArrowUpRight size={13} />
                          </button>
                        </article>
                      ))
                  ) : (
                    <Empty
                      text="暂无已发布事实"
                      detail="添加来源、采集快照并完成事实审核。"
                    />
                  )}
                  <button
                    className="button full"
                    onClick={() => openForm("change", { entity_id: detail.id })}
                  >
                    <Plus size={15} />
                    提交有证据的事实
                  </button>
                </>
              )}
              {detailTab === "history" && (
                <>
                  {detail.facts.length ? (
                    detail.facts.map((f: Row) => (
                      <article className="history-fact" key={f.id}>
                        <div>
                          <History size={17} />
                          <h3>{f.key}</h3>
                          <Badge>v{f.version}</Badge>
                          {!f.valid_to && (
                            <Badge value="approved">当前版本</Badge>
                          )}
                        </div>
                        <p>{f.value}</p>
                        <small>
                          {time(f.valid_from)} →{" "}
                          {f.valid_to ? time(f.valid_to) : "至今"}
                        </small>
                        <div className="row-actions">
                          <button
                            className="text-button"
                            onClick={() => openSnapshot(f.snapshot_id)}
                          >
                            原文证据
                          </button>
                          {f.valid_to && (
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() =>
                                action(
                                  () => post(`/facts/${f.id}/restore`),
                                  "已生成恢复候选，请在版本与审核中审批",
                                )
                              }
                            >
                              提交恢复候选
                            </button>
                          )}
                        </div>
                      </article>
                    ))
                  ) : (
                    <Empty />
                  )}
                </>
              )}
              {detailTab === "sources" && (
                <>
                  <div className="section-title">注册来源</div>
                  {detail.sources.map((s: Row) => (
                    <article className="fact" key={s.id}>
                      <div>
                        <b>{s.name}</b>
                        <Badge value={s.status} />
                      </div>
                      <a
                        className="source-url"
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {s.url}
                      </a>
                      <small>最近检查：{time(s.last_checked_at)}</small>
                    </article>
                  ))}
                  {!detail.sources.length && (
                    <p className="muted">尚未注册来源</p>
                  )}
                  <div className="section-title">
                    实体关系{" "}
                    <button
                      className="text-button"
                      onClick={() =>
                        openForm("relation", {
                          from_id: detail.id,
                          relation: "关联",
                        })
                      }
                    >
                      <Plus size={14} />
                      添加关系
                    </button>
                  </div>
                  {detail.relations.map((r: Row) => (
                    <div className="relation" key={r.id}>
                      <span>{name(r.from_id)}</span>
                      <span>
                        <small>{r.relation}</small>
                        <ArrowRight size={16} />
                      </span>
                      <span>{name(r.to_id)}</span>
                    </div>
                  ))}
                  {!detail.relations.length && (
                    <p className="muted">暂无关系</p>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
      {snapshot && (
        <div
          className="overlay snapshot-overlay"
          onClick={() => setSnapshot(null)}
        >
          <section
            className="modal snapshot-modal"
            role="dialog"
            aria-modal="true"
            aria-label="来源快照"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">SOURCE SNAPSHOT</span>
                <h2>来源快照</h2>
              </div>
              <button
                className="icon-button"
                aria-label="关闭快照"
                onClick={() => setSnapshot(null)}
              >
                <X size={20} />
              </button>
            </header>
            <div className="snapshot-meta">
              <b>{snapshot.source.name}</b>
              {snapshot.source.is_demo && (
                <span className="demo-tag">演示</span>
              )}
              <a
                className="source-url"
                href={snapshot.source.url}
                target="_blank"
                rel="noreferrer"
              >
                {snapshot.source.url}
                <ExternalLink size={12} />
              </a>
              <p>采集时间：{time(snapshot.fetched_at)}</p>
              <code>SHA-256: {snapshot.content_hash}</code>
            </div>
            <details open>
              <summary>规范化正文（点击切换显示）</summary>
              <pre>{snapshot.content}</pre>
            </details>
            <details>
              <summary>原始响应</summary>
              <pre>{snapshot.raw_content}</pre>
            </details>
            <div className="modal-actions">
              <button
                className="button primary"
                onClick={() => {
                  const s = snapshot;
                  setSnapshot(null);
                  openForm("change", {
                    entity_id: s.source.entity_id,
                    snapshot_id: s.id,
                  });
                }}
              >
                <Plus size={15} />
                基于此快照提交事实
              </button>
            </div>
          </section>
        </div>
      )}
      {modal && (
        <div className="overlay" onClick={() => !busy && setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="编辑表单"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>
                {
                  {
                    entity: form.id ? "编辑知识实体" : "新建知识实体",
                    category: "新建分类",
                    source: "注册数据来源",
                    change: "提交事实变更",
                    relation: "关联实体",
                    review:
                      form.decision === "approved" ? "审核并发布" : "驳回变更",
                    snapshots: "来源快照记录",
                  }[modal]
                }
              </h2>
              <button
                className="icon-button"
                disabled={busy}
                aria-label="关闭表单"
                onClick={() => setModal(null)}
              >
                <X size={20} />
              </button>
            </header>
            {modal === "snapshots" ? (
              <div className="snapshot-list">
                {snapshots.length ? (
                  snapshots.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setModal(null);
                        openSnapshot(s.id);
                      }}
                    >
                      <FileText size={17} />
                      <span>
                        {time(s.fetched_at)}
                        <small>{s.content_hash.slice(0, 28)}…</small>
                      </span>
                      <ArrowUpRight size={15} />
                    </button>
                  ))
                ) : (
                  <Empty text="尚无快照" detail="先执行一次成功的来源巡检。" />
                )}
              </div>
            ) : (
              <form onSubmit={saveForm}>
                {error && (
                  <div className="alert error" role="alert">
                    {error}
                  </div>
                )}
                {modal === "entity" && (
                  <>
                    <Field
                      label="实体名称"
                      required
                      value={form.name}
                      onChange={(v) => setForm({ ...form, name: v })}
                    />
                    <label>
                      实体类型
                      <select
                        value={form.kind}
                        onChange={(e) =>
                          setForm({ ...form, kind: e.target.value })
                        }
                      >
                        {Object.entries(kinds).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      所属分类（可多选）
                      <div className="checkbox-grid">
                        {categories.map((c) => (
                          <label key={c.id}>
                            <input
                              type="checkbox"
                              checked={
                                form.category_ids?.includes(c.id) || false
                              }
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  category_ids: e.target.checked
                                    ? [...(form.category_ids || []), c.id]
                                    : form.category_ids.filter(
                                        (id: string) => id !== c.id,
                                      ),
                                })
                              }
                            />
                            {c.name}
                          </label>
                        ))}
                      </div>
                    </label>
                    <div className="field-guide"><b>建议完善的知识维度</b><p>创建实体后，结合来源快照逐项提交事实并审核。</p><div className="field-chips">{(fieldTemplates[form.kind] || []).map(key => <span key={key}>{key}</span>)}</div></div>
                    <Field
                      label="官网地址（HTTPS）"
                      type="url"
                      value={form.website}
                      onChange={(v) => setForm({ ...form, website: v })}
                    />
                    <label>
                      实体描述
                      <textarea
                        value={form.description || ""}
                        onChange={(e) =>
                          setForm({ ...form, description: e.target.value })
                        }
                      />
                    </label>
                  </>
                )}
                {modal === "category" && (
                  <>
                    <Field
                      label="分类名称"
                      required
                      value={form.name}
                      onChange={(v) => setForm({ ...form, name: v })}
                    />
                    <label>
                      父分类
                      <select
                        value={form.parent_id || ""}
                        onChange={(e) =>
                          setForm({ ...form, parent_id: e.target.value })
                        }
                      >
                        <option value="">顶级分类</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {(modal === "source" || modal === "change") && (
                  <label>
                    关联实体
                    <select
                      required
                      value={form.entity_id || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          entity_id: e.target.value,
                          snapshot_id: "",
                        })
                      }
                    >
                      <option value="">选择实体</option>
                      {entities.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {modal === "source" && (
                  <>
                    <Field
                      label="来源名称"
                      required
                      value={form.name}
                      onChange={(v) => setForm({ ...form, name: v })}
                    />
                    <Field
                      label="公开 HTTPS 地址（直接地址，不自动跳转）"
                      type="url"
                      required
                      value={form.url}
                      onChange={(v) => setForm({ ...form, url: v })}
                    />
                    <label>
                      来源类型
                      <select
                        value={form.source_type}
                        onChange={(e) =>
                          setForm({ ...form, source_type: e.target.value })
                        }
                      >
                        <option value="web">官网 / 文档网页</option>
                        <option value="json">结构化 JSON（facts 协议）</option>
                        <option value="github">GitHub 公开文档</option>
                        <option value="rss">RSS / 公告</option>
                      </select>
                    </label>
                    <label>
                      巡检间隔（小时）
                      <input
                        required
                        type="number"
                        min="1"
                        max="8760"
                        value={form.interval_hours}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            interval_hours: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <p className="form-hint">
                      普通网页只保存快照，需要人工提取事实。JSON 的 facts
                      协议可自动生成候选，均需审核。
                    </p>
                  </>
                )}
                {modal === "change" && (
                  <>
                    <label>
                      证据快照
                      <select
                        required
                        value={form.snapshot_id || ""}
                        onChange={(e) =>
                          setForm({ ...form, snapshot_id: e.target.value })
                        }
                      >
                        <option value="">选择所属来源的快照</option>
                        {snapshots
                          .filter(
                            (s) =>
                              sources.find((src) => src.id === s.source_id)
                                ?.entity_id === form.entity_id,
                          )
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {sourceName(s.source_id)} · {time(s.fetched_at)}
                            </option>
                          ))}
                      </select>
                    </label>
                    {form.snapshot_id && (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => openSnapshot(form.snapshot_id)}
                      >
                        打开快照核对原文 <ExternalLink size={13} />
                      </button>
                    )}
                    <div className="field-guide"><b>选择建议字段，也可以自行填写</b><div className="field-chips">{(fieldTemplates[entities.find(e => e.id === form.entity_id)?.kind] || []).map(key => <button type="button" key={key} onClick={() => setForm({ ...form, key })}>{key}</button>)}</div></div>
                    <Field
                      label="事实字段（如：上下文窗口）"
                      required
                      value={form.key}
                      onChange={(v) => setForm({ ...form, key: v })}
                    />
                    <Field
                      label="建议值"
                      required
                      value={form.value}
                      onChange={(v) => setForm({ ...form, value: v })}
                    />
                    <label>
                      原文证据片段
                      <textarea
                        required
                        value={form.evidence || ""}
                        onChange={(e) =>
                          setForm({ ...form, evidence: e.target.value })
                        }
                      />
                    </label>
                    <p className="form-hint">
                      证据必须逐字存在于所选快照的规范化正文中。提交后进入人工审核。
                    </p>
                  </>
                )}
                {modal === "relation" && (
                  <>
                    <label>
                      起点实体
                      <select
                        required
                        value={form.from_id || ""}
                        onChange={(e) =>
                          setForm({ ...form, from_id: e.target.value })
                        }
                      >
                        <option value="">选择实体</option>
                        {entities.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field
                      label="关系名称（如：开发模型、提供 API）"
                      required
                      value={form.relation}
                      onChange={(v) => setForm({ ...form, relation: v })}
                    />
                    <label>
                      目标实体
                      <select
                        required
                        value={form.to_id || ""}
                        onChange={(e) =>
                          setForm({ ...form, to_id: e.target.value })
                        }
                      >
                        <option value="">选择实体</option>
                        {entities
                          .filter((e) => e.id !== form.from_id)
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                )}
                {modal === "review" && (
                  <>
                    <div className="review-confirm">
                      <ShieldCheck size={26} />
                      <p>
                        {form.decision === "approved"
                          ? `确认已核对「${form.key}」的来源证据。发布后，新值成为当前事实，旧版本保留。`
                          : `「${form.key}」将标记为已驳回，已发布事实不变。`}
                      </p>
                    </div>
                    <label>
                      审核备注
                      <textarea
                        maxLength={2000}
                        value={form.note || ""}
                        onChange={(e) =>
                          setForm({ ...form, note: e.target.value })
                        }
                      />
                    </label>
                  </>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => setModal(null)}
                  >
                    取消
                  </button>
                  <button className="button primary" disabled={busy}>
                    {busy ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Check size={16} />
                    )}{" "}
                    {modal === "review" ? "确认审核" : "保存"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
      {login && (
        <div className="overlay">
          <section
            className="modal login-modal"
            role="dialog"
            aria-modal="true"
            aria-label="管理员登录"
          >
            <span className="brand-icon">
              <Layers3 size={26} />
            </span>
            <h2>进入你的知识空间</h2>
            <p>此实例已启用管理口令。口令仅保存在当前页面内存中。</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setToken(form.token || "");
                setBusy(true);
                try {
                  await load();
                  setLogin(false);
                  setError("");
                  setForm({});
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field
                label="管理口令"
                type="password"
                required
                value={form.token}
                onChange={(v) => setForm({ token: v })}
              />
              {error && <p className="login-error">{error}</p>}
              <button className="button primary full" disabled={busy}>
                进入控制台 <ArrowRight size={16} />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  required = false,
  type = "text",
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label>
      {label}
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        type={type}
        maxLength={type === "url" ? 2000 : 10000}
      />
    </label>
  );
}
const BuildingIcon = Database;
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

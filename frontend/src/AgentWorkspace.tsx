import { selectionContext } from "./recommendations";
import { WebEvidence } from "./WebEvidence";
import { SearchSettings } from "./SearchSettings";
import {
  loadSearchSettings,
  saveSearchSettings,
  clearSearchSettings,
  SEARCH_SETTINGS_EVENT,
  SEARCH_SETTINGS_KEY,
} from "./webSearch";
import type { SearchConnection, WebSearch, WebResult } from "./webSearch";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  Download,
  History,
  Loader2,
  Globe2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api, post } from "./api";
import { isDemo } from "./demo/mode";
import { ModelSettings } from "./ModelSettings";
import {
  loadModelSettings,
  saveModelSettings,
  clearModelSettings,
  MODEL_SETTINGS_KEY,
  MODEL_SETTINGS_EVENT,
} from "./browserModel";
import { solutionPolicy } from "./solutionFlow";
import type { Workflow } from "./solutionFlow";
import { Connection, presetConnection } from "./modelProviders";

type Citation = {
  citation_id: string;
  entity_name: string;
  key: string;
  value: string;
  snapshot_id: string;
  source_url: string;
  version: number;
};
type Answer = {
  answer: string;
  citations: Citation[];
  retrieved: Citation[];
  warnings: string[];
  trace_id: string;
  model: string;
  workflow?: Workflow;
  finish_reason?: string;
  diagnostics?: Record<string, any>;
  web_search?: WebSearch;
  web_citations?: WebResult[];
};
type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: Answer;
};
type Summary = {
  id: string;
  title: string;
  title_mode?: "auto" | "manual";
  revision: number;
  updated_at: string;
  message_count: number;
  preview: string;
};
type Conversation = Summary & { messages: Turn[] };
const suggestions = [
  {
    title: "低成本小说网站",
    text: "我想用 AI 写小说并做一个网站，希望成本低，请先帮我确认需求，再比较 API 自建、本地模型和现成平台。",
  },
  {
    title: "企业知识问答",
    text: "为 50 人团队设计一个本地部署的中文文档知识库问答方案，请先帮我确认预算和部署约束。",
  },
  {
    title: "开源模型选型",
    text: "我想使用开源模型做中文对话和文档检索，请结合知识库比较技术路线，并给出官方下载入口。",
  },
  {
    title: "AI 视频短剧",
    text: "我想做 AI 视频短剧，先帮我确认需求，再决定适合哪条路线。",
  },
];
function Reply({
  turn,
  openSnapshot,
}: {
  turn: Turn;
  openSnapshot: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(turn.content);
      setCopied(true);
      setCopyError("");
    } catch {
      setCopyError("复制失败，请手动选择正文复制。");
    }
  };
  return (
    <article className={`chat-message ${turn.role}`}>
      <header>
        <span>{turn.role === "user" ? "你" : "ArchMind"}</span>
        {turn.result && <small>{turn.result.model}</small>}
      </header>
      {turn.role === "user" ? (
        <p className="user-text">{turn.content}</p>
      ) : (
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
            {turn.content}
          </Markdown>
        </div>
      )}
      {turn.result && (
        <>
          {(turn.result.warnings || []).map((w) => (
            <p className="chat-warning" key={w}>
              {w}
            </p>
          ))}
          <div className="reply-actions">
            <button onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "已复制" : "复制回答"}
            </button>
            {turn.result.trace_id && (
              <span>
                {turn.result.citations.length +
                  (turn.result.web_citations?.length || 0)}{" "}
                条引用 · {turn.result.retrieved.length} 条库内资料 ·{" "}
                {turn.result.web_search?.results.length || 0} 条网页
              </span>
            )}
          </div>
          {copyError && <p role="status">{copyError}</p>}
          {!!turn.result.trace_id && (
            <details className="reply-sources">
              <summary>
                <BookOpen size={14} />
                查看知识来源
              </summary>
              {turn.result.citations.map((c) => (
                <button
                  className="citation-row"
                  key={c.citation_id}
                  onClick={() => openSnapshot(c.snapshot_id)}
                >
                  <b>
                    [{c.citation_id}] {c.entity_name}
                  </b>
                  <span>
                    {c.key}：{c.value}
                  </span>
                  <small>事实 v{c.version} · 查看证据</small>
                </button>
              ))}
              <details>
                <summary>
                  全部检索资料（{turn.result.retrieved.length}）
                </summary>
                {turn.result.retrieved.map((c) => (
                  <p key={c.citation_id}>
                    <b>
                      [{c.citation_id}] {c.entity_name}
                    </b>{" "}
                    · {c.key}：{c.value}
                    <br />
                    <a href={c.source_url} target="_blank" rel="noreferrer">
                      官方资料 ↗
                    </a>
                  </p>
                ))}
                <small>检索记录：{turn.result.trace_id}</small>
              </details>
            </details>
          )}
          <WebEvidence
            web={turn.result.web_search}
            citations={turn.result.web_citations}
          />
          {turn.result.diagnostics &&
            turn.result.workflow?.phase === "generated" && (
              <details className="reply-status">
                <summary>回复状态</summary>
                <p>
                  停止原因：
                  {turn.result.finish_reason === "length"
                    ? "达到输出上限"
                    : turn.result.finish_reason === "content_filter"
                      ? "服务商限制输出"
                      : "正常结束"}{" "}
                  · 输出上限：{turn.result.diagnostics.output_limit || "未记录"}{" "}
                  tokens
                </p>
                <p>
                  服务商用量：
                  {Object.entries(turn.result.diagnostics.usage || {})
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(" · ") || "未返回"}
                </p>
              </details>
            )}
        </>
      )}
    </article>
  );
}
export function AgentWorkspace({
  visible,
  openSnapshot,
}: {
  visible: boolean;
  openSnapshot: (id: string) => void;
}) {
  const [connection, setConnection] = useState<Connection>(
    () => loadModelSettings()?.connection || presetConnection("DeepSeek"),
  );
  const [provider, setProvider] = useState(
    () => loadModelSettings()?.provider || "DeepSeek",
  );
  const [searchConnection, setSearchConnection] = useState<SearchConnection>(
    () => loadSearchSettings(),
  );
  const [searchSettingsOpen, setSearchSettingsOpen] = useState(false);
  useEffect(() => {
    const reload = () => setSearchConnection(loadSearchSettings());
    const storage = (e: StorageEvent) => {
      if (e.key === SEARCH_SETTINGS_KEY || e.key === null) reload();
    };
    window.addEventListener(SEARCH_SETTINGS_EVENT, reload);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(SEARCH_SETTINGS_EVENT, reload);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [history, setHistory] = useState<Summary[]>([]);
  const [documents, setDocuments] = useState<Record<string, Conversation>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [historyError, setHistoryError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingId, setLoadingId] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [search, setSearch] = useState("");
  const [renameId, setRenameId] = useState("");
  const [renameTitle, setRenameTitle] = useState("");
  const [deleted, setDeleted] = useState<Summary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Summary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (deleteTarget) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleteTarget]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySlot, setHistorySlot] = useState<HTMLElement | null>(null);
  const [showLatest, setShowLatest] = useState(false);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const current = activeId ? documents[activeId] : undefined;
  const draftKey = activeId || "new";
  const draft = drafts[draftKey] || "";
  useEffect(() => {
    const input = inputRef.current;
    if (!visible || !input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(Math.max(input.scrollHeight, 32), 128)}px`;
  }, [draft, visible]);
  const hasConnection =
    !!connection.api_key.trim() && !!connection.model.trim();
  const configured = isDemo || hasConnection;
  useEffect(() => {
    const sync = () => {
      const saved = loadModelSettings();
      setConnection(saved?.connection || presetConnection("DeepSeek"));
      setProvider(saved?.provider || "DeepSeek");
    };
    const stored = (event: StorageEvent) => {
      if (event.key === MODEL_SETTINGS_KEY) sync();
    };
    window.addEventListener("storage", stored);
    window.addEventListener(MODEL_SETTINGS_EVENT, sync);
    return () => {
      window.removeEventListener("storage", stored);
      window.removeEventListener(MODEL_SETTINGS_EVENT, sync);
    };
  }, []);
  const matching = history.filter((h) =>
    (h.title + h.preview).toLowerCase().includes(search.trim().toLowerCase()),
  );
  const putConversation = (conversation: Conversation) => {
    setDocuments((v) =>
      v[conversation.id]?.revision > conversation.revision
        ? v
        : { ...v, [conversation.id]: conversation },
    );
    setHistory((v) =>
      [conversation, ...v.filter((h) => h.id !== conversation.id)].sort(
        (a, b) => b.updated_at.localeCompare(a.updated_at),
      ),
    );
  };
  const openConversation = async (id: string) => {
    setActiveId(id);
    setHistoryOpen(false);
    setLoadingId(id);
    try {
      putConversation(await api<Conversation>(`/conversations/${id}`));
      setErrors((v) => ({ ...v, [id]: "" }));
    } catch (e) {
      setErrors((v) => ({ ...v, [id]: (e as Error).message }));
    } finally {
      setLoadingId((v) => (v === id ? "" : v));
    }
  };
  const loadHistory = async (choose = false) => {
    setLoadingHistory(true);
    try {
      const rows = await api<Summary[]>("/conversations");
      setHistory(rows);
      setHistoryError("");
      if (choose && !activeRef.current && rows[0])
        await openConversation(rows[0].id);
    } catch (e) {
      setHistoryError((e as Error).message);
    } finally {
      setLoadingHistory(false);
    }
  };
  useEffect(() => {
    void loadHistory(true);
  }, []);
  useEffect(() => {
    setHistorySlot(document.getElementById("conversation-history-slot"));
  }, [visible]);
  useEffect(() => {
    if (!pending) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [pending?.id]);
  useEffect(() => {
    if (!visible) return;
    nearBottom.current = true;
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      setShowLatest(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeId, visible]);
  useEffect(() => {
    if (visible && nearBottom.current) {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    }
  }, [current?.messages.length, pending?.id, visible]);
  const newConversation = async () => {
    setCreating(true);
    try {
      const conversation = await post("/conversations", { title: "新对话" });
      putConversation(conversation);
      setActiveId(conversation.id);
      setHistoryOpen(false);
    } catch (e) {
      setHistoryError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };
  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const row = await api<Summary>(`/conversations/${renameId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: renameTitle.trim() }),
      });
      setHistory((v) => v.map((h) => (h.id === row.id ? row : h)));
      setDocuments((v) =>
        v[row.id]
          ? {
              ...v,
              [row.id]: {
                ...v[row.id],
                title: row.title,
                title_mode: row.title_mode,
              },
            }
          : v,
      );
      setRenameId("");
    } catch (e) {
      setHistoryError((e as Error).message);
    }
  };
  const remove = async (row: Summary) => {
    if (deleting || pending?.id === row.id) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`/conversations/${row.id}`, { method: "DELETE" });
      setHistory((v) => v.filter((h) => h.id !== row.id));
      setDeleted(row);
      setDeleteTarget(null);
      if (activeRef.current === row.id) {
        const next = history.find((h) => h.id !== row.id);
        if (next) await openConversation(next.id);
        else setActiveId(null);
      }
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };
  const restore = async () => {
    if (!deleted) return;
    try {
      const conversation = await post(`/conversations/${deleted.id}/restore`);
      putConversation(conversation);
      setActiveId(conversation.id);
      setDeleted(null);
    } catch (e) {
      setHistoryError((e as Error).message);
    }
  };
  const send = async (
    event: { preventDefault: () => void },
    action = "message",
    override?: string,
  ) => {
    event.preventDefault();
    const content = (override || draft).trim();
    if (
      !content ||
      pending ||
      creating ||
      !configured ||
      loadingId === activeId ||
      (activeId && !current)
    )
      return;
    let conversation = current;
    let id = activeId || "new";
    setPending({ id, content });
    try {
      if (!conversation) {
        conversation = (await post("/conversations", {
          title: "新对话",
        })) as Conversation;
        id = conversation.id;
        putConversation(conversation);
        setActiveId(id);
        setPending({ id, content });
        setDrafts((v) => ({ ...v, new: "" }));
      }
      nearBottom.current = true;
      setDrafts((v) => ({ ...v, [id]: "" }));
      setErrors((v) => ({ ...v, [id]: "" }));
      const result = await post("/agent/chat", {
        connection,
        web_search: searchConnection,
        action,
        conversation_id: id,
        revision: conversation.revision,
        messages: [{ role: "user", content }],
      });
      putConversation(result.conversation);
    } catch (e) {
      setErrors((v) => ({ ...v, [id]: (e as Error).message }));
      setDrafts((v) => ({ ...v, [id]: content }));
    } finally {
      setPending(null);
    }
  };
  const exportChat = () => {
    if (!current?.messages.length) return;
    const text =
      "# " +
      current.title +
      "\n\n" +
      current.messages
        .map(
          (t) =>
            "## " +
            (t.role === "user" ? "你" : "ArchMind") +
            "\n\n" +
            t.content +
            ((t.result?.web_citations?.length || 0) > 0
              ? "\n\n" +
                t
                  .result!.web_citations!.map(
                    (c) =>
                      `- [${c.citation_id}] ${c.title}\n  ${c.url}\n  检索时间：${c.searched_at}`,
                  )
                  .join("\n")
              : "") +
            (t.result?.citations.length
              ? "\n\n" +
                t.result.citations
                  .map(
                    (c) =>
                      `- [${c.citation_id}] ${c.entity_name} · ${c.key}：${c.value}\n  ${c.source_url}`,
                  )
                  .join("\n")
              : ""),
        )
        .join("\n\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download =
      current.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) + ".md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const historyPanel = (
    <section
      className={`conversation-history ${historyOpen ? "mobile-open" : ""}`}
      aria-label="历史对话"
    >
      <div className="history-heading">
        <b>我的对话</b>
        <button
          className="icon-button mobile-only"
          aria-label="关闭历史对话"
          onClick={() => setHistoryOpen(false)}
        >
          <X size={18} />
        </button>
      </div>
      <button
        className="button new-conversation"
        disabled={creating || pending?.id === "new"}
        onClick={newConversation}
      >
        <Plus size={17} />
        新建对话
      </button>
      <label className="history-search">
        <Search size={15} />
        <input
          aria-label="搜索历史对话"
          placeholder="搜索对话"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {historyError && (
        <div className="history-error" role="alert">
          {historyError}
          <button onClick={() => loadHistory(true)}>重试</button>
        </div>
      )}
      {deleted && (
        <div className="history-undo" role="status">
          已删除对话<button onClick={restore}>撤销</button>
          <button aria-label="关闭撤销提示" onClick={() => setDeleted(null)}>
            ×
          </button>
        </div>
      )}
      <div className="history-list">
        {loadingHistory && !history.length ? (
          <p>正在读取…</p>
        ) : (
          matching.map((row) => (
            <div
              className={`history-item ${activeId === row.id ? "selected" : ""}`}
              key={row.id}
            >
              {renameId === row.id ? (
                <form onSubmit={rename}>
                  <input
                    aria-label="对话标题"
                    maxLength={120}
                    autoFocus
                    required
                    value={renameTitle}
                    onChange={(e) => setRenameTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setRenameId("");
                    }}
                  />
                  <button aria-label="保存对话标题">
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="取消重命名"
                    onClick={() => setRenameId("")}
                  >
                    <X size={14} />
                  </button>
                </form>
              ) : (
                <>
                  <button
                    className="history-select"
                    title={row.title}
                    onClick={() => openConversation(row.id)}
                  >
                    {pending?.id === row.id ? (
                      <Loader2 size={15} className="spin" />
                    ) : (
                      <MessageSquare size={15} />
                    )}
                    <span>
                      {row.title}
                      <small>
                        {row.message_count
                          ? Math.floor(row.message_count / 2) + " 轮对话"
                          : "尚未开始"}{" "}
                        ·{" "}
                        {new Date(row.updated_at).toLocaleDateString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </small>
                    </span>
                  </button>
                  <div className="history-item-actions">
                    <button
                      aria-label={`重命名对话：${row.title}`}
                      onClick={() => {
                        setRenameId(row.id);
                        setRenameTitle(row.title);
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      aria-label={`删除对话：${row.title}`}
                      disabled={pending?.id === row.id}
                      onClick={() => {
                        setDeleteError("");
                        setDeleteTarget(row);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
        {!loadingHistory && !matching.length && (
          <p className="history-empty">
            {search ? "没有匹配的对话" : "开始对话后，记录会保存在这里。"}
          </p>
        )}
      </div>
      <small className="history-storage">
        {isDemo ? "历史仅保存在此浏览器" : "历史自动保存到当前工作空间"}
      </small>
    </section>
  );
  return (
    <>
      {historySlot && createPortal(historyPanel, historySlot)}
      {searchSettingsOpen && (
        <SearchSettings
          connection={searchConnection}
          onClose={() => setSearchSettingsOpen(false)}
          onSave={(value) => {
            setSearchConnection(saveSearchSettings(value));
            setSearchSettingsOpen(false);
          }}
          onClear={() => {
            clearSearchSettings();
            setSearchConnection(loadSearchSettings());
            setSearchSettingsOpen(false);
          }}
        />
      )}
      <section className="agent-workspace chat-layout" hidden={!visible}>
        <header className="conversation-header">
          <div>
            <button
              className="icon-button mobile-only"
              aria-label="打开历史对话"
              onClick={() => setHistoryOpen(true)}
            >
              <History size={19} />
            </button>
            <h1 title={current?.title}>{current?.title || "方案对话"}</h1>
          </div>
          <div>
            <button
              className="icon-button mobile-only"
              aria-label="新建对话"
              disabled={creating || pending?.id === "new"}
              onClick={newConversation}
            >
              <Plus size={20} />
            </button>
            {!!current?.messages.length && (
              <button
                className="icon-button"
                aria-label="导出当前对话"
                title="导出 Markdown"
                onClick={exportChat}
              >
                <Download size={18} />
              </button>
            )}
            <button
              className={`web-search-switch ${searchConnection.enabled ? "enabled" : ""}`}
              onClick={() => setSearchSettingsOpen(true)}
              title={
                searchConnection.enabled ? "联网检索已启用" : "配置联网检索"
              }
            >
              <Globe2 size={15} />
              <span>联网检索{searchConnection.enabled ? "：开" : "：关"}</span>
            </button>
            <button
              className="model-switch"
              onClick={() => setSettingsOpen(true)}
            >
              <span
                className={configured ? "model-ready-dot" : "model-empty-dot"}
              />
              <span>{hasConnection ? connection.model : "连接模型"}</span>
              <Settings2 size={16} />
            </button>
          </div>
        </header>
        {current?.messages.at(-1)?.result?.workflow && (
          <details className="requirements-summary">
            <summary>
              {
                {
                  collecting: "正在澄清需求",
                  ready: "需求已整理，等待确认",
                  generated: "已生成方案",
                }[current.messages.at(-1)!.result!.workflow!.phase]
              }{" "}
              · 已记录{" "}
              {
                Object.keys(current.messages.at(-1)!.result!.workflow!.fields)
                  .length
              }{" "}
              项条件<span>查看需求摘要</span>
            </summary>
            <dl>
              {solutionPolicy.slots.map((slot) => {
                const field =
                  current.messages.at(-1)!.result!.workflow!.fields[slot.id];
                return field ? (
                  <div key={slot.id}>
                    <dt>{slot.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ) : null;
              })}
            </dl>
            <p>
              选型任务：
              {selectionContext(current.messages.at(-1)!.result!.workflow)
                .capabilities.map((c) => c.label)
                .join(" · ") || "待确认"}
            </p>
            <p>直接在聊天中修改条件，修改后会再次请你确认。</p>
          </details>
        )}
        <div
          className="conversation-scroll"
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            nearBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 180;
            setShowLatest(!nearBottom.current);
          }}
        >
          {loadingId === activeId && !current ? (
            <div className="conversation-loading">
              <Loader2 className="spin" />
              读取对话…
            </div>
          ) : (
            <>
              {!current?.messages.length && pending?.id !== draftKey && (
                <div className="chat-start">
                  <span className="start-icon">
                    <Sparkles size={25} />
                  </span>
                  <h2>选对模型和工具，算清成本方向。</h2>
                  <p>
                    {isDemo
                      ? "可直接体验资料与引用；连接自己的 API 后，使用真实模型生成方案。"
                      : "说说你想做什么、预算多少，我会比较合适的模型、项目和使用路线。"}
                  </p>
                  <div className="start-suggestions">
                    {suggestions.map((s) => (
                      <button
                        key={s.title}
                        onClick={() =>
                          setDrafts((v) => ({ ...v, [draftKey]: s.text }))
                        }
                      >
                        <MessageSquare size={16} />
                        {s.title}
                        <ArrowUp size={14} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="conversation">
                {current?.messages.map((turn) => (
                  <Reply
                    key={turn.id}
                    turn={turn}
                    openSnapshot={openSnapshot}
                  />
                ))}
                {pending?.id === draftKey && (
                  <>
                    <article className="chat-message user">
                      <header>你</header>
                      <p className="user-text">{pending.content}</p>
                    </article>
                    <div className="chat-progress" role="status">
                      <Loader2 className="spin" size={18} />
                      正在整理需求与回复…<span>{elapsed}s</span>
                    </div>
                  </>
                )}
              </div>
              {!pending &&
                current?.messages.at(-1)?.result?.workflow?.phase ===
                  "ready" && (
                  <div className="workflow-actions">
                    <button
                      className="button primary"
                      onClick={(e) => send(e, "generate", "生成简版方案")}
                    >
                      确认需求，生成简版方案
                    </button>
                    <span>也可以继续聊天修改条件</span>
                  </div>
                )}
              {!pending &&
                current?.messages.at(-1)?.result?.workflow?.phase ===
                  "generated" &&
                current.messages.at(-1)?.result?.finish_reason === "length" && (
                  <div className="workflow-actions">
                    <button
                      className="button"
                      onClick={(e) =>
                        send(
                          e,
                          "continue",
                          "请续写上一条剩余内容，不重复已写部分",
                        )
                      }
                    >
                      续写剩余内容
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setSettingsOpen(true)}
                    >
                      调整输出上限
                    </button>
                  </div>
                )}
            </>
          )}
        </div>
        <div className="composer-dock">
          {showLatest && (
            <button
              className="jump-latest"
              onClick={() =>
                scrollRef.current?.scrollTo({
                  top: scrollRef.current.scrollHeight,
                  behavior: "smooth",
                })
              }
            >
              <ArrowDown size={15} />
              回到最新消息
            </button>
          )}
          {errors[draftKey] && (
            <div className="send-error" role="alert">
              <span>{errors[draftKey]}</span>
              {activeId && (
                <button onClick={() => openConversation(activeId)}>
                  重新载入
                </button>
              )}
              <button
                aria-label="关闭发送错误"
                onClick={() => setErrors((v) => ({ ...v, [draftKey]: "" }))}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <form className="chat-composer" onSubmit={send}>
            <label className="sr-only" htmlFor="solution-prompt">
              你的需求
            </label>
            <textarea
              id="solution-prompt"
              ref={inputRef}
              rows={1}
              placeholder="描述需求，继续追问…"
              maxLength={6000}
              disabled={pending?.id === draftKey}
              value={draft}
              onChange={(e) =>
                setDrafts((v) => ({ ...v, [draftKey]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  (e.ctrlKey || e.metaKey) &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div>
              {pending && pending.id !== draftKey && (
                <span className="composer-busy" role="status">
                  另一段对话正在生成
                </span>
              )}
              {configured ? (
                <button
                  className="button primary"
                  disabled={
                    !!pending ||
                    creating ||
                    !draft.trim() ||
                    loadingId === activeId ||
                    (!!activeId && !current)
                  }
                >
                  <ArrowUp size={17} />
                  发送
                </button>
              ) : (
                <button
                  type="button"
                  className="button primary"
                  onClick={() => setSettingsOpen(true)}
                >
                  连接模型
                </button>
              )}
            </div>
          </form>
          <p className="composer-caption">
            <BookOpen size={12} />
            <span>
              {isDemo
                ? hasConnection
                  ? "浏览器直连你的模型 · 使用当前本地知识与引用"
                  : "尚未配置 API，本轮使用静态演示 · 可在右上角连接模型"
                : "基于已发布知识回答 · 重要结论请核对引用来源"}
            </span>
            <span className="composer-keyboard-hint">
              Ctrl + Enter 发送 · Enter 换行
            </span>
          </p>
        </div>
      </section>
      <dialog
        ref={deleteDialog}
        className="model-settings-dialog conversation-delete-dialog"
        aria-labelledby="delete-conversation-title"
        onCancel={(e) => {
          e.preventDefault();
          if (!deleting) setDeleteTarget(null);
        }}
      >
        <h2 id="delete-conversation-title">确认删除对话？</h2>
        <p>将删除「{deleteTarget?.title}」。删除后可通过撤销恢复。</p>
        {deleteError && (
          <p role="alert" className="form-error">
            {deleteError}
          </p>
        )}
        <footer>
          <button
            className="button"
            autoFocus
            disabled={deleting}
            onClick={() => setDeleteTarget(null)}
          >
            取消
          </button>
          <button
            className="button primary"
            disabled={deleting || pending?.id === deleteTarget?.id}
            onClick={() => deleteTarget && remove(deleteTarget)}
          >
            {deleting ? "正在删除…" : "确认删除"}
          </button>
        </footer>
      </dialog>
      {settingsOpen && (
        <ModelSettings
          connection={connection}
          provider={provider}
          onClose={() => setSettingsOpen(false)}
          onClear={() => {
            clearModelSettings();
            setConnection(presetConnection("DeepSeek"));
            setProvider("DeepSeek");
            setSettingsOpen(false);
          }}
          onSave={(value, selected) => {
            const clean = saveModelSettings(value, selected);
            setConnection(clean);
            setProvider(selected);
            setSettingsOpen(false);
          }}
        />
      )}
    </>
  );
}

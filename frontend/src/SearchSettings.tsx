import { useEffect, useRef, useState } from "react";
import { Globe2, Loader2, X } from "lucide-react";
import { post } from "./api";
import { isDemo } from "./demo/mode";
import { normalizeSearch, searchPolicy } from "./webSearch";
import type { SearchConnection } from "./webSearch";
export function SearchSettings({
  connection,
  onSave,
  onClear,
  onClose,
}: {
  connection: SearchConnection;
  onSave: (v: SearchConnection) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(connection),
    [testing, setTesting] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  const test = async () => {
    setTesting(true);
    setError("");
    setNotice("");
    try {
      const result = await post(
        "/agent/search/test",
        normalizeSearch({ ...draft, enabled: true }),
      );
      setNotice(`检索连接成功，取得 ${result.count} 条结果。`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="model-settings-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!testing) onClose();
      }}
    >
      <header>
        <div>
          <h2>
            <Globe2 size={19} />
            联网检索
          </h2>
          <p>生成方案与后续问答时，补充检索互联网资料。</p>
        </div>
        <button
          className="icon-button"
          aria-label="关闭检索设置"
          disabled={testing}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onSave(normalizeSearch(draft));
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      >
        <label className="search-enable">
          <input
            type="checkbox"
            checked={draft.enabled}
            disabled={testing}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          启用联网检索
        </label>
        <label>
          搜索服务
          <select
            aria-label="搜索服务"
            value={draft.provider}
            disabled={testing}
            onChange={(e) => {
              setDraft({
                ...draft,
                provider: e.target.value as SearchConnection["provider"],
                api_key: "",
              });
              setNotice("");
              setError("");
            }}
          >
            {Object.entries(searchPolicy.providers).map(([id, p]) => (
              <option key={id} value={id}>
                {p.name}
                {isDemo && id === "bocha" ? "（Pages 推荐）" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          搜索 API Key
          <input
            type="password"
            autoComplete="off"
            required={draft.enabled}
            disabled={testing}
            value={draft.api_key}
            placeholder="独立的搜索服务 Key，不是模型 Key"
            onChange={(e) => setDraft({ ...draft, api_key: e.target.value })}
          />
        </label>
        <p className="provider-note">
          设置与 Key
          独立保存在当前浏览器，可单独清除。只把检索关键词交给所选搜索服务；检索结果会连同库内资料交给模型。每次生成最多
          2 次搜索，测试会发起 1
          次，以搜索服务商计费为准。澄清需求和续写不重新搜索。
        </p>
        <p className="provider-note">
          {isDemo
            ? "Pages 从浏览器直连检索服务，需要支持 CORS。需同时连接文本模型，才能生成结合网页的真实回答。"
            : "由本项目后端调用检索服务，Key 不写入会话、知识或检索记录。"}
          搜索失败会明确提示，网页结果不会自动变成已审核事实。
        </p>
        <a
          className="provider-docs"
          href={searchPolicy.providers[draft.provider].docs}
          target="_blank"
          rel="noreferrer"
        >
          查看检索服务官方文档 ↗
        </a>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="connection-success" role="status">
            {notice}
          </p>
        )}
        <footer>
          <button
            type="button"
            className="button"
            disabled={testing}
            onClick={() => {
              try {
                onClear();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            清除搜索配置
          </button>
          <button
            type="button"
            className="button"
            disabled={testing || !draft.api_key.trim()}
            onClick={test}
          >
            {testing ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <Globe2 size={15} />
            )}
            测试检索
          </button>
          <button className="button primary" disabled={testing}>
            保存检索配置
          </button>
        </footer>
      </form>
    </dialog>
  );
}

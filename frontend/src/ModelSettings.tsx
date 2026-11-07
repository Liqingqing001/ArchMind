import { useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { isDemo } from "./demo/mode";
import { post } from "./api";
import { normalizeConnection } from "./browserModel";
import { Connection, presets, presetConnection } from "./modelProviders";

export function ModelSettings({ connection, provider, onSave, onClose, onClear }: {
  connection: Connection; provider: string; onClear: () => void; onSave: (value: Connection, provider: string) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(connection);
  const [selected, setSelected] = useState(provider);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  const update = (values: Partial<Connection>) => { setDraft(v => ({ ...v, ...values })); setNotice(""); setError(""); };
  const normalized = () => normalizeConnection(draft);
  const test = async () => {
    setTesting(true); setError(""); setNotice("");
    try {
      const result = await post("/agent/test", normalized());
      setDraft(v => ({ ...v, base_url: result.base_url, protocol: result.protocol }));
      setNotice("连接成功，可以保存并开始对话。");
    } catch (e) { setError((e as Error).message); }
    finally { setTesting(false); }
  };
  return <dialog ref={dialog} className="model-settings-dialog" onCancel={e => { e.preventDefault(); if (!testing) onClose(); }}>
    <header><div><h2>连接模型</h2><p>{isDemo ? "浏览器直连你选择的服务商，配置保存在本地浏览器。" : "选择服务商，配置保存在本地浏览器。"}</p></div><button className="icon-button" aria-label="关闭模型设置" disabled={testing} onClick={onClose}><X size={20} /></button></header>
    <form onSubmit={e => { e.preventDefault(); try { onSave(normalized(), selected); } catch (e) { setError((e as Error).message); } }}>
      <label>服务商<select value={selected} disabled={testing} onChange={e => { setSelected(e.target.value); setDraft(presetConnection(e.target.value)); setNotice(""); setError(""); }}>{Object.keys(presets).map(p => <option key={p}>{p}</option>)}</select></label>
      <label>API Key<input type="password" required autoComplete="off" value={draft.api_key} disabled={testing} onChange={e => update({ api_key: e.target.value })} placeholder="输入服务商的 API Key" /></label>
      <label>模型 ID<input required value={draft.model} disabled={testing} onChange={e => update({ model: e.target.value })} placeholder="填写账户可用的准确模型名称" /></label>
      {presets[selected].note && <p className="provider-note">{presets[selected].note}</p>}
      <details className="connection-advanced" open={selected === "自定义接口" || undefined}><summary>接口地址与高级设置</summary><div>
        <label>接口地址<input type="url" required disabled={testing} value={draft.base_url} onChange={e => update({ base_url: e.target.value })} placeholder="https://your-provider.example/v1" /><small>接受 Base URL 或完整接口地址，自动处理末尾斜杠。</small></label>
        <label>接口协议<select disabled={testing} value={draft.protocol} onChange={e => update({ protocol: e.target.value as Connection["protocol"] })}><option value="chat_completions">OpenAI 兼容 · Chat Completions</option><option value="responses">OpenAI · Responses</option><option value="anthropic">Claude · Messages</option></select></label>
        {draft.protocol === "chat_completions" && <label>长度参数<select disabled={testing} value={draft.token_parameter} onChange={e => update({ token_parameter: e.target.value as Connection["token_parameter"] })}><option value="max_tokens">max_tokens</option><option value="max_completion_tokens">max_completion_tokens</option></select></label>}
        <label>输出上限（tokens）<input type="number" min={256} max={8192} required disabled={testing} value={draft.max_output_tokens} onChange={e => update({ max_output_tokens: Number(e.target.value) })} /></label>
      </div></details>
      <p className="provider-note">{isDemo ? "API Key 与设置明文保存在此浏览器，可随时清除。发送时，当前对话与相关知识直接交给你指定的服务商，不经过 ArchMind 服务器；服务商需允许浏览器跨域访问（CORS）。" : "API Key 与设置保存在此浏览器，可随时清除。发送时配置交给本项目后端调用所选模型；密钥不写入数据库和对话历史。"}</p>
      {presets[selected].docs && <a className="provider-docs" href={presets[selected].docs} target="_blank" rel="noreferrer">查看服务商接入文档 ↗</a>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="connection-success" role="status"><Check size={16} />{notice}</p>}
      <footer><button type="button" className="button" disabled={testing} onClick={() => { try { onClear(); } catch(e) { setError((e as Error).message); } }}>清除本地配置</button><button type="button" className="button" disabled={testing || !draft.api_key.trim() || !draft.model.trim() || !draft.base_url.trim()} onClick={test}>{testing ? <Loader2 size={16} className="spin" /> : <Check size={16} />}测试连接</button><button className="button primary" disabled={testing}>保存配置</button></footer>
    </form>
  </dialog>;
}

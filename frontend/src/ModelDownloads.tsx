import { useState } from "react";
import { Check, Copy, Download, ExternalLink } from "lucide-react";

export type ModelResources = {
  download_url: string; card_url: string; repository: string; license: string; code_url: string;
};

export function ModelDownloads({ resources }: { resources: ModelResources }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const command = resources.repository ? `hf download ${resources.repository} --local-dir ./models/${resources.repository.split("/")[1]}` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(command); setCopied(true); setError(""); }
    catch { setError("无法写入剪贴板，请手动复制下方命令。"); }
  };
  return <section className="knowledge-downloads" aria-label="模型下载与许可">
    <h3><Download size={17} />模型下载与许可</h3>
    <p>{resources.license}</p>
    <div className="model-links">
      <a className="button primary" href={resources.download_url} target="_blank" rel="noreferrer"><Download size={16} />权重下载</a>
      {resources.card_url && <a className="button" href={resources.card_url} target="_blank" rel="noreferrer"><ExternalLink size={16} />模型卡与许可证</a>}
      {resources.code_url && <a className="button" href={resources.code_url} target="_blank" rel="noreferrer">代码仓库 ↗</a>}
    </div>
    {command && <div className="download-command"><div><b>CLI 下载命令</b><button className="text-button" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "已复制" : "复制命令"}</button></div><code>{command}</code>{error && <p role="status">{error}</p>}</div>}
    <small>下载前核对官方协议和硬件要求；受限仓库需要登录并完成访问申请。CLI 命令需先安装 Hugging Face CLI，会下载整个模型仓库。</small>
  </section>;
}

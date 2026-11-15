import { useState } from "react";
import { post } from "./api";
import { isDemo } from "./demo/mode";
import "./sourceMonitor.css";

type Row = Record<string, any>;
export function SourceMonitor({ sources, refresh }: { sources: Row[]; refresh: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const live = sources.filter(s => !s.is_demo && s.name.startsWith("MaaS 官网巡检 · "));
  const enabled = live.filter(s => s.enabled);
  const due = enabled.filter(s => Date.parse(s.next_check_at) < Date.now());
  async function setup() {
    setBusy(true);
    try {
      const result = await post("/monitoring/maas/setup");
      await refresh();
      setMessage(result.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "配置失败，请重试"); }
    finally { setBusy(false); }
  }
  return <section className="source-monitor" aria-label="MaaS 官网监测">
    <div><h2>MaaS 官网监测</h2><p>{isDemo ? "此站展示经核验的资料快照。持续监测需运行完整后端，不在访客浏览器后台抓取。" : "默认每 6 小时检查官方正文；变化保存快照，人工核验后再更新推荐依据。"}</p></div>
    <div className="source-monitor-stats">
      <span><b>{enabled.length}</b> 已启用</span>
      <span><b>{live.filter(s => s.status === "changed").length}</b> 最近发现变化</span>
      <span><b>{live.filter(s => s.status === "failed").length}</b> 抓取失败</span>
      <span><b>{due.length}</b> 待执行</span>
    </div>
    {!isDemo && <><button disabled={busy} onClick={setup}>{busy ? "配置中…" : live.length ? "补齐官方监测来源" : "启用官方来源巡检"}</button><small>需要后台巡检进程持续运行；已暂停的来源会保留暂停设置。抓取成功不代表事实重新审核或 API 实测通过。</small></>}
    {message && <p role="status">{message}</p>}
    <a href="https://github.com/Liqingqing001/ArchMind/actions/workflows/maas-monitor.yml" target="_blank" rel="noreferrer">查看 GitHub 定期巡检报告 ↗</a>
  </section>;
}

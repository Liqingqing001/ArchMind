import { RotateCcw, ExternalLink } from "lucide-react";
const resetDemo = () => {
  void import("./api").then((module) => module.resetDemo());
};
export function DemoBanner() {
  return (
    <aside className="pages-demo-banner" aria-label="公开体验模式">
      <div>
        <b>GitHub Pages 体验版</b>
        <details className="pages-demo-info">
          <summary>体验说明</summary>
          <p>
            公开资料快照 · 可自带 API 直连模型 · 配置与对话保存在本地浏览器。
          </p>
        </details>
      </div>
      <div>
        <a
          href="https://github.com/Liqingqing001/ArchMind"
          target="_blank"
          rel="noreferrer"
        >
          完整源码 <ExternalLink size={12} />
        </a>
        <button onClick={resetDemo}>
          <RotateCcw size={13} />
          重置演示
        </button>
      </div>
    </aside>
  );
}

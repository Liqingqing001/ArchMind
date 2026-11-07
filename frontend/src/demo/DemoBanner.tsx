import { RotateCcw, ExternalLink } from "lucide-react";
const resetDemo = () => {
  void import("./api").then((module) => module.resetDemo());
};
export function DemoBanner() {
  return (
    <aside className="pages-demo-banner" aria-label="公开体验模式">
      <div>
        <b>GitHub Pages 体验版</b>
        <span>公开资料快照 · 对话为静态演示 · 操作仅在此浏览器，不上传</span>
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

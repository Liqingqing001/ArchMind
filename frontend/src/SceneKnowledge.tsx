import { useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { solutionPolicy, matchesSceneTask } from "./solutionFlow";
import type { KnowledgeNavigation } from "./knowledgeNavigation";
type Row = Record<string, any>;
export function SceneKnowledge({
  entities,
  navigation,
  onOpen,
}: {
  entities: Row[];
  navigation: KnowledgeNavigation;
  onOpen: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    scene = solutionPolicy.scenes.find((s) => s.id === selected);
  if (!scene)
    return (
      <section className="panel scene-knowledge">
        <h2>从你要做的事开始</h2>
        <p>先看生产路线、适用条件与知识缺口，再查看有来源的模型和工具资料。</p>
        <div className="knowledge-group-grid">
          {solutionPolicy.scenes.map((s) => (
            <button
              key={s.id}
              className="knowledge-group-card"
              onClick={() => setSelected(s.id)}
            >
              <h3>{s.name}</h3>
              <p>{s.description}</p>
              <footer>
                查看路线与资料
                <ArrowUpRight size={15} />
              </footer>
            </button>
          ))}
        </div>
      </section>
    );
  const taskFor = (entity: Row) => {
    const paths = navigation.nodes
      .filter((n) => n.entity_ids.includes(entity.id))
      .flatMap((n) => n.path);
    const text = (
      entity.name +
      " " +
      entity.description +
      " " +
      paths.join(" ")
    ).toLowerCase();
    return (
      scene.tasks.find((t) => t.terms.includes(entity.name.toLowerCase())) ||
      scene.tasks.find((t) => matchesSceneTask(t, entity, text, paths))
    );
  };
  const relevant = entities.filter(
    (e) => !e.is_demo && e.kind !== "vendor" && taskFor(e),
  );
  const grouped = scene.tasks.map((task) => ({
    task,
    items: relevant.filter((e) => taskFor(e)?.name === task.name),
  }));
  return (
    <section className="panel scene-knowledge">
      <button className="text-button" onClick={() => setSelected(null)}>
        <ArrowLeft size={14} />
        全部场景
      </button>
      <h2>{scene.name}</h2>
      <p>{scene.description}</p>
      <span className="scene-editorial">
        编辑选型指南 · 尚非实测案例，产品事实以实体详情来源为准
      </span>
      <div className="scene-routes">
        {scene.routes.map((route) => (
          <article key={route.name}>
            <h3>{route.name}</h3>
            <p>
              <b>适合：</b>
              {route.when}
            </p>
            <p>{route.steps}</p>
            <p className="scene-boundary">{route.boundary}</p>
          </article>
        ))}
      </div>
      <h3>生成方案前需要了解</h3>
      <p>预算及周期、使用方式、操作经验、产出规模和关键质量要求。</p>
      <h3>目前仍需核验</h3>
      <ul>
        {scene.gaps.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
      <h3>关联知识 · 共用同一份实体资料</h3>
      <div className="scene-task-groups">
        {grouped
          .filter((g) => g.items.length)
          .map(({ task, items }) => (
            <section key={task.name}>
              <h4>{task.name}</h4>
              <div className="scene-entity-links">
                {items.map((e) => (
                  <button key={e.id} onClick={() => onOpen(e.id)}>
                    {e.name}
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            </section>
          ))}
      </div>
      {!relevant.length && (
        <p>当前数据库尚未导入相关资料，可在知识管理中登记真实来源。</p>
      )}
    </section>
  );
}

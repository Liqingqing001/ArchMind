/** Browser-only implementation of the existing API contract. Never calls a model or crawler. */
type Row = Record<string, any>;
export type DemoState = Record<string, any> & {
  entities: Row[];
  facts: Row[];
  categories: Row[];
  links: Row[];
  sources: Row[];
  snapshots: Row[];
  changes: Row[];
  relations: Row[];
  runs: Row[];
  traces: Row[];
  conversations: Row[];
};
const copy = <T>(value: T): T => structuredClone(value);
const stamp = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const fail = (message: string): never => {
  throw new Error(message);
};
const text = (value: unknown, max = 10000): string =>
  typeof value === "string" && value.trim() && value.length <= max
    ? value.trim()
    : fail("请填写有效内容，并检查字段长度");
const url = (value: unknown): string => {
  const raw = text(value, 2000);
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password)
      return raw;
  } catch {
    /* report a useful validation error */
  }
  return fail("请填写不含凭据的公开 HTTPS 地址");
};
const kinds = new Set([
  "vendor",
  "product",
  "model",
  "api",
  "project",
  "framework",
  "cloud",
  "solution",
]);

export function createDemoStore(initial: Row) {
  const state = copy({
    ...initial,
    traces: initial.traces || [],
    conversations: initial.conversations || [],
  }) as DemoState;
  const find = (table: string, key: string): Row =>
    state[table].find((row: Row) => row.id === key) ||
    fail("记录不存在，请刷新或重置演示");
  const active = (eid: string, key?: string) =>
    state.facts.filter(
      (f) => f.entity_id === eid && !f.valid_to && (!key || f.key === key),
    );
  const descendants = (category: string) => {
    const ids = new Set([category]);
    let count = -1;
    while (count !== ids.size) {
      count = ids.size;
      state.categories.forEach((c) => {
        if (ids.has(c.parent_id)) ids.add(c.id);
      });
    }
    return ids;
  };
  const resources = (entity: Row) => {
    const fields = Object.fromEntries(
      active(entity.id).map((f) => [f.key, f.value]),
    );
    if (entity.kind !== "model" || !fields["官方下载入口"]) return null;
    const card = fields["官方模型仓库"] || "";
    let repository = "";
    try {
      const u = new URL(card);
      if (
        u.hostname === "huggingface.co" &&
        /^[\w.-]+\/[\w.-]+$/.test(u.pathname.slice(1))
      )
        repository = u.pathname.slice(1);
    } catch {
      /* no CLI command */
    }
    return {
      download_url: fields["官方下载入口"],
      card_url: card,
      repository,
      license:
        fields["模型卡许可证"] || fields["许可证"] || "使用前核对官方协议",
      code_url: fields["官方代码仓库"] || "",
    };
  };
  const entityView = (
    e: Row,
  ): Row & {
    category_ids: string[];
    fact_count: number;
    model_resources: Row | null;
  } => ({
    ...e,
    category_ids: state.links
      .filter((l) => l.entity_id === e.id)
      .map((l) => l.category_id),
    fact_count: active(e.id).length,
    model_resources: resources(e),
  });
  const citation = (fact: Row) => {
    const e = find("entities", fact.entity_id),
      sn = find("snapshots", fact.snapshot_id),
      s = find("sources", sn.source_id);
    return {
      fact_id: fact.id,
      entity_id: e.id,
      entity_name: e.name,
      entity_kind: e.kind,
      key: fact.key,
      value: fact.value,
      version: fact.version,
      evidence: fact.evidence,
      snapshot_id: sn.id,
      snapshot_hash: sn.content_hash,
      source_id: s.id,
      source_url: s.url,
      source_name: s.name,
      fetched_at: sn.fetched_at,
      valid_from: fact.valid_from,
      is_demo: e.is_demo || s.is_demo,
    };
  };
  const trace = (
    query: string,
    results: Row[],
    caller: string,
    context: Row,
  ) => {
    const row = {
      id: id(),
      query,
      results: copy(results),
      caller,
      request_context: { ...context, simulated: true },
      created_at: stamp(),
    };
    state.traces.unshift(row);
    state.traces = state.traces.slice(0, 100);
    return row;
  };
  const retrieve = (body: Row, caller: string) => {
    const query = text(body.query, 200),
      needle = query.toLowerCase(),
      top = body.top_k ?? (caller === "agent" ? 10 : 30);
    if (!Number.isInteger(top) || top < 1 || top > 30)
      fail("结果数量应在 1 到 30 之间");
    if (body.kind && !kinds.has(body.kind)) fail("实体类型无效");
    const scope = body.category_id ? descendants(body.category_id) : null;
    const includeDemo = body.include_demo ?? caller === "console";
    const results = state.facts
      .filter((f) => !f.valid_to)
      .map(citation)
      .filter(
        (r) =>
          (includeDemo || !r.is_demo) &&
          (!body.entity_ids?.length || body.entity_ids.includes(r.entity_id)) &&
          (!body.kind || r.entity_kind === body.kind) &&
          (!scope ||
            state.links.some(
              (l) => l.entity_id === r.entity_id && scope.has(l.category_id),
            )) &&
          [r.entity_name, r.key, r.value].some((value) =>
            value.toLowerCase().includes(needle),
          ),
      )
      .sort(
        (a, b) =>
          a.entity_name.localeCompare(b.entity_name) ||
          a.key.localeCompare(b.key),
      )
      .slice(0, top);
    const context = {
      entity_ids: body.entity_ids || [],
      category_id: body.category_id || null,
      kind: body.kind || null,
      include_demo: includeDemo,
      top_k: top,
      request_id: body.request_id || null,
    };
    const row = trace(query, results, caller, context);
    return {
      trace_id: row.id,
      method: "keyword",
      caller,
      request_context: row.request_context,
      results,
    };
  };
  const propose = (body: Row, origin = "manual") => {
    find("entities", body.entity_id);
    const sn = find("snapshots", body.snapshot_id),
      source = find("sources", sn.source_id);
    if (source.entity_id !== body.entity_id) fail("快照不属于该实体");
    const key = text(body.key, 120),
      value = text(body.value),
      evidence = text(body.evidence);
    if (!sn.content.includes(evidence))
      fail("证据必须是所选快照的连续原文片段");
    const current = active(body.entity_id, key)[0];
    if (
      body.base_version !== undefined &&
      body.base_version !== (current?.version || 0)
    )
      fail("当前事实版本已变化，请重新提交");
    if (current?.value === value) fail("新值与当前已发布值相同");
    const duplicate = state.changes.find(
      (c) =>
        c.entity_id === body.entity_id &&
        c.key === key &&
        c.new_value === value &&
        c.base_version === (current?.version || 0) &&
        c.status === "pending",
    );
    if (duplicate) return duplicate;
    const row = {
      id: id(),
      entity_id: body.entity_id,
      snapshot_id: sn.id,
      key,
      old_value: current?.value || null,
      new_value: value,
      base_version: current?.version || 0,
      evidence,
      status: "pending",
      risk: /price|cost|价格|费用/i.test(key) ? "high" : "normal",
      origin,
      reviewer: null,
      review_note: "",
      created_at: stamp(),
      reviewed_at: null,
    };
    state.changes.unshift(row);
    return row;
  };
  const summary = (c: Row) => ({
    id: c.id,
    title: c.title,
    revision: c.revision,
    created_at: c.created_at,
    updated_at: c.updated_at,
    message_count: c.messages.length,
    preview: c.messages.at(-1)?.content.slice(0, 100) || "",
  });
  const conversation = (key: string) => {
    const c = find("conversations", key);
    if (c.deleted_at) fail("对话不存在或已删除");
    return c;
  };
  const conversationView = (c: Row) => ({
    ...summary(c),
    messages: c.messages,
  });
  const chat = (body: Row) => {
    const c = conversation(body.conversation_id);
    if (c.revision !== body.revision)
      fail("对话已在另一页面更新，请重新打开后发送");
    const prompt = text(body.messages?.at(-1)?.content, 6000);
    const inputs = [
      ...c.messages
        .filter((m: Row) => m.role === "user")
        .map((m: Row) => m.content),
      prompt,
    ]
      .slice(-4)
      .join(" ")
      .toLowerCase();
    const tokens = new Set(
      inputs.match(/[a-z][a-z0-9_.-]{1,}|[\u3400-\u9fff]{2,}/g) || [],
    );
    for (const keyword of [
      "rag",
      "检索",
      "知识",
      "问答",
      "中文",
      "文档",
      "本地",
      "部署",
      "开源",
      "对话",
      "图像",
      "视频",
      "语音",
      "数据分析",
      "向量",
    ])
      if (inputs.includes(keyword)) tokens.add(keyword);
    const counts: Record<string, number> = {};
    const retrieved = state.facts
      .filter((f) => !f.valid_to)
      .map(citation)
      .filter((r) => !r.is_demo)
      .map((r) => {
        const entity = find("entities", r.entity_id),
          haystack =
            `${r.entity_name} ${entity.description} ${r.key} ${r.value}`.toLowerCase();
        return {
          row: r,
          score: [...tokens].reduce(
            (n, t) =>
              n +
              (haystack.includes(t) ? 3 : 0) +
              (r.entity_name.toLowerCase().includes(t) ? 4 : 0),
            0,
          ),
        };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .filter(({ row }) => {
        counts[row.entity_id] = (counts[row.entity_id] || 0) + 1;
        return counts[row.entity_id] <= 3;
      })
      .slice(0, 12)
      .map(({ row }, i) => ({ ...row, citation_id: `K${i + 1}` }));
    const t = trace(prompt, retrieved, "agent", {
      purpose: "demo_solution_chat",
      method: "ranked_keyword",
      include_demo: false,
      request_id: c.id,
    });
    const citations = retrieved.slice(0, 6);
    const facts = citations
      .map(
        (r) =>
          `- **${r.entity_name} · ${r.key}**：${r.value} [${r.citation_id}]`,
      )
      .join("\n");
    const answer = `> 静态体验模式：未调用大模型。以下内容由已发布资料与固定讲解模板组装，用于体验检索、引用和对话历史。\n\n## 你的需求\n\n${prompt.replace(/[<>]/g, "")}\n\n## 本轮检索到的知识\n\n${facts || "没有找到匹配的已发布事实。可以尝试“企业知识问答”“开源模型”“文档检索”等关键词。"}\n\n## 实施路径（演示建议）\n\n1. 确定数据范围、隐私要求、部署位置与验收问题。\n2. 从上方资料中选择候选组件，打开来源核对版本、许可证与下载条件。\n3. 在完整后端版接入模型，验证检索覆盖率、引用准确性与回答质量。\n4. 采集新资料后先审核再发布，保留方案使用的事实版本。\n\n## 下一步\n\n可以继续追问，或打开“查看知识来源”，再到知识管理的检索记录核对本轮证据。价格、硬件需求和性能仍需依据最新官方资料核验。`;
    const result = {
      answer,
      citations,
      retrieved,
      trace_id: t.id,
      warnings: [
        "静态演示，没有向任何模型供应商发送请求；真实模型连接请使用完整后端版。",
      ],
      model: "静态演示 · 未调用大模型",
    };
    const time = stamp();
    c.messages.push(
      { id: id(), role: "user", content: prompt, created_at: time },
      {
        id: id(),
        role: "assistant",
        content: answer,
        result,
        created_at: time,
      },
    );
    if (c.title === "新对话") c.title = prompt.slice(0, 36);
    c.revision++;
    c.updated_at = time;
    return { ...result, conversation: conversationView(c) };
  };
  const request = (method: string, input: string, body: Row = {}): any => {
    const parsed = new URL(input, "https://demo.invalid"),
      path = parsed.pathname,
      params = parsed.searchParams;
    let match: RegExpMatchArray | null;
    if (method === "GET" && path === "/config")
      return {
        auth_enabled: false,
        search: "keyword",
        llm_configured: false,
        chat_available: true,
        model_configuration: "demo",
        version: "0.2.0-demo",
        agent_retrieval: true,
        knowledge_token_configured: false,
        demo: true,
      };
    if (method === "GET" && path === "/overview")
      return {
        entities: state.entities.length,
        sources: state.sources.length,
        facts: state.facts.filter((f) => !f.valid_to).length,
        pending: state.changes.filter((c) => c.status === "pending").length,
        failed: 0,
        snapshots: state.snapshots.length,
        categories: state.categories.length,
        demo_entities: state.entities.filter((e) => e.is_demo).length,
        kinds: [...kinds].map((kind) => ({
          kind,
          count: state.entities.filter((e) => e.kind === kind).length,
        })),
        recent_runs: state.runs.slice(0, 5),
      };
    if (path === "/categories") {
      if (method === "GET") return state.categories;
      if (method === "POST") {
        if (body.parent_id) find("categories", body.parent_id);
        const row = {
          id: id(),
          name: text(body.name, 120),
          parent_id: body.parent_id || null,
        };
        state.categories.push(row);
        return row;
      }
    }
    if (path === "/entities" && method === "GET")
      return state.entities
        .map(entityView)
        .filter(
          (e) =>
            (!params.get("q") ||
              `${e.name} ${e.description}`
                .toLowerCase()
                .includes(params.get("q")!.toLowerCase())) &&
            (!params.get("kind") || e.kind === params.get("kind")) &&
            (!params.get("category_id") ||
              e.category_ids.some((k) =>
                descendants(params.get("category_id")!).has(k),
              )),
        );
    if (
      (path === "/entities" && method === "POST") ||
      ((match = path.match(/^\/entities\/([^/]+)$/)) && method === "PUT")
    ) {
      const editing = method === "PUT",
        key = editing ? path.split("/")[2] : id();
      const links = [...new Set<string>(body.category_ids || [])];
      links.forEach((k) => find("categories", k));
      if (!kinds.has(body.kind)) fail("实体类型无效");
      const row = {
        ...(editing
          ? find("entities", key)
          : { id: key, created_at: stamp(), is_demo: true }),
        name: text(body.name, 200),
        kind: body.kind,
        description: body.description || "",
        website: body.website ? url(body.website) : "",
      };
      if (editing)
        state.entities[state.entities.findIndex((e) => e.id === key)] = row;
      else state.entities.push(row);
      state.links = state.links
        .filter((l) => l.entity_id !== key)
        .concat(links.map((category_id) => ({ entity_id: key, category_id })));
      return row;
    }
    if (method === "GET" && (match = path.match(/^\/entities\/([^/]+)$/))) {
      const e = find("entities", match[1]);
      return {
        ...entityView(e),
        facts: state.facts
          .filter((f) => f.entity_id === e.id)
          .sort((a, b) => a.key.localeCompare(b.key) || b.version - a.version),
        sources: state.sources.filter((s) => s.entity_id === e.id),
        changes: state.changes.filter((c) => c.entity_id === e.id),
        relations: state.relations.filter(
          (r) => r.from_id === e.id || r.to_id === e.id,
        ),
      };
    }
    if (path === "/relations" && method === "POST") {
      find("entities", body.from_id);
      find("entities", body.to_id);
      if (body.from_id === body.to_id) fail("不能关联实体自身");
      if (
        state.relations.some(
          (r) =>
            r.from_id === body.from_id &&
            r.to_id === body.to_id &&
            r.relation === body.relation,
        )
      )
        fail("关联已经存在");
      const row = {
        id: id(),
        from_id: body.from_id,
        to_id: body.to_id,
        relation: text(body.relation, 80),
      };
      state.relations.push(row);
      return row;
    }
    if (path === "/sources" && method === "GET") return state.sources;
    if (path === "/sources" && method === "POST") {
      find("entities", body.entity_id);
      const interval = Number(body.interval_hours || 24);
      if (!Number.isInteger(interval) || interval < 1 || interval > 8760)
        fail("巡检周期应为 1 到 8760 小时");
      const row = {
        id: id(),
        entity_id: body.entity_id,
        name: text(body.name, 200),
        url: url(body.url),
        source_type: body.source_type || "web",
        interval_hours: interval,
        enabled: false,
        is_demo: true,
        status: "never",
        last_checked_at: null,
        next_check_at: stamp(),
      };
      state.sources.push(row);
      return row;
    }
    if (method === "PATCH" && (match = path.match(/^\/sources\/([^/]+)$/))) {
      const row = find("sources", match[1]);
      if (typeof body.enabled === "boolean") row.enabled = body.enabled;
      if (body.interval_hours !== undefined) {
        if (
          !Number.isInteger(body.interval_hours) ||
          body.interval_hours < 1 ||
          body.interval_hours > 8760
        )
          fail("无效巡检周期");
        row.interval_hours = body.interval_hours;
      }
      return row;
    }
    if (path.match(/^\/sources\/[^/]+\/collect$/))
      fail("Pages 体验版不执行联网巡检，请在完整后端版启动采集器。");
    if (method === "GET" && path === "/runs") return state.runs;
    if (method === "GET" && path === "/snapshots")
      return state.snapshots
        .filter(
          (s) =>
            !params.get("source_id") || s.source_id === params.get("source_id"),
        )
        .map(({ content: _content, raw_content: _raw, ...s }) => s);
    if (method === "GET" && (match = path.match(/^\/snapshots\/([^/]+)$/))) {
      const row = find("snapshots", match[1]);
      return { ...row, source: find("sources", row.source_id) };
    }
    if (method === "GET" && path === "/changes")
      return state.changes.filter(
        (c) => !params.get("status") || c.status === params.get("status"),
      );
    if (method === "POST" && path === "/changes") return propose(body);
    if (
      method === "POST" &&
      (match = path.match(/^\/changes\/([^/]+)\/review$/))
    ) {
      const c = find("changes", match[1]);
      if (c.status !== "pending") fail("该变更已处理");
      if (!["approved", "rejected"].includes(body.decision))
        fail("无效审核结果");
      const current = active(c.entity_id, c.key)[0];
      if (body.decision === "approved") {
        if ((current?.version || 0) !== c.base_version)
          fail("候选版本过期，请重新提交");
        const time = stamp();
        if (current) current.valid_to = time;
        state.facts.push({
          id: id(),
          entity_id: c.entity_id,
          key: c.key,
          value: c.new_value,
          version: c.base_version + 1,
          snapshot_id: c.snapshot_id,
          evidence: c.evidence,
          valid_from: time,
          valid_to: null,
          change_id: c.id,
        });
      }
      Object.assign(c, {
        status: body.decision,
        reviewer: "本地体验操作",
        review_note: body.note || "",
        reviewed_at: stamp(),
      });
      return c;
    }
    if (
      method === "POST" &&
      (match = path.match(/^\/facts\/([^/]+)\/restore$/))
    ) {
      const f = find("facts", match[1]);
      return propose(
        {
          entity_id: f.entity_id,
          snapshot_id: f.snapshot_id,
          key: f.key,
          value: f.value,
          evidence: f.evidence,
        },
        "restore",
      );
    }
    if (method === "GET" && path === "/search")
      return retrieve({ query: params.get("q") }, "console");
    if (method === "POST" && path === "/knowledge/retrieve")
      return retrieve(body, "agent");
    if (method === "GET" && path === "/traces")
      return state.traces
        .filter(
          (t) => !params.get("caller") || t.caller === params.get("caller"),
        )
        .slice(0, 30)
        .map(({ results, ...t }) => ({ ...t, result_count: results.length }));
    if (method === "GET" && (match = path.match(/^\/traces\/([^/]+)$/)))
      return find("traces", match[1]);
    if (path === "/agent/test")
      fail("公开体验版不接收 API Key，不连接模型服务；请使用完整后端版。");
    if (method === "POST" && path === "/agent/chat") return chat(body);
    if (path === "/conversations") {
      if (method === "GET")
        return state.conversations
          .filter((c) => !c.deleted_at)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
          .map(summary);
      if (method === "POST") {
        const time = stamp(),
          c = {
            id: id(),
            title: text(body.title || "新对话", 120),
            revision: 0,
            created_at: time,
            updated_at: time,
            deleted_at: null,
            messages: [],
          };
        state.conversations.push(c);
        return conversationView(c);
      }
    }
    if ((match = path.match(/^\/conversations\/([^/]+)(\/restore)?$/))) {
      const key = match[1];
      if (method === "POST" && match[2]) {
        const c = find("conversations", key);
        c.deleted_at = null;
        c.updated_at = stamp();
        return conversationView(c);
      }
      const c = conversation(key);
      if (method === "GET") return conversationView(c);
      if (method === "PATCH") {
        c.title = text(body.title, 120);
        c.updated_at = stamp();
        return summary(c);
      }
      if (method === "DELETE") {
        c.deleted_at = stamp();
        c.revision++;
        return { ok: true };
      }
    }
    return fail("该操作不属于 Pages 演示范围，请在完整后端版体验");
  };
  return {
    request: (method: string, path: string, body?: Row) => {
      const previous = copy(state);
      try {
        return copy(request(method, path, body));
      } catch (error) {
        Object.assign(state, previous);
        throw error;
      }
    },
    exportState: () => copy(state),
  };
}

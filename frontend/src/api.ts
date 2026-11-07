let token = "";
export function setToken(value: string) {
  token = value;
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401) {
    window.dispatchEvent(new Event("unauthorized"));
    throw new Error("需要有效的管理口令");
  }
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "输入无效，请检查必填字段和地址格式",
    );
  return body;
}
export const post = (path: string, body?: unknown) =>
  api(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
export const kinds: Record<string, string> = {
  vendor: "厂商与组织",
  product: "应用与产品",
  model: "AI 模型",
  api: "API 服务",
  project: "开源项目",
  framework: "技术框架",
  cloud: "云基础设施",
  solution: "行业方案",
};
export const states: Record<string, string> = {
  pending: "待审核",
  approved: "已发布",
  rejected: "已驳回",
  never: "待首次巡检",
  changed: "发现变化",
  unchanged: "无变化",
  failed: "巡检失败",
  running: "巡检中",
};
export const time = (s?: string) =>
  s
    ? new Date(s).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "尚未检查";

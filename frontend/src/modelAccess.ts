/** Download availability and license are separate from a model's capabilities. */
export function modelAccess(resources?: { license?: string } | null) {
  if (!resources) return null;
  const permissive =
    /^(?:Apache(?:[ -]License)?[ -]?2\.0|MIT|BSD[ -]?[23](?:[ -]Clause)?)\b/i.test(
      (resources.license || "").trim(),
    );
  return {
    id: permissive ? "open_source" : "open_weights",
    label: permissive ? "开源模型" : "开放权重",
    note: permissive
      ? "已登记开放许可与官方下载入口；部署前仍需核对模型卡、硬件与完整协议。"
      : "可下载权重，但不等于无条件开源或可商用；请核对专用协议与使用限制。",
  };
}

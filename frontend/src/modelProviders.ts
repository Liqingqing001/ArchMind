export type Connection = {
  base_url: string; api_key: string; model: string;
  protocol: "chat_completions" | "responses" | "anthropic";
  token_parameter: "max_tokens" | "max_completion_tokens";
  max_output_tokens: number;
};
type Preset = Omit<Connection, "api_key"> & { note?: string; docs: string };
const compatible = { protocol: "chat_completions", token_parameter: "max_tokens", max_output_tokens: 2400 } as const;
export const presets: Record<string, Preset> = {
  DeepSeek: { ...compatible, base_url: "https://api.deepseek.com", model: "deepseek-flash", docs: "https://api-docs.deepseek.com/" },
  OpenAI: { ...compatible, protocol: "responses", base_url: "https://api.openai.com/v1", model: "", docs: "https://developers.openai.com/api/docs/guides/text" },
  "Claude / Anthropic": { ...compatible, protocol: "anthropic", base_url: "https://api.anthropic.com/v1", model: "", docs: "https://platform.claude.com/docs/en/api/messages" },
  "Google Gemini": { ...compatible, base_url: "https://generativelanguage.googleapis.com/v1beta/openai", model: "", docs: "https://ai.google.dev/gemini-api/docs/openai", note: "使用 Gemini 的 OpenAI 兼容接口，填写你账户可用的文本模型 ID。" },
  "阿里云百炼": { ...compatible, base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "", docs: "https://help.aliyun.com/zh/model-studio/base-url", note: "默认北京按量付费地址；请按自己的地域、业务空间或 Coding Plan 修改地址。" },
  "硅基流动": { ...compatible, base_url: "https://api.siliconflow.cn/v1", model: "", docs: "https://docs.siliconflow.cn/docs/userguide/quickstart" },
  "豆包 / 火山方舟": { ...compatible, base_url: "https://ark.cn-beijing.volces.com/api/v3", model: "", docs: "https://docs.volcengine.com/docs/ark/compatible-with-openai-sdk", note: "填写已开通的模型 ID 或推理接入点 ID；Coding Plan 请改用专属地址。" },
  OpenRouter: { ...compatible, base_url: "https://openrouter.ai/api/v1", model: "", docs: "https://openrouter.ai/docs/quickstart", note: "模型 ID 通常包含发布组织前缀，例如厂商名/模型名。" },
  Mistral: { ...compatible, base_url: "https://api.mistral.ai/v1", model: "", docs: "https://docs.mistral.ai/api/endpoint/chat" },
  "自定义接口": { ...compatible, base_url: "", model: "", docs: "", note: "支持公开 HTTPS 服务，可选择 Chat Completions、Responses 或 Claude Messages 协议。" },
};
export function presetConnection(provider: string): Connection {
  const { docs: _docs, note: _note, ...values } = presets[provider];
  return { ...values, api_key: "" };
}

# MaaS 方案与官方来源监测

核验日：2026-11-15。此次围绕业务方案补充 8 家厂商、17 个 API 方案、85 条带来源的编辑条目，沿用同一知识库、会话与审核机制。不是全市场穷尽清单，也不是模型效果榜。

## 官方能力地图

| 厂商 | 本次核对的模型/方案 | 方案选择要点 | 官方资料 |
| --- | --- | --- | --- |
| 火山引擎 / 方舟 | 豆包实时语音、Seedream 5.0 系列、Seedance 2.5 | 实时语音、图片和视频使用不同 API；方舟模型清单不能代替语音产品开通条件 | [实时语音](https://docs.volcengine.com/docs/doubao-voice/end-to-endreal-time-speech-large-model-api-access-document?lang=en)、[生图](https://docs.volcengine.com/docs/ark/image-generation-api?lang=en)、[视频](https://docs.volcengine.com/docs/ark/seedance-2-5?lang=en) |
| 阿里云百炼 | Qwen3.8-Omni-Flash-Realtime、Qwen-Image / Wan 图片、万相 3.0 视频 | 实时 WebSocket 与异步视频任务分开；模型、业务空间、地域和 Key 要对应 | [实时](https://help.aliyun.com/zh/model-studio/realtime)、[图片](https://help.aliyun.com/zh/model-studio/image-model/)、[视频](https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference) |
| 腾讯云 | TRTC AI 对话、Hy-ASR-3.0-preview、TokenHub Hy-Image-3.0 / 3.5-preview | TRTC 是 ASR/LLM/TTS 编排；ASR 内测资格和图片 preview 状态单独核验 | [对话](https://cloud.tencent.com/document/product/647/108514)、[ASR](https://cloud.tencent.com/document/product/1093/135476)、[图片](https://intl.cloud.tencent.com/zh/document/product/1300/83707) |
| 智谱 | GLM-Image、GLM-OCR 与知识检索 | 图片生成、文档识别和检索各自选型；本轮未确认实时语音服务可用性，不补写旧版型号 | [生图](https://docs.bigmodel.cn/cn/guide/models/image-generation/glm-image)、[官方目录](https://docs.bigmodel.cn/llms.txt) |
| OpenAI | GPT-Live-1、GPT-Realtime-2.1、GPT Image 2.6 | 对话、翻译、转写、图片分型；关注旧模型弃用状态 | [模型目录](https://developers.openai.com/api/docs/models) |
| Google | Gemini 3.8 Live、Nano Banana 2.1 / Pro | Live、TTS、Transcribe 和图片输出不是同一能力 | [模型目录](https://aistudio.google.com/docs/models) |
| AWS | Nova 2 Sonic | 双向音频、工具与 RAG；本次引用 Nova 2 指南，不声称是最新型号，其列示语言不含中文 | [语音指南](https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-conversational-speech.html) |
| Anthropic | Claude Opus / Sonnet / Haiku 5.5、Fable 5.2 | 所查总览为文字/图片输入、文字输出；语音和生图需外接能力 | [模型目录](https://platform.claude.com/docs/en/models/overview) |

知识浏览 → 按能力浏览 → **MaaS方案 → 能力 → 厂商 → 方案**。原有模型分类、开源权重和下载资料仍共用原实体。新条目按 API 方案建模，不冒充已接入的音视频运行工具。

每个方案记录：模型与能力、接入方式、选型边界、明确标为编辑归纳的方案建议、核验范围。官方短摘录只是页面定位证据，不是完整网页副本；方案设计建议不是厂商承诺。火山实时语音完整页面读取受限，本次仅依据官方索引/检索片段，已在条目中标出。

## 对话应怎样生成方案

新增实时语音能力识别和三候选比较；纯 ASR、TTS 不会作为原生实时语音候选。实时语音和 ASR→LLM→TTS 编排都会明确类型。每个候选带型号、接入方式、边界和实施建议，最多 12 条引用；离线约束排除云 API。

对于“哪个更好”，先问地域、语言、并发、预算、数据出境要求、能否打断、是否要调业务工具，再给 POC 验收指标。当前资料没有相同负载的性能实测，不能据此给效果排名或最低价保证。

核价须保存地域、币种、日期、计量单位、模型版本及用量：语音还需考虑通道/ASR/LLM/TTS，图片需考虑尺寸/张数/失败重做，视频需考虑输入与输出秒数/分辨率。缺这些条件时只给费用构成，不编月费。

## 两种持续监测

**GitHub 定期报告**：`maas-monitor.yml` 在主分支每 6 小时运行一次，也支持手动触发；计划时间为 UTC 00:23 / 06:23 / 12:23 / 18:23（北京时间 08:23 / 14:23 / 20:23 / 次日 02:23）。Actions 可能排队延迟。每个不同 URL 只读取一次，保存摘要报告及成功正文哈希，区分首次基线、未变、变化和失败。缓存清除后重新建立基线。报告保存 30 天，可从数据来源页进入 Actions 查看。此工作流不读取数据库、模型密钥或用户会话，不自动修改已发布事实。运行需仓库允许 Actions；不活跃仓库的定时任务可能由 GitHub 停用。

**完整后端**：在“知识管理 → 数据来源”点击“启用官方来源巡检”，或运行：

```powershell
cd backend
$env:VIRTUAL_ENV = (Resolve-Path .venv).Path
$env:PYTHONUTF8 = '1'
py -m app.maas_monitor --apply --check-once
py -m app.worker
```

只启动一个 worker。新增来源默认每 6 小时检查，可在来源列表调整周期或暂停。重复配置保留用户的暂停与周期。直播页面快照和历史编辑摘录分开，避免把首次抓取和短摘录比较误当成产品升级。首次成功抓取建立原文基线；后续正文变化保存新快照，管理员核对原文后提交事实候选并审核。HTTP 失败、重定向和动态网页不会被宣称为模型下线。

GitHub Pages 不能常驻运行采集器；其前端显示静态资料和巡检报告入口，后台监测统计只表示当前后端来源状态。GitHub 报告与本地数据库不会自动同步。将来部署全天在线后端后，才可把采集、候选抽取、审核与发布接成一个服务。

## 项目下一步

1. **最高优先级：可复用的方案结构**。在已有需求摘要基础上保存业务目标、组件拓扑、模型版本、接口、限制、费用项、POC 指标和备选方案，避免只保存一段聊天文本。
2. **检索质量**。本次补齐实时语音回归场景；继续扩展跨厂商、否定约束、地域/语言、模型退役和混合模态用例，再考虑混合检索。模型多不代表推荐准。
3. **价格和生命周期版本化**。为价格提供结构化单位/币种/地域/有效日，为预览、开放、弃用、下线分别建字段。当前数据只能辅助选型，不提供账单精算。
4. **变化处理效率**。监测发现正文变化后按模型、价格、权限、退役分类，形成可审核差异；RSS/更新日志优先。动态网页仍需人工或专门适配器，本轮未绕过登录或反爬。
5. **真实评测**。建立固定音频、图片、文档样本，用户授权测试调用后记录延迟、成功率和成本。当前“官网已核对”与“接口已实测”保持分开。

## 本轮验证

- 后端：97 通过、1 项 PostgreSQL 专项用例在未配置测试库的本机跳过；SQLite 回归包含来源启用幂等、暂停保留、原文与编辑摘录隔离、失败保留旧基线、实时语音三候选和离线约束。
- 前端：全部 `test:demo` 通过，普通构建与 Pages 构建通过。独立无登录浏览器检查知识目录及监测区，390px 手机视口无横向溢出。
- 本机实际访问 15 个不同官方 URL：14 个建立基线，Google 文档 1 个抓取失败；抓取状态与前述通过检索工具核对的资料分开记录。没有调用收费模型 API。
- 本地数据库已先备份再导入 17 个新实体、85 条事实和 17 个监测来源；持续巡检需启动 worker，GitHub 巡检报告由独立工作流执行。

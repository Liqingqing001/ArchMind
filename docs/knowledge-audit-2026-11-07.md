# 知识库全量审查 · 2026-11-07

基线 `b1822ccade66`：逐项审查原有 **140 个真实实体、305 条事实、85 个来源 URL**，另检查 20 个 Hub 仓库的元数据和文件列表。虚构 Atlas 单独排除。新增 **26 个实体**；当前公开资料为 **166 个真实实体、453 条事实**。

这是一轮有边界的全量存量审查，不是覆盖全互联网，也不声称所有字段均完备或所有 API 已实测。HTTP 成功、出现型号名称、模型卡公开，分别不能证明事实准确、能力归属或权重可直接下载。

字段结论：needs_stronger_excerpt 17；retained 228；evidence_repaired 49；corrected 8；official_index_only 3。`retained` 仅确认现有描述的范围；`needs_stronger_excerpt` 明确保留补证项。

机器可读清单：[审查记录](../backend/data/audits/2026-11-07.json)，包含原值、当前值、字段结论、证据、来源检查、Hub 状态与各实体待补项。

## 优先处理的实际问题

- Sora 2 / Videos API 已于 2026-09-24 关闭；旧的 Legacy 标签不足以说明接入状态。[官方型号页](https://developers.openai.com/api/docs/models/sora-2-pro)。
- 混元旧平台停止新购，新增服务需转 TokenHub；历史型号参数不自动等于新账号可调用。[官方说明](https://cloud.tencent.com/document/product/1729/104753)。
- 补千问当前 API 型号、Kimi K3.1、GLM 文本与多模态型号，明确 API、开放权重及历史版本的差别。
- 原“理解视频”为空，补入官方确认的视频理解型号，并让同一实体同时归入多个能力分支。
- 开放权重用途不再只引用仓库名称；补下载门槛及 20 项实际选型边界。FLUX.1-dev 的权重与生成结果商业条件分开说明。
- 14 个软件条目补发布记录。LangGraph 区分核心包和 SDK/CLI；vLLM 的 rc 标签即使 prerelease=false 仍按候选版本处理。
- 修复 Qdrant 旧文档入口；Kimi K2 展示页改用官方 README；Liblib 与 Google 的索引核验单独标记。

## 各领域覆盖与仍缺的内容

| 领域 | 本轮处理 | 仍需补齐 |
| --- | --- | --- |
| 文字生成与推理 | 核对各厂商已有型号；补当前千问、Kimi、GLM、Gemini | 按任务的实测效果、延迟、账户价格与区域 |
| 图片生成 | 核对 GPT Image、Nano Banana、Seedream、FLUX 等；补 Image 2.6 / GLM-Image | 参考图、文字还原、编辑约束与授权实测 |
| 视频生成 | 核对 MiniMax、Seedance、Kling、Veo、Sora；补 Omni / CogVideoX | 多镜头一致性、生成成功率、每条有效成片成本；Kling 最新目录直查受阻 |
| 声音生成与理解 | 核对现有 TTS / Whisper / CosyVoice；补 GLM、Gemini、Seed 专项模型 | 目标方言、克隆授权、实时延迟和分离质量评测 |
| 图片／视频／文档理解 | 补视频理解分类、GLM-OCR 及型号差异 | OCR 版式指标、时序定位与业务样本误差 |
| 嵌入与排序 | 核对各模型用途、维度和排序阶段 | 中文业务集召回率、阈值与迁移成本 |
| 工作流与知识工程 | 核对 ComfyUI、Dify、LangGraph、LlamaIndex，补 RAGFlow / Ragas | 可复现 PoC、依赖矩阵与量化评测 |
| 数据库与检索 | 核对 Milvus、Qdrant，补 pgvector | 数据规模、备份、混合检索配置与基准 |
| GPU 租赁与推理服务 | 逐项复核 23 个服务的计费、停机、存储和权限边界 | 实时库存、区域、具体机型、完整订单报价 |
| 应用与行业方案 | 核对已有产品功能和新客限制 | 真实案例、适用行业、成效指标和数据条款；官网定位不冒充验证方案 |
| 厂商与组织 | 检查全部业务概述与已有产品关系 | 多数旧短摘录不能单独证明主体与全部归属，已逐项留补证 |

## 原有实体逐项结果

下表覆盖原有每个真实实体。字段细节及原值／新值见 JSON；“待补”描述资料缺口，不代表产品不支持。

### official-knowledge-2026-11-07.json

| 实体 | 原事实→当前事实 | 本轮处理 | 待补／边界 |
| --- | --- | --- | --- |
| [OpenAI](https://developers.openai.com/api/docs/models/all) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [Anthropic](https://platform.claude.com/docs/en/models/overview) | 1→1 | retained×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [Google](https://ai.google.dev/gemini-api/docs/video) | 1→1 | evidence_repaired×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [阿里云](https://help.aliyun.com/zh/model-studio/what-is-model-studio) | 1→1 | corrected×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [字节跳动 Seed](https://seed.bytedance.com/en/models) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [DeepSeek](https://api-docs.deepseek.com/) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [智谱 AI](https://docs.bigmodel.cn/cn/guide/start/introduction) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [MiniMax](https://platform.minimax.io/docs/guides/models-intro) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [月之暗面 Moonshot AI](https://github.com/MoonshotAI/Kimi-K2/blob/main/README.md) | 1→1 | evidence_repaired×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [腾讯](https://cloud.tencent.com/document/product/1729/104753) | 1→2 | needs_stronger_excerpt×1；新增：接入状态 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [百度](https://cloud.baidu.com/product-s/qianfan_home) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [快手](https://ir.kuaishou.com/news-releases/news-release-details/kuaishou-technology-announces-fourth-quarter-and-full-year-2025/) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [Mistral AI](https://docs.mistral.ai/models) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [Black Forest Labs](https://docs.bfl.ai/quick_start/introduction) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [AWS](https://aws.amazon.com/documentation-overview/bedrock/) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [Microsoft](https://learn.microsoft.com/en-us/azure/ai-foundry/what-is-azure-ai-foundry) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [NVIDIA](https://docs.api.nvidia.com/nim/docs/introduction) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [Hugging Face](https://huggingface.co/docs/datasets/index) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [LangChain](https://docs.langchain.com/oss/python/langgraph/overview) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [LlamaIndex](https://developers.llamaindex.ai/home/) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [Adobe](https://www.adobe.com/products/firefly.html) | 1→1 | needs_stronger_excerpt×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [Zilliz](https://milvus.io/docs/overview.md) | 1→1 | retained×1 | 补组织主体及旗下产品关系证据；选型应落到具体型号或服务，厂商概述不参与 Agent 推荐。 |
| [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) | 1→2 | evidence_repaired×1；新增：API 模型名 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) | 1→2 | evidence_repaired×1；新增：API 模型名 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra) | 1→2 | evidence_repaired×1；新增：API 模型名 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) | 1→2 | evidence_repaired×1；新增：API 模型名 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2) | 2→2 | retained×2 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [text-embedding-3-small](https://developers.openai.com/api/docs/models/all) | 1→1 | retained×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Claude Fable 5.1](https://platform.claude.com/docs/en/models/overview) | 2→2 | retained×2 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Claude Opus 5.5](https://platform.claude.com/docs/en/models/overview) | 2→2 | retained×2 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Claude Sonnet 5.5](https://platform.claude.com/docs/en/models/overview) | 2→2 | retained×2 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Claude Haiku 5.5](https://platform.claude.com/docs/en/models/overview) | 2→2 | retained×2 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [DeepSeek-V4.1-Flash-1017](https://api-docs.deepseek.com/) | 2→2 | retained×2 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [DeepSeek API](https://api-docs.deepseek.com/) | 2→3 | retained×2；新增：别名迁移 | 补账户实际模型权限、速率限制、计费单位及失败重试；文档核对不等于实际付费调用成功。 |
| [GLM 系列](https://docs.bigmodel.cn/cn/guide/start/introduction) | 2→2 | retained×2 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [智谱开放平台](https://docs.bigmodel.cn/cn/guide/start/introduction) | 1→2 | evidence_repaired×1；新增：接入方式 | 补账户实际模型权限、速率限制、计费单位及失败重试；文档核对不等于实际付费调用成功。 |
| [Qwen 系列](https://qwenlm.github.io/blog/qwen3/) | 1→1 | retained×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Qwen3-235B-A22B](https://qwenlm.github.io/blog/qwen3/) | 2→2 | retained×2 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Qwen3-30B-A3B](https://qwenlm.github.io/blog/qwen3/) | 1→1 | evidence_repaired×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [text-embedding-v4](https://help.aliyun.com/en/model-studio/embedding-rerank-model/) | 1→1 | evidence_repaired×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Qwen3-VL-Embedding](https://help.aliyun.com/en/model-studio/embedding-rerank-model/) | 1→1 | evidence_repaired×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Qwen3-Rerank](https://help.aliyun.com/en/model-studio/embedding-rerank-model/) | 1→1 | evidence_repaired×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [MiniMax-M3.1-Flash](https://platform.minimax.io/docs/guides/models-intro) | 2→2 | retained×2 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [MiniMax-M3](https://platform.minimax.io/docs/guides/models-intro) | 2→2 | evidence_repaired×1、retained×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [MiniMax-H3](https://platform.minimax.io/docs/guides/models-intro) | 2→3 | retained×2；新增：输出规格 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [MiniMax speech-2.8-hd](https://platform.minimax.io/docs/guides/models-intro) | 1→2 | evidence_repaired×1；新增：控制能力 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [MiniMax speech-2.8-turbo](https://platform.minimax.io/docs/guides/models-intro) | 1→2 | evidence_repaired×1；新增：控制能力 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Kimi K2](https://github.com/MoonshotAI/Kimi-K2/blob/main/README.md) | 2→2 | evidence_repaired×2 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Hunyuan-A13B](https://cloud.tencent.com/document/product/1729/104753) | 2→3 | evidence_repaired×2；新增：接入状态 | 核对 TokenHub 当前可开通型号、迁移参数、账户计费与配额；旧平台不再新购。 |
| [Tencent HY Vision 1.5 Instruct](https://cloud.tencent.com/document/product/1729/104753) | 1→2 | evidence_repaired×1；新增：接入状态 | 核对 TokenHub 当前可开通型号、迁移参数、账户计费与配额；旧平台不再新购。 |
| [Hunyuan Translation](https://cloud.tencent.com/document/product/1729/104753) | 1→2 | evidence_repaired×1；新增：接入状态 | 核对 TokenHub 当前可开通型号、迁移参数、账户计费与配额；旧平台不再新购。 |
| [ERNIE 5.0](https://cloud.baidu.com/product-s/qianfan_home) | 2→2 | retained×2 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Seedance 系列](https://seed.bytedance.com/en/models) | 1→1 | evidence_repaired×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Seedance 2.0](https://seed.bytedance.com/en/blog/seedance-2-0-official-launch) | 1→1 | retained×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Seedance 2.5](https://seed.bytedance.com/en/models) | 1→1 | retained×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Seedream 5.0 Pro](https://seed.bytedance.com/en/models) | 1→1 | evidence_repaired×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Seed2.1](https://seed.bytedance.com/en/models) | 1→1 | retained×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [可灵 Kling](https://ir.kuaishou.com/news-releases/news-release-details/kuaishou-technology-announces-fourth-quarter-and-full-year-2025/) | 1→1 | retained×1 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [Kling 3.0](https://ir.kuaishou.com/news-releases/news-release-details/kuaishou-technology-announces-fourth-quarter-and-full-year-2025/) | 2→2 | retained×2 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Veo 系列](https://ai.google.dev/gemini-api/docs/video) | 1→1 | evidence_repaired×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Veo 3.1](https://ai.google.dev/gemini-api/docs/video) | 2→2 | evidence_repaired×2 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Nano Banana 2](https://ai.google.dev/gemini-api/docs/image-generation) | 1→1 | evidence_repaired×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Nano Banana Pro](https://ai.google.dev/gemini-api/docs/image-generation) | 1→1 | evidence_repaired×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Nano Banana 2 Lite](https://ai.google.dev/gemini-api/docs/image-generation) | 1→1 | evidence_repaired×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Mistral Large 4](https://docs.mistral.ai/models) | 1→2 | retained×1；新增：权重许可 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Mistral OCR 4.1](https://docs.mistral.ai/models) | 1→1 | retained×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Voxtral Mini Transcribe 3](https://docs.mistral.ai/models) | 1→1 | retained×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Voxtral TTS 3](https://docs.mistral.ai/models) | 1→1 | retained×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [Mistral Small 4](https://docs.mistral.ai/models) | 1→1 | retained×1 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [FLUX 系列](https://docs.bfl.ai/quick_start/introduction) | 2→3 | retained×2；新增：目录范围 | 补实际调用区域、账户权限、单次输入输出上限和计费单位；未在已读官方页面确认的数值不填写。 需要本地部署时另核对权重、完整许可与硬件；API 能力不证明开放权重。 |
| [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview) | 2→4 | retained×2；新增：集成边界、软件发布版本 | 核对目标版本的安装、许可证、驱动与依赖兼容；发布记录不等于已在本项目集成或评测。 |
| [LlamaIndex Framework](https://developers.llamaindex.ai/home/) | 1→3 | retained×1；新增：产品边界、软件发布版本 | 核对目标版本的安装、许可证、驱动与依赖兼容；发布记录不等于已在本项目集成或评测。 |
| [LlamaParse](https://developers.llamaindex.ai/home/) | 1→1 | retained×1 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [Dify](https://docs.dify.ai/en/home) | 2→3 | retained×2；新增：软件发布版本 | 核对目标版本的安装、许可证、驱动与依赖兼容；发布记录不等于已在本项目集成或评测。 |
| [vLLM](https://docs.vllm.ai/en/stable/getting_started/quickstart/) | 1→2 | retained×1；新增：软件发布版本 | 核对目标版本的安装、许可证、驱动与依赖兼容；发布记录不等于已在本项目集成或评测。 |
| [PEFT](https://huggingface.co/docs/hub/peft) | 1→2 | retained×1；新增：软件发布版本 | 核对目标版本的安装、许可证、驱动与依赖兼容；发布记录不等于已在本项目集成或评测。 |
| [Transformers](https://huggingface.co/docs/transformers/index) | 1→2 | retained×1；新增：软件发布版本 | 核对目标版本的安装、许可证、驱动与依赖兼容；发布记录不等于已在本项目集成或评测。 |
| [Datasets](https://huggingface.co/docs/datasets/index) | 2→3 | retained×2；新增：软件发布版本 | 核对目标版本的安装、许可证、驱动与依赖兼容；发布记录不等于已在本项目集成或评测。 |
| [LangSmith](https://docs.langchain.com/langsmith/observability) | 1→1 | retained×1 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [Milvus](https://milvus.io/docs/overview.md) | 1→2 | retained×1；新增：软件发布版本 | 核对目标版本的安装、许可证、驱动与依赖兼容；发布记录不等于已在本项目集成或评测。 |
| [Qdrant](https://qdrant.tech/documentation/search/text-search/text-filtering/) | 2→4 | corrected×2；新增：字段选择、软件发布版本 | 核对目标版本的安装、许可证、驱动与依赖兼容；发布记录不等于已在本项目集成或评测。 |
| [Ollama](https://ollama.com/) | 1→2 | retained×1；新增：软件发布版本 | 核对目标版本的安装、许可证、驱动与依赖兼容；发布记录不等于已在本项目集成或评测。 |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | 1→2 | retained×1；新增：软件发布版本 | 核对目标版本的安装、许可证、驱动与依赖兼容；发布记录不等于已在本项目集成或评测。 |
| [Amazon Bedrock](https://aws.amazon.com/documentation-overview/bedrock/) | 2→2 | retained×2 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [Microsoft Foundry](https://learn.microsoft.com/en-us/azure/ai-foundry/what-is-azure-ai-foundry) | 2→2 | retained×2 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [Gemini Enterprise Agent Platform](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning) | 2→3 | retained×2；新增：训练方式 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [NVIDIA NIM](https://docs.api.nvidia.com/nim/docs/introduction) | 2→3 | retained×2；新增：部署方式 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [腾讯云](https://intl.cloud.tencent.com/zh/products/gpu) | 2→2 | retained×2 | 下单前确认区域、实时库存、显存、磁盘保留及完整订单价；本轮没有登录控制台或购买实例。 |
| [阿里云百炼](https://help.aliyun.com/zh/model-studio/what-is-model-studio) | 2→2 | corrected×2 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [百度千帆](https://cloud.baidu.com/product-s/qianfan_home) | 1→1 | retained×1 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [Gemini Notebook](https://support.google.com/gemininotebook/answer/16215270?hl=en) | 2→2 | retained×2 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [Power BI Copilot](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction) | 2→3 | retained×2；新增：费用边界 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [Adobe Firefly](https://www.adobe.com/products/firefly.html) | 1→1 | evidence_repaired×1 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [Amazon Q Business](https://aws.amazon.com/q/business/) | 2→3 | retained×2；新增：迁移方向 | 核对老客户继续使用与迁移条件；新客户比较 Amazon Quick，不再推荐新开 Q Business。 |
| [Sora 系列](https://developers.openai.com/api/docs/models/sora-2-pro) | 3→4 | corrected×2、retained×1；新增：接入状态 | 已停服，仅保留历史；如需替代，应重新比较当前视频模型，不能直接替换 API。 |
| [Sora 2 Pro](https://developers.openai.com/api/docs/models/sora-2-pro) | 3→4 | retained×2、corrected×1；新增：接入状态 | 已停服，仅保留历史；如需替代，应重新比较当前视频模型，不能直接替换 API。 |

### open-model-knowledge-2026-11-07.json

| 实体 | 原事实→当前事实 | 本轮处理 | 待补／边界 |
| --- | --- | --- | --- |
| [Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、上下文边界 | 补 上下文边界 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [Qwen2.5-Coder-7B-Instruct](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、任务边界 | 补 任务边界 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [Qwen2.5-VL-7B-Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、视觉任务 | 补 视觉任务 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、向量规格 | 补 向量规格 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [Qwen3-Reranker-0.6B](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、检索阶段 | 补 检索阶段 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [Qwen-Image](https://huggingface.co/Qwen/Qwen-Image) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、内容任务 | 补 内容任务 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [DeepSeek-R1-Distill-Qwen-7B](https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、衍生许可 | 补 衍生许可 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [Mistral-7B-Instruct-v0.3](https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、工具调用 | 补 工具调用 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [phi-4](https://huggingface.co/microsoft/phi-4) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、上下文窗口 | 补 上下文窗口 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [Llama-3.1-8B-Instruct](https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、许可边界 | 补 许可边界 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [gemma-3-4b-it](https://huggingface.co/google/gemma-3-4b-it) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、输入模态 | 补 输入模态 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [FLUX.1-schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、采样特点 | 补 采样特点 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [FLUX.1-dev](https://huggingface.co/black-forest-labs/FLUX.1-dev) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、商业使用边界 | 补 商业使用边界 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [stable-diffusion-3.5-medium](https://huggingface.co/stabilityai/stable-diffusion-3.5-medium) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、商业使用边界 | 补 商业使用边界 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [Wan2.1-T2V-1.3B](https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、显存边界 | 补 显存边界 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [Wan2.1-I2V-14B-480P](https://huggingface.co/Wan-AI/Wan2.1-I2V-14B-480P) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、规格边界 | 补 规格边界 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [whisper-large-v3](https://huggingface.co/openai/whisper-large-v3) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、实时边界 | 补 实时边界 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 HF 卡标签 Apache-2.0 与官方代码仓库 MIT 分属不同资料，交付前核对具体制品协议，未据此给出统一商用结论。 |
| [CosyVoice2-0.5B](https://huggingface.co/FunAudioLLM/CosyVoice2-0.5B) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、版本边界 | 补 版本边界 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 下载并固定 CosyVoice2 版本后验证声音效果，不套用同页 3.0 的规格。 |
| [bge-m3](https://huggingface.co/BAAI/bge-m3) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、检索形态 | 补 检索形态 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |
| [bge-reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3) | 4→6 | evidence_repaired×1、retained×3；新增：下载条件、检索阶段 | 补 检索阶段 的业务样本评测；按实际输入长度或尺寸、精度、批量测试资源与速度，未执行权重推理。 |

### video-workflow-knowledge-2026-11-07.json

| 实体 | 原事实→当前事实 | 本轮处理 | 待补／边界 |
| --- | --- | --- | --- |
| [ComfyUI](https://github.com/Comfy-Org/ComfyUI/blob/master/README.md) | 4→5 | retained×4；新增：软件发布版本 | 核对目标版本的安装、许可证、驱动与依赖兼容；发布记录不等于已在本项目集成或评测。 |

### infrastructure-knowledge-2026-11-07.json

| 实体 | 原事实→当前事实 | 本轮处理 | 待补／边界 |
| --- | --- | --- | --- |
| [火山引擎 GPU 云服务器](https://docs.volcengine.com/docs/gpu/billing?lang=zh) | 4→5 | retained×4；新增：续费限制 | 下单前确认区域、实时库存、显存、磁盘保留及完整订单价；本轮没有登录控制台或购买实例。 |
| [OneThingAI](https://onethingai.com/) | 5→5 | retained×5 | 下单前确认区域、实时库存、显存、磁盘保留及完整订单价；本轮没有登录控制台或购买实例。 |
| [AnyGPU 算力云](https://www.anygpu.cn/gpu.html) | 4→4 | retained×4 | 下单前确认区域、实时库存、显存、磁盘保留及完整订单价；本轮没有登录控制台或购买实例。 |
| [AutoDL](https://www.autodl.com/docs/price/) | 5→5 | retained×5 | 下单前确认区域、实时库存、显存、磁盘保留及完整订单价；本轮没有登录控制台或购买实例。 |
| [矩池云](https://www.matpool.com/catalog/pricing) | 5→5 | retained×5 | 下单前确认区域、实时库存、显存、磁盘保留及完整订单价；本轮没有登录控制台或购买实例。 |
| [Featurize](https://docs.featurize.cn/docs/manual/instance-rent) | 5→5 | retained×5 | 下单前确认区域、实时库存、显存、磁盘保留及完整订单价；本轮没有登录控制台或购买实例。 |
| [RunPod GPU Pods](https://docs.runpod.io/pods/storage/types) | 5→5 | retained×5 | 下单前确认区域、实时库存、显存、磁盘保留及完整订单价；本轮没有登录控制台或购买实例。 |
| [Vast.ai](https://docs.vast.ai/guides/instances/pricing) | 5→5 | retained×5 | 下单前确认区域、实时库存、显存、磁盘保留及完整订单价；本轮没有登录控制台或购买实例。 |
| [Lambda GPU Cloud](https://lambda.com/instances) | 4→4 | retained×4 | 下单前确认区域、实时库存、显存、磁盘保留及完整订单价；本轮没有登录控制台或购买实例。 |
| [Modal Serverless](https://modal.com/pricing) | 4→4 | retained×4 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [腾讯云 HAI](https://cloud.tencent.cn/document/product/1721/102027) | 4→4 | retained×4 | 下单前确认区域、实时库存、显存、磁盘保留及完整订单价；本轮没有登录控制台或购买实例。 |
| [阿里云 PAI EAS](https://help.aliyun.com/zh/pai/product-overview/billing-of-eas) | 4→4 | retained×4 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [火山方舟](https://console.volcengine.com/ark/region%3Acn-beijing/docs/online-inference-standard) | 3→3 | retained×3 | 补账户实际模型权限、速率限制、计费单位及失败重试；文档核对不等于实际付费调用成功。 |
| [硅基流动 SiliconFlow](https://siliconflow.cn/pricing) | 4→4 | retained×4 | 补账户实际模型权限、速率限制、计费单位及失败重试；文档核对不等于实际付费调用成功。 |
| [Replicate](https://replicate.com/pricing) | 3→3 | retained×3 | 补账户实际模型权限、速率限制、计费单位及失败重试；文档核对不等于实际付费调用成功。 |
| [Hugging Face Inference Endpoints](https://huggingface.co/docs/inference-endpoints/en/autoscaling) | 3→3 | retained×3 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [RunningHub](https://www.runninghub.cn/runninghub-api-doc-cn/doc-8287334) | 3→3 | retained×3 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [LiblibAI 工作流 API](https://www.liblib.art/apis/workflow) | 3→4 | official_index_only×3；新增：结果留存 | 补当前套餐资格、数据处理条款、地域与费用边界；官网定位不等于适合所有业务。 |
| [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search) | 4→4 | retained×4 | 补账户实际模型权限、速率限制、计费单位及失败重试；文档核对不等于实际付费调用成功。 |
| [博查 Web Search API](https://open.bochaai.com/) | 4→4 | retained×4 | 补账户实际模型权限、速率限制、计费单位及失败重试；文档核对不等于实际付费调用成功。 |
| [Amazon EC2 GPU 实例](https://aws.amazon.com/ec2/instance-types/accelerated-computing/) | 3→3 | retained×3 | 下单前确认区域、实时库存、显存、磁盘保留及完整订单价；本轮没有登录控制台或购买实例。 |
| [Google Cloud GPU](https://docs.cloud.google.com/compute/docs/gpus/about-gpus) | 3→3 | retained×3 | 下单前确认区域、实时库存、显存、磁盘保留及完整订单价；本轮没有登录控制台或购买实例。 |
| [Azure GPU 虚拟机](https://learn.microsoft.com/azure/virtual-machines/sizes-general) | 3→4 | retained×3；新增：训练与推理 | 下单前确认区域、实时库存、显存、磁盘保留及完整订单价；本轮没有登录控制台或购买实例。 |

## 新增条目

| 实体 | 类型 | 官方来源 |
| --- | --- | --- |
| Qwen3.8-Max | model | [资料页](https://help.aliyun.com/zh/model-studio/text-generation-model/) |
| Qwen3.8-Flash | model | [资料页](https://help.aliyun.com/zh/model-studio/text-generation-model/) |
| Qwen3.7-Plus | model | [资料页](https://help.aliyun.com/zh/model-studio/text-generation-model/) |
| Kimi K3.1 Pro | model | [资料页](https://platform.kimi.com/docs/get-api-key) |
| Kimi K3 | model | [资料页](https://platform.kimi.com/docs/get-api-key) |
| GLM-5.3 | model | [资料页](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3) |
| GLM-5.3-Flash | model | [资料页](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash) |
| GLM-5.3-FlashX | model | [资料页](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash) |
| GLM-OCR | model | [资料页](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-ocr) |
| GLM-Image | model | [资料页](https://docs.bigmodel.cn/cn/guide/models/image-generation/glm-image) |
| GLM-ASR-2512 | model | [资料页](https://docs.bigmodel.cn/cn/guide/start/model-overview) |
| GLM-TTS | model | [资料页](https://docs.bigmodel.cn/cn/guide/start/model-overview) |
| CogVideoX-3 | model | [资料页](https://docs.bigmodel.cn/cn/guide/start/model-overview) |
| Gemini 3.8 Flash | model | [资料页](https://ai.google.dev/gemini-api/docs/models?hl=en) |
| Gemini 3.8 Live | model | [资料页](https://ai.google.dev/gemini-api/docs/models?hl=en) |
| Gemini 3.8 Flash TTS | model | [资料页](https://ai.google.dev/gemini-api/docs/models?hl=en) |
| Gemini 3.5 Transcribe | model | [资料页](https://ai.google.dev/gemini-api/docs/models?hl=en) |
| Gemini Omni Flash | model | [资料页](https://ai.google.dev/gemini-api/docs/models?hl=en) |
| SeedRealtime | model | [资料页](https://seed.bytedance.com/en/models) |
| Seed Audio 1.0 | model | [资料页](https://seed.bytedance.com/en/models) |
| Hunyuan TurboS Vision Video | model | [资料页](https://cloud.tencent.com/document/product/1729/104753) |
| pgvector | project | [资料页](https://github.com/pgvector/pgvector/blob/master/README.md) |
| RAGFlow | framework | [资料页](https://github.com/infiniflow/ragflow/blob/main/README.md) |
| Ragas | framework | [资料页](https://docs.ragas.io/en/stable/) |
| GPT Image 2.6 Sunburst | model | [资料页](https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst) |
| GPT Image 2.6 Flare | model | [资料页](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare) |

## 核验与导入边界

- Google 文档迁移与 Liblib 动态页面只能使用官方索引；不是直接完整正文核验。
- 价格与库存无统一永久值；当前记录不构成实际报价或库存承诺。
- Whisper 的 HF 标签与代码仓库许可须按具体制品分别核对。
- Kling 官网被 robots 阻止；原 3.0 IR 资料保留为有日期的型号记录，不能称为最新型号。
- pgvector latest Release API 返回 404；不把该结果解释为项目停更，也不把 README 安装示例当成最新发布。

Pages 新访客加载更新后的公开快照。老访客保留会话、检索记录和审核历史，新增字段自动加入；与已发布值冲突的更新进入“版本与审核”，审核通过后生效。后端导入同样保留冲突，不覆盖已退役字段。

后端更新（先省略 `--apply` 预览；已有值冲突会生成待审任务）：

```bash
cd backend
python -m app.curated --dataset official-knowledge-2026-11-07.json --apply
python -m app.curated --dataset open-model-knowledge-2026-11-07.json --apply
python -m app.curated --dataset video-workflow-knowledge-2026-11-07.json --apply
python -m app.curated --dataset infrastructure-knowledge-2026-11-07.json --apply
```

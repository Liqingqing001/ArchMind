# GPU、托管推理与工作流目录

2026-11-07 对照官方公开页面补充 23 个服务实体、90 条字段事实。保留短摘录、来源 URL 和核验日期；不声称登录账户核验了库存、配额、实际下单价或跑通了所有工作流。旧资料并未被这些网页自动覆盖。

| 条目 | 类型 | 本次覆盖字段 | 官方资料 |
| --- | --- | --- | --- |
| 火山引擎 GPU 云服务器 | cloud | 服务形态、计费方式、费用组成、报价边界 | [查看](https://docs.volcengine.com/docs/gpu/billing?lang=zh) |
| OneThingAI | cloud | 服务范围、裸金属形态、资源隔离、报价方式、集群管理 | [查看](https://onethingai.com/) |
| AnyGPU 算力云 | cloud | 服务形态、型号范围、计费方式、环境工具 | [查看](https://www.anygpu.cn/gpu.html) |
| AutoDL | cloud | 计费方式、计费时段、付费数据盘、资源预留、报价入口 | [查看](https://www.autodl.com/docs/price/) |
| 矩池云 | cloud | 服务范围、按时计费、实例状态、包周期、存储边界 | [查看](https://www.matpool.com/catalog/pricing) |
| Featurize | cloud | 租用方式、计费粒度、长期租用、试用建议、到期选择 | [查看](https://docs.featurize.cn/docs/manual/instance-rent) |
| RunPod GPU Pods | cloud | 服务形态、临时数据、卷盘数据、独立存储、备份位置 | [查看](https://docs.runpod.io/pods/storage/types) |
| Vast.ai | cloud | 定价机制、费用组成、存储计费、实例类型、价格入口 | [查看](https://docs.vast.ai/guides/instances/pricing) |
| Lambda GPU Cloud | cloud | 资源形态、任务范围、自动化管理、接入方式 | [查看](https://lambda.com/instances) |
| Modal Serverless | cloud | 服务形态、计费粒度、计费边界、计费资源 | [查看](https://modal.com/pricing) |
| 腾讯云 HAI | cloud | 停机行为、算力计费、云盘计费、重启限制 | [查看](https://cloud.tencent.cn/document/product/1721/102027) |
| 阿里云 PAI EAS | cloud | 产品定位、资源计费、附加费用、停用操作 | [查看](https://help.aliyun.com/zh/pai/product-overview/billing-of-eas) |
| 火山方舟 | api | 接入方式、接入点、接口地址 | [查看](https://console.volcengine.com/ark/region%3Acn-beijing/docs/online-inference-standard) |
| 硅基流动 SiliconFlow | api | 服务形态、计费维度、查询方式、开放范围 | [查看](https://siliconflow.cn/pricing) |
| Replicate | api | 计费方式、硬件计费、查询入口 | [查看](https://replicate.com/pricing) |
| Hugging Face Inference Endpoints | cloud | 弹性副本、缩容到零、触发依据 | [查看](https://huggingface.co/docs/inference-endpoints/en/autoscaling) |
| RunningHub | product | API范围、集成任务、身份要求 | [查看](https://www.runninghub.cn/runninghub-api-doc-cn/doc-8287334) |
| LiblibAI 工作流 API | product | 服务条件、工作流接口、视频结果 | [查看](https://www.liblib.art/apis/workflow) |
| Tavily Search API | api | 接口地址、认证方式、请求控制、数量控制 | [查看](https://docs.tavily.com/documentation/api-reference/endpoint/search) |
| 博查 Web Search API | api | 接口地址、认证方式、结果内容、查询控制 | [查看](https://open.bochaai.com/) |
| Amazon EC2 GPU 实例 | cloud | 服务形态、配置维度、任务方向 | [查看](https://aws.amazon.com/ec2/instance-types/accelerated-computing/) |
| Google Cloud GPU | cloud | GPU 实例、账户配额、工作站许可 | [查看](https://docs.cloud.google.com/compute/docs/gpus/about-gpus) |
| Azure GPU 虚拟机 | cloud | 实例家族、图形任务、选型入口 | [查看](https://learn.microsoft.com/azure/virtual-machines/sizes-general) |

## 完整后端导入

Pages 构建自动合并公开数据，已有浏览器对话和审核状态保留。完整后端需显式预览／导入，SQLite 和 PostgreSQL 使用同一命令：

```bash
cd backend
python -m app.curated                  # 预览，回滚事务
python -m app.curated --apply          # 默认导入本次基础设施数据集
```

如现有同名实体存在不同字段值，新值进入审核，不直接覆盖；退役字段不自动恢复。ComfyUI 旧批次可用 `--dataset video-workflow-knowledge-2026-11-07.json` 单独选择。无需新增数据库迁移。

## 选型时仍需确认

租 GPU 要看卡型显存、CPU／内存、运行时长、地域网络、镜像和数据保留，分别核算计算、盘、流量。API／Serverless 则确认按 token、图片、任务或硬件时间的实际规则。长租、预留、可中断实例并非同一风险与计费口径。

上述平台的可用地域、账户资格、库存与价格可能变化，回答时可启用 [联网检索](web-search.md) 补查官网。

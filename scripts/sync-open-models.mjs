import { readFileSync, writeFileSync } from 'node:fs';
import { validateDataset } from './import-official-knowledge.mjs';
const models = JSON.parse(readFileSync(new URL('../backend/data/open-model-catalog-2026-11-07.json', import.meta.url), 'utf8'));
const leaf = m => {
 if (m.category === '语言模型') return ['大语言模型', m.name.includes('R1') ? '推理与数学' : '通用对话'];
 if (m.category === '代码模型') return ['大语言模型','代码生成'];
 if (m.category === '视觉理解') return ['多模态模型','视觉理解'];
 if (m.category === '图像生成') return ['图像生成模型','文生图'];
 if (m.category === '视频生成') return ['视频生成模型', m.name.includes('I2V') ? '图生视频' : '文生视频'];
 if (m.category === '语音与音频') return ['语音与音频', m.name.includes('whisper') ? '语音识别' : '语音合成'];
 return ['向量与排序模型', /reranker/i.test(m.name) ? '重排序' : '文本嵌入'];
};
const data = {
 schema_version: 1, batch_id: 'open-models-full-audit-2026-11-07', checked_on: '2026-11-07',
 sources: models.map(m => ({id:m.id,title:m.name+' 官方模型卡与 Hub 元数据',url:m.card_url,excerpts:[m.id,'License: '+m.license,m.purpose_evidence,JSON.stringify({gated:m.hub_audit.gated}),m.technical_fact.evidence],checked_on:m.verified_on,capture_method:'official_model_card_and_public_hub_api',additional_urls:['https://huggingface.co/api/models/'+m.id,m.download_url],hub_audit:m.hub_audit,note:'联合核对官方模型卡、Hub 公共元数据与文件列表；gated 是元数据字段摘录。未下载权重或实测推理，标签不替代完整许可证。'})),
 entities: models.map(m => ({name:m.name,kind:'model',source:m.id,categories:[['AI 模型',...leaf(m)],['AI 模型','开源与开放权重模型'],...(m.additional_categories || [])],description:m.family+' · 开放权重模型 · '+m.description,facts:[
  {key:'模型用途',value:m.description,evidence:2},
  {key:'模型卡许可证',value:m.license+'；使用前以官方模型卡及完整协议为准。',evidence:1},
  {key:'官方下载入口',value:m.download_url,evidence:0},
  {key:'官方模型仓库',value:m.card_url,evidence:0},
  {key:'下载条件',value:m.hub_audit.gated ? 'Hub 元数据标记为 '+m.hub_audit.gated+' 门槛；需要登录并接受或申请相应授权。公开模型卡不等于可匿名下载权重。' : '本轮 Hub 元数据 gated=false，文件列表可读；未执行权重下载，镜像、网络及运行条件需自行确认。',evidence:3},
  {key:m.technical_fact.key,value:m.technical_fact.value,evidence:4}
 ]}))
};
validateDataset(data);
const target = new URL('../backend/data/open-model-knowledge-2026-11-07.json', import.meta.url);
if (process.argv.includes('--check')) {
 if (JSON.stringify(JSON.parse(readFileSync(target,'utf8'))) !== JSON.stringify(data)) throw Error('Import catalog and knowledge dataset differ; run sync-open-models.mjs');
 console.log('Import catalog and knowledge dataset consistent: '+models.length+' models');
} else {
 writeFileSync(target, JSON.stringify(data,null,2)+'\n');
 console.log('Generated '+models.length+' models / '+data.entities.reduce((n,e)=>n+e.facts.length,0)+' facts');
}

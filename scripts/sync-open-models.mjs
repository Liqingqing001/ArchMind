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
 schema_version: 1, batch_id: 'official-open-models-2026-11-07', checked_on: '2026-11-07',
 sources: models.map(m => ({id:m.id,title:m.name+' 官方模型卡',url:m.card_url,excerpts:[m.id,'License: '+m.license],checked_on:m.verified_on,capture_method:'web_tool_official_model_card',note:'模型仓库名与许可证标签的简短记录；不是完整网页。用途为编辑归纳，下载入口为该官方仓库文件列表。'})),
 entities: models.map(m => ({name:m.name,kind:'model',source:m.id,categories:[['AI 模型',...leaf(m)]],description:m.family+' · 开放权重模型 · '+m.description,facts:[
  {key:'模型用途',value:m.description,evidence:0},
  {key:'模型卡许可证',value:m.license+'；使用前以官方模型卡及完整协议为准。',evidence:1},
  {key:'官方下载入口',value:m.download_url,evidence:0},
  {key:'官方模型仓库',value:m.card_url,evidence:0}
 ]}))
};
validateDataset(data);
const target = new URL('../backend/data/open-model-knowledge-2026-11-07.json', import.meta.url);
if (process.argv.includes('--check')) {
 if (JSON.stringify(JSON.parse(readFileSync(target,'utf8'))) !== JSON.stringify(data)) throw Error('Import catalog and knowledge dataset differ; run sync-open-models.mjs');
 console.log('Import catalog and knowledge dataset consistent: '+models.length+' models');
} else {
 writeFileSync(target, JSON.stringify(data,null,2)+'\n');
 console.log('Generated '+models.length+' models / '+data.entities.length*4+' facts');
}

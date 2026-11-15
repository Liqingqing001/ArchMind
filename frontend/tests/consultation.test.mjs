import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyWorkflow,applyExtraction} from '../src/solutionFlow.ts';
import {searchWeb,searchQueries,reusableSearch,readOfficialPage,searchWarnings} from '../src/webSearch.ts';
import {groundedMessages,groundedResult,completeGroundedBrowser} from '../src/browserModel.ts';
import {createDemoStore} from '../src/demo/store.ts';
const cases=JSON.parse(readFileSync(new URL('../../backend/tests/fixtures/consultation-routing.json',import.meta.url),'utf8'));
let w=emptyWorkflow();
for(const c of cases){
  w=applyExtraction(w,JSON.stringify({intent:c.intent,updates:Object.fromEntries(Object.entries(c.updates).map(([k,v])=>[k,{value:v,evidence:v}]))}),c.prompt);
  assert.equal(w.phase,c.phase);assert.equal(w.response_mode,c.mode);
}
const voice=applyExtraction(emptyWorkflow(),JSON.stringify({updates:{goal:{value:'实时语音交互',evidence:'实时语音交互'}},intent:'discovery'}),'找一个实时语音交互的模型');
assert.equal(voice.missing.length,5);
assert.ok(!applyExtraction(voice,'{"updates":{}}','没有偏好','你主要用于客服还是口语陪练？').fields.delivery);
assert.equal(applyExtraction(voice,'{"updates":{}}','没有偏好','你倾向现成平台、API还是本地自部署？').fields.delivery.value,'无偏好');
const searchKey='test-search-key-only',modelKey='test-model-key-only';
const connection={provider:'bocha',api_key:searchKey,enabled:true};
const scoped=searchQueries(voice,'找一个实时语音交互的模型 '+modelKey,[modelKey]);
assert.equal(scoped.length,3);
assert.ok(scoped.every(q=>q.includes('site:')&&!q.includes(modelKey)));
assert.ok(scoped.some(q=>q.includes('volcengine.com')));
assert.ok(scoped.some(q=>q.includes('cloud.tencent.com')));
const requests=[];
const fetcher=async(url,opt)=>{
  requests.push({url,opt});
  if(opt.method==='GET'){
    assert.equal(opt.headers,undefined);assert.equal(opt.credentials,'omit');assert.equal(opt.redirect,'error');
    return new Response('实时语音官方文档：模型接入、工具调用和计费参数。'.repeat(20)+searchKey,{headers:{'content-type':'text/plain'}});
  }
  assert.equal(opt.headers.Authorization,'Bearer '+searchKey);
  return new Response(JSON.stringify({code:200,data:{webPages:{value:[{url:'https://help.aliyun.com/zh/model-studio/realtime',summary:'实时语音模型，详细参数待读取',name:'实时语音文档'}]}}}));
};
const web=await searchWeb(connection,voice,'找一个实时语音交互的模型',[modelKey],fetcher);
assert.equal(web.status,'ok');assert.equal(requests.length,4);
assert.deepEqual(web.page_reading,{attempted:1,succeeded:1,failed:0});
assert.equal(web.results[0].content_kind,'page_excerpt');assert.ok(web.results[0].read_at);
assert.ok(!JSON.stringify(web).includes(searchKey));
const explain={...voice,response_mode:'explanation'};
assert.ok(reusableSearch(web,explain));
assert.ok(!reusableSearch(web,voice));
assert.ok(!reusableSearch(web,explain,Date.now()+31*60_000));
const explanation=groundedResult('好的，可以继续细化。','stop',{workflow:explain,retrieved:[],web_search:web,trace_id:'t'},'test-model');
assert.ok(!explanation.warnings.some(w=>/未引用|没有标注/.test(w)));
let explanationCalls=0;
await completeGroundedBrowser({base_url:'https://model.example/v1',api_key:modelKey,model:'test',protocol:'chat_completions',token_parameter:'max_tokens',max_output_tokens:2400},{workflow:explain,history:[],prompt:'谢谢',retrieved:[],web_search:web},async()=>{
  explanationCalls++;return new Response(JSON.stringify({choices:[{message:{content:'好的，可以继续细化。'},finish_reason:'stop'}]}));
});
assert.equal(explanationCalls,1);
const failed=await searchWeb(connection,voice,'找实时语音',[],async(url,opt)=>{
  if(opt.method==='GET') throw new TypeError('CORS denied');return fetcher(url,opt);
});
assert.equal(failed.page_reading.failed,1);assert.equal(failed.results[0].content_kind,'search_summary');
assert.ok(searchWarnings(failed).some(w=>w.includes('正文读取失败')));
await assert.rejects(()=>readOfficialPage({...web.results[0],url:'https://help.aliyun.com.evil.example/x'},[],fetcher),/非官网/);
const seed=JSON.parse(readFileSync(new URL('../public/demo/knowledge.json',import.meta.url),'utf8'));
let store=createDemoStore(seed);
const conversation=store.request('POST','/conversations',{title:'新对话'});
const body={conversation_id:conversation.id,revision:0,messages:[{role:'user',content:'找一个实时语音交互的模型'}]};
const preview=store.request('POST','/agent/chat',body);
assert.equal(preview.workflow.response_mode,'discovery');
assert.ok(preview.citations.length&&preview.retrieved.length);
assert.match(preview.answer,/知识库预览/);assert.match(preview.answer,/未联网/);
assert.match(preview.answer,/火山/);assert.match(preview.answer,/阿里/);assert.match(preview.answer,/腾讯/);
assert.ok(!preview.answer.includes('每条作品'));
const nextBody={...body,revision:1,messages:[{role:'user',content:'请比较这些候选'}]};
const prepared=store.prepareBrowserChat(nextBody,voice);
const modelPayload=JSON.parse(groundedMessages({...prepared,web_search:web}) .at(-1).content);
assert.equal(modelPayload.ANSWER_CONTEXT.mode,'discovery');assert.ok(modelPayload.ANSWER_CONTEXT.constraints_are_partial);
assert.ok(modelPayload.EVIDENCE_JSON.length&&modelPayload.WEB_EVIDENCE_JSON.length);
store.attachWebTrace(prepared.trace_id,web);
store.commitBrowserChat(nextBody,{answer:'候选[W1]',workflow:voice,retrieved:prepared.retrieved,web_search:web,trace_id:prepared.trace_id,model:'test-model',finish_reason:'stop'});
store=createDemoStore(store.exportState());
const reused=store.prepareBrowserChat({...body,revision:2,reuse_evidence:true,messages:[{role:'user',content:'解释一下'}]},explain);
assert.deepEqual(reused.web_search,web);assert.deepEqual(reused.retrieved,prepared.retrieved);
assert.equal(reused.trace_id,prepared.trace_id);assert.ok(!JSON.stringify(store.exportState()).includes(searchKey));
console.log('PASS: first-turn voice discovery, shared intent routing, scoped official search, credential-free page reading, CORS degradation, recent evidence reuse and explicit preview');

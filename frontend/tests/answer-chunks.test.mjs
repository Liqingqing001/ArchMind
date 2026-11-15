import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeChunk,generationPolicy,incompleteWarning} from '../src/answerChunks.ts';
import {completeBrowserInParts,completeGroundedBrowser,normalizeConnection,groundedResult,loadModelSettings,MODEL_SETTINGS_KEY} from '../src/browserModel.ts';
import {createDemoStore} from '../src/demo/store.ts';
const rows=JSON.parse(readFileSync(new URL('../../backend/tests/fixtures/answer-chunks.json',import.meta.url),'utf8'));
for(const row of rows) assert.equal(mergeChunk(row.existing,row.incoming),row.expected);
const connection={base_url:'https://model.example/v1',api_key:'test-only-placeholder-key',model:'test-model',protocol:'chat_completions',token_parameter:'max_tokens',max_output_tokens:3600};
const messages=[{role:'system',content:'frozen policy'},{role:'user',content:'evidence [W1]'}];
function install(parts,protocol='chat_completions'){
  const calls=[];
  const fetcher=async(url,options)=>{
    const payload=JSON.parse(options.body);calls.push({url,options,payload});
    const part=parts[calls.length-1];assert.ok(part,'unexpected extra model call');
    if(part instanceof Error) throw part;
    const [text,finish]=part;
    const data=protocol==='anthropic'?{content:[{type:'text',text}],stop_reason:finish==='length'?'max_tokens':'end_turn'}:
      protocol==='responses'?{output:[{type:'message',content:[{type:'output_text',text}]}],status:finish==='stop'?'completed':'incomplete',incomplete_details:finish==='length'?{reason:'max_output_tokens'}:finish==='content_filter'?{reason:'content_filter'}:undefined}:
      {choices:[{message:{content:text},finish_reason:finish}]};
    return new Response(JSON.stringify({...data,usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}}));
  };
  return {calls,fetcher};
}
for(const protocol of ['chat_completions','responses','anthropic']){
  const transport=install([['推荐来源[W','length'],['1]。','length'],['最后验证效果。','stop']],protocol);
  const reply=await completeBrowserInParts({...connection,protocol},messages,transport.fetcher);
  assert.equal(reply.answer,'推荐来源[W1]。\n\n最后验证效果。');assert.equal(reply.finish,'stop');
  assert.equal(transport.calls.length,3);
  assert.deepEqual(reply.diagnostics.automatic_continuation,{enabled:true,attempts:2,segments:3,completed:true,stop_reason:'completed'});
  assert.deepEqual(reply.diagnostics.usage,{prompt_tokens:60,completion_tokens:30,total_tokens:90});
  const last=transport.calls.at(-1).payload;
  assert.equal(last.max_tokens || last.max_output_tokens,1200);
  const sent=last.messages || last.input;
  assert.ok(JSON.parse(sent.at(-1).content).last_automatic_part);
  assert.ok(sent.some(m=>m.content==='evidence [W1]'));
  assert.ok(!JSON.stringify(reply.diagnostics).includes(connection.api_key));
}
for(const kind of ['round_limit','no_progress','error','size_limit','disabled','content_filter']){
  let text='已有内容';let parts=[[text,'length']];const config={...connection};
  if(kind==='round_limit') parts.push(['补写第一段','length'],['补写第二段','length']);
  if(kind==='no_progress') parts.push([text,'stop']);
  if(kind==='error') parts.push(new TypeError('upstream '+connection.api_key));
  if(kind==='size_limit') {text='长'.repeat(generationPolicy.stop_after_chars);parts=[[text,'length']];}
  if(kind==='disabled') config.auto_continue=false;
  if(kind==='content_filter') parts=[[text,'content_filter']];
  const transport=install(parts);
  const reply=await completeBrowserInParts(config,messages,transport.fetcher);
  assert.ok(reply.answer.startsWith(text));assert.equal(transport.calls.length,parts.length);
  assert.equal(reply.diagnostics.automatic_continuation.stop_reason,kind);
  assert.equal(reply.finish,kind==='content_filter'?'content_filter':'length');
  assert.ok(!JSON.stringify(reply.diagnostics).includes(connection.api_key));
  if(kind!=='content_filter') assert.match(incompleteWarning(reply.diagnostics),/仍不完整/);
}
const firstError=install([new TypeError('first request failed')]);
await assert.rejects(()=>completeBrowserInParts(connection,messages,firstError.fetcher),/CORS/);
assert.equal(firstError.calls.length,1);
const context={history:[],prompt:'生成方案',retrieved:[],web_search:{status:'ok',results:[{citation_id:'W1',url:'https://docs.example/guide',source_type:'official',content_kind:'page_excerpt'}],queries:[],errors:[]}};
const bounded=install([['初稿','length'],['补齐。','stop'],['修订[W1]','length'],['未完','length']]);
const kept=await completeGroundedBrowser(connection,context,bounded.fetcher);
assert.equal(bounded.calls.length,4);assert.equal(kept.answer,'初稿补齐。');assert.equal(kept.finish,'stop');
assert.deepEqual(kept.grounding_repair,{attempted:true,adopted:false});
assert.equal(kept.diagnostics.automatic_continuation.attempts,2);assert.equal(kept.diagnostics.usage.completion_tokens,40);
const repaired=install([['初稿没有引用','stop'],['修订[W','length'],['1]。','stop']]);
const adopted=await completeGroundedBrowser(connection,context,repaired.fetcher);
assert.ok(adopted.grounding_repair.adopted);assert.equal(adopted.answer,'修订[W1]。');assert.equal(adopted.diagnostics.model_calls,3);
const legacy=loadModelSettings({getItem:key=>key===MODEL_SETTINGS_KEY?JSON.stringify({version:1,provider:'自定义接口',connection:{...connection,max_output_tokens:2400}}):null});
assert.equal(legacy.connection.auto_continue,true);assert.equal(legacy.connection.max_output_tokens,2400);
assert.equal(normalizeConnection({...connection,auto_continue:false}).auto_continue,false);
assert.throws(()=>normalizeConnection({...connection,auto_continue:'yes'}));
const seed=JSON.parse(readFileSync(new URL('../public/demo/knowledge.json',import.meta.url),'utf8'));
let store=createDemoStore(seed);const c=store.request('POST','/conversations',{title:'自动补完测试'});
const body={conversation_id:c.id,revision:0,messages:[{role:'user',content:'找实时语音模型'}]};
const workflow={version:1,phase:'generated',response_mode:'discovery',fields:{goal:{value:'实时语音模型',evidence:'实时语音模型'}},missing:['budget'],scene:null};
const prepared=store.prepareBrowserChat(body,workflow);
const result=groundedResult(adopted.answer,adopted.finish,{...prepared,web_search:context.web_search,diagnostics:adopted.diagnostics},connection.model);
store.commitBrowserChat(body,{...result,workflow,diagnostics:adopted.diagnostics});store=createDemoStore(store.exportState());
const saved=store.request('GET','/conversations/'+c.id);
assert.equal(saved.messages.length,2);assert.equal(saved.messages[1].content,'修订[W1]。');
assert.equal(saved.messages[1].result.diagnostics.automatic_continuation.segments,2);
assert.ok(!JSON.stringify(saved).includes(connection.api_key));
assert.throws(()=>store.prepareBrowserChat({...body,revision:1,action:'continue'}),/没有需要续写/);
console.log('PASS: three protocols, two-part budget, Markdown joins, duplicates, partial failure preservation, frozen citations, summed usage, old settings and one persisted reply');

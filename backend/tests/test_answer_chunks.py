import json
from pathlib import Path
import pytest
from app import agent
from app.answer_chunks import POLICY,merge_chunk
from test_solution_agent import CONNECTION,generate,request
from test_governance import setup_source,candidate,approve


def install(monkeypatch,parts):
    calls=[]
    def complete(connection,messages,**kwargs):
        calls.append((messages,kwargs))
        item=parts[len(calls)-1]
        if isinstance(item,Exception): raise item
        answer,finish=item
        return agent.Completion(answer,finish,{'usage':{'completion_tokens':10,'prompt_tokens':20,'total_tokens':30},'output_limit':kwargs.get('max_tokens',connection.max_output_tokens)})
    monkeypatch.setattr(agent,'complete',complete)
    return calls


def test_shared_merge_cases_preserve_partial_links_citations_and_markdown():
    rows=json.loads((Path(__file__).parent/'fixtures/answer-chunks.json').read_text(encoding='utf-8'))
    for row in rows:
        assert merge_chunk(row['existing'],row['incoming'])==row['expected']


def test_auto_parts_complete_one_reply_and_sum_usage(monkeypatch):
    calls=install(monkeypatch,[('先选模型[W','length'),('1]。','length'),('最后用真实语音做小样。','stop')])
    messages=[dict(role='system',content='frozen-policy'),dict(role='user',content='frozen evidence [W1]')]
    result,repair,warnings=agent.complete_grounded(agent.ModelConnection(**CONNECTION),messages,{'results':[{'citation_id':'W1'}]})
    assert result[0]=='先选模型[W1]。\n\n最后用真实语音做小样。' and result[1]=='stop'
    assert not repair['attempted'] and not warnings and len(calls)==3
    for message,kwargs in calls[1:]:
        assert message[:2]==messages and message[-2]['role']=='assistant'
        assert kwargs['max_tokens']==POLICY['continuation_tokens']
    assert json.loads(calls[-1][0][-1]['content'])['last_automatic_part']
    assert result.diagnostics['usage']==dict(prompt_tokens=60,completion_tokens=30,total_tokens=90)
    assert result.diagnostics['automatic_continuation']==dict(enabled=True,attempts=2,segments=3,completed=True,stop_reason='completed')


@pytest.mark.parametrize('kind',['round_limit','no_progress','error','size_limit','disabled','content_filter'])
def test_limits_and_errors_preserve_existing_text(monkeypatch,kind):
    text='已有内容'
    parts=[(text,'length')];config=dict(CONNECTION)
    if kind=='round_limit': parts += [('第一补段','length'),('第二补段','length')]
    elif kind=='no_progress': parts += [(text,'stop')]
    elif kind=='error': parts += [agent.HTTPException(502,'upstream '+CONNECTION['api_key'])]
    elif kind=='size_limit': text='长'*POLICY['stop_after_chars'];parts=[(text,'length')]
    elif kind=='disabled': config['auto_continue']=False
    elif kind=='content_filter': parts=[(text,'content_filter')]
    calls=install(monkeypatch,parts)
    result=agent.complete_in_parts(agent.ModelConnection(**config),[])
    assert result[0].startswith(text) and len(calls)==len(parts)
    assert result.diagnostics['automatic_continuation']['stop_reason']==kind
    assert result[1]==('content_filter' if kind=='content_filter' else 'length')
    assert CONNECTION['api_key'] not in json.dumps(result.diagnostics)


def test_grounding_revision_shares_the_two_part_allowance(monkeypatch):
    calls=install(monkeypatch,[('初稿','length'),('补齐。','stop'),('带引用的修订[W1]','length'),('但仍未完','length')])
    result,repair,warnings=agent.complete_grounded(agent.ModelConnection(**CONNECTION),[],{'results':[{'citation_id':'W1'}]})
    assert len(calls)==4 and repair==dict(attempted=True,adopted=False)
    assert result[0]=='初稿补齐。' and result[1]=='stop'
    assert result.diagnostics['automatic_continuation']['attempts']==2
    assert result.diagnostics['usage']['completion_tokens']==40 and warnings


def test_first_call_failure_propagates_without_retry(monkeypatch):
    calls=install(monkeypatch,[agent.HTTPException(504,'timeout')])
    with pytest.raises(agent.HTTPException): agent.complete_in_parts(agent.ModelConnection(**CONNECTION),[])
    assert len(calls)==1


def test_chat_saves_one_joined_answer_with_frozen_citations(client,db,monkeypatch):
    entity,_,snapshot=setup_source(db);approve(client,candidate(client,entity,snapshot).json()['id'])
    calls=install(monkeypatch,[('方案来源[K','length'),('1]，先验证。','stop')])
    result=generate(client,db).json()
    assert len(calls)==2 and result['answer']=='方案来源[K1]，先验证。'
    assert result['finish_reason']=='stop' and result['citations'][0]['snapshot_id']==snapshot.id
    assert not any('仍不完整' in w for w in result['warnings'])
    saved=result['conversation'];assert len(saved['messages'])==4
    assert saved['messages'][-1]['content']==result['answer']
    assert saved['messages'][-1]['result']['diagnostics']['automatic_continuation']['segments']==2
    assert request(client,'续写',conversation_id=saved['id'],revision=saved['revision'],action='continue').status_code==409


def test_failed_auto_part_is_saved_and_can_be_manually_continued(client,db,monkeypatch):
    install(monkeypatch,[('已生成的部分。','length'),agent.HTTPException(504,'timeout')])
    result=generate(client,db).json();saved=result['conversation']
    assert result['answer']=='已生成的部分。' and result['finish_reason']=='length'
    assert any('已保留' in w for w in result['warnings'])
    install(monkeypatch,[('补上最后结论。','stop')])
    continued=request(client,'续写',conversation_id=saved['id'],revision=saved['revision'],action='continue').json()
    assert continued['trace_id']==result['trace_id'] and continued['finish_reason']=='stop'

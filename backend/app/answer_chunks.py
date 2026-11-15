"""Bounded continuation primitives shared in behavior with the Pages client."""
import json
import re
from pathlib import Path

POLICY = json.loads((Path(__file__).resolve().parent.parent/'data/generation-policy.json').read_text(encoding='utf-8'))


def merge_chunk(existing, incoming):
    if not incoming.strip() or existing.strip() == incoming.strip():
        return existing
    if len(incoming.strip()) >= POLICY['min_overlap_chars'] and existing.rstrip().endswith(incoming.strip()):
        return existing
    if len(existing) >= POLICY['min_overlap_chars'] and incoming.startswith(existing):
        return incoming
    limit = min(len(existing),len(incoming),POLICY['overlap_chars'])
    for size in range(limit,POLICY['min_overlap_chars']-1,-1):
        if existing[-size:] == incoming[:size]:
            return existing+incoming[size:]
    separator = ''
    if existing and incoming and not existing[-1].isspace() and not incoming[0].isspace():
        if existing.endswith('|') and incoming.startswith('|'):
            separator = '\n'
        elif re.search(r'[。！？]$',existing) or existing.endswith('```'):
            separator = '\n\n'
    return existing+separator+incoming


def continuation_messages(messages, answer, remaining):
    return [*messages,dict(role='assistant',content=answer),dict(role='user',content=json.dumps({
        'CONTINUE_REQUEST':POLICY['continuation_prompt'],
        'last_automatic_part':remaining == 0,
        'already_written_chars':len(answer),
    },ensure_ascii=False))]


def new_budget():
    return dict(remaining=POLICY['max_continuations'],attempts=0,calls=0,usage={})


def record_usage(budget, diagnostics):
    for key,value in diagnostics.get('usage',{}).items():
        if key in ('input_tokens','output_tokens','prompt_tokens','completion_tokens','total_tokens') and type(value) is int and value>=0:
            budget['usage'][key] = budget['usage'].get(key,0)+value


def incomplete_warning(diagnostics):
    info = diagnostics.get('automatic_continuation',{})
    reason = info.get('stop_reason')
    prefix = {
        'error':'自动补写未成功，已保留前面生成的内容。',
        'no_progress':'自动补写重复了已有内容，已停止并保留原文。',
        'round_limit':'已达到本轮自动补写次数上限，已合并收到的内容。',
        'size_limit':'回复已较长，已停止自动补写并保留原文。',
    }.get(reason,'模型因输出上限停止。')
    return prefix+'当前回复仍不完整，可点击“续写剩余内容”或调整单次输出上限。'

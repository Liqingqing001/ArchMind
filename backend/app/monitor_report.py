"""Public, read-only website change report for scheduled GitHub Actions (no live DB)."""
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from .collector import fetch, normalized
from .maas_monitor import CATALOG


def check_sources(catalog, previous, fetcher=fetch):
    checked = datetime.now(timezone.utc).isoformat()
    baseline = dict(previous)
    results = []
    sources = {s['url']: s for s in catalog['sources']}
    for url, item in sources.items():
        row = {'name': item['title'], 'url': url, 'checked_at': checked}
        try:
            raw, _ = fetcher(SimpleNamespace(url=url, etag=None, last_modified=None))
            text = normalized(raw) if raw else ''
            if len(text) < 120:
                raise ValueError('正文过短，可能为动态页面或访问验证；需人工核验')
            digest = hashlib.sha256(text.encode()).hexdigest()
            old = previous.get(url)
            row.update(status='baseline' if not old else 'unchanged' if old['hash'] == digest else 'changed',
                       hash=digest, previous_hash=old['hash'] if old else None,
                       previous_checked_at=old.get('checked_at') if old else None)
            baseline[url] = {'hash': digest, 'checked_at': checked}
        except Exception as exc:
            # Failure is not evidence of a changed model and must not erase the last good hash.
            row.update(status='failed', error=type(exc).__name__, note='抓取受限、重定向或网络失败；查看官方页面人工核验。')
        results.append(row)
    return {'checked_at': checked, 'mode': 'official_page_hash_not_model_validation', 'sources': results}, baseline


def main():
    folder = Path('artifacts/maas-monitor')
    folder.mkdir(parents=True, exist_ok=True)
    cache = folder / 'baseline.json'
    previous = json.loads(cache.read_text(encoding='utf-8')) if cache.exists() else {}
    report, baseline = check_sources(json.loads(CATALOG.read_text(encoding='utf-8')), previous)
    for filename, value in [('report.json', report), ('baseline.json', baseline)]:
        (folder / filename).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    lines = ['# MaaS 官方页面巡检', '', '每 6 小时计划执行，调度可能延迟。仅检查页面变化，不自动发布模型事实，也不验证 API 权限和性能。首次成功读取建立基线；缓存丢失时重新建基线。', '', '| 官方页面 | 结果 |', '| --- | --- |']
    labels = {'baseline': '首次基线', 'changed': '正文变化，需核验', 'unchanged': '正文未变', 'failed': '抓取失败，需人工核验'}
    for row in report['sources']:
        name = row['name'].replace('|', ' ').replace('\n', ' ')
        lines.append(f"| [{name}]({row['url']}) | {labels[row['status']]} |")
    summary = '\n'.join(lines) + '\n'
    (folder / 'summary.md').write_text(summary, encoding='utf-8')
    if os.getenv('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as output:
            output.write(summary)
    print(json.dumps({status: sum(r['status'] == status for r in report['sources']) for status in labels}))
    if all(r['status'] == 'failed' for r in report['sources']):
        raise SystemExit(1)


if __name__ == '__main__':
    main()

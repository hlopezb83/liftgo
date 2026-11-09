#!/usr/bin/env python3
"""Seal and verify only test identities/statuses, never fixture data or credentials."""
import argparse
import json
import os
from pathlib import Path

EXPECTED = 99

def read(path):
    return json.loads(Path(path).read_text())

def cases(report):
    found = []
    def walk(suites):
        for suite in suites:
            for spec in suite.get('specs', []):
                for test in spec.get('tests', []):
                    key = (spec.get('id'), test.get('projectId') or test.get('projectName'))
                    if not all(isinstance(x, str) and x for x in key):
                        raise ValueError('Missing test/project identity')
                    found.append((':'.join(key), test))
            walk(suite.get('suites', []))
    walk(report.get('suites', []))
    ids = [key for key, _ in found]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate test identity')
    if report.get('errors'):
        raise ValueError('Report contains runner errors')
    return found

def identity(env):
    result = {key: env.get(key) for key in ('GITHUB_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT')}
    if any(not value for value in result.values()):
        raise ValueError('Missing run provenance')
    return result

def seal(manifest, results, review, shard, env):
    if shard not in (1,2):
        raise ValueError('Invalid shard')
    expected = sorted(key for key, _ in cases(manifest))
    if len(expected) != EXPECTED:
        raise ValueError(f'Expected complete {EXPECTED}-case manifest')
    actual = cases(results)
    if not actual:
        raise ValueError('Empty shard')
    for key, test in actual:
        runs = test.get('results', [])
        if key not in expected or test.get('status') != 'expected' or len(runs) != 1 or runs[0].get('status') != 'passed':
            raise ValueError('Missing, skipped, retried or failing test')
    stats = results.get('stats', {})
    if stats.get('expected') != len(actual) or any(stats.get(key) != 0 for key in ('unexpected','flaky','skipped')):
        raise ValueError('Invalid shard statistics')
    review_count = 0
    if shard == 1:
        rows = cases(review)
        if len(rows) != 6 or any(t.get('status') != 'expected' or len(t.get('results', [])) != 1 or t['results'][0].get('status') != 'passed' for _,t in rows):
            raise ValueError('Expected six successful review-browser cases')
        stats = review.get('stats', {})
        if stats.get('expected') != 6 or any(stats.get(key) != 0 for key in ('unexpected','flaky','skipped')):
            raise ValueError('Invalid review-browser statistics')
        review_count = 6
    return {**identity(env), 'shard':shard, 'manifest':expected,
            'passed':sorted(key for key,_ in actual), 'review_passed':review_count}

def verify(reports, env):
    if len(reports) != 2 or {r.get('shard') for r in reports} != {1,2}:
        raise ValueError('Exactly two distinct shards required')
    provenance = identity(env)
    manifest = reports[0].get('manifest', [])
    if len(manifest) != EXPECTED or len(set(manifest)) != EXPECTED:
        raise ValueError('Invalid complete manifest')
    passed = []
    for report in reports:
        if any(report.get(k) != v for k,v in provenance.items()) or report.get('manifest') != manifest:
            raise ValueError('Stale provenance or mismatched manifest')
        rows = report.get('passed', [])
        if not rows or len(rows) != len(set(rows)):
            raise ValueError('Empty or duplicate shard')
        if report.get('review_passed') != (6 if report['shard']==1 else 0):
            raise ValueError('Review-browser evidence missing')
        passed.extend(rows)
    if len(passed) != EXPECTED or len(set(passed)) != EXPECTED or sorted(passed) != manifest:
        raise ValueError('Incomplete or overlapping partition')
    return EXPECTED

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation',choices=('seal','verify'))
    parser.add_argument('--shard',type=int)
    parser.add_argument('--directory',default='reports')
    args=parser.parse_args()
    directory=Path(args.directory)
    if args.operation=='seal':
        payload=seal(read(directory/'multitenant-manifest.raw.json'), read(directory/'multitenant-ab.json'),
          read(directory/'quote-charge-review-browser.json') if args.shard==1 else None, args.shard, os.environ)
        (directory/'multitenant-shard-evidence.json').write_text(json.dumps(payload,sort_keys=True)+'\n')
    else:
        files=list(directory.glob('*/multitenant-shard-evidence.json'))
        print(f'PASS complete A/B gate: {verify([read(f) for f in files],os.environ)} cases + 6 review-browser cases')

if __name__=='__main__':
    main()

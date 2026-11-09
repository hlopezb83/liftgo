import copy
import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).parents[2]
spec=importlib.util.spec_from_file_location('evidence',ROOT/'scripts/multitenant-shard-evidence.py')
e=importlib.util.module_from_spec(spec)
spec.loader.exec_module(e)
ENV={'GITHUB_SHA':'abc123','GITHUB_RUN_ID':'123','GITHUB_RUN_ATTEMPT':'1'}

def report(indices):
    return {'suites':[{'specs':[{'id':str(i),'tests':[{'projectName':'chromium','status':'expected','results':[{'status':'passed'}]}]} for i in indices]}], 'errors':[],
      'stats':{'expected':len(indices),'unexpected':0,'flaky':0,'skipped':0}}

class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.manifest=report(range(99))
        self.a=e.seal(self.manifest,report(range(50)),report(range(6)),1,ENV)
        self.b=e.seal(self.manifest,report(range(50,99)),None,2,ENV)

    def test_valid_partition_and_six_review_cases(self):
        self.assertEqual(e.verify([self.a,self.b],ENV),99)

    def test_missing_duplicate_extra_shards_and_provenance_fail(self):
        for reports in ([self.a],[self.a,self.a],[self.a,self.b,self.b]):
            with self.assertRaises(ValueError):e.verify(reports,ENV)
        for key in ENV:
            b=copy.deepcopy(self.b);b[key]='different'
            with self.assertRaises(ValueError):e.verify([self.a,b],ENV)

    def test_manifest_missing_extra_duplicate_and_different_fail(self):
        for mutate in (lambda r:r['manifest'].pop(),lambda r:r['manifest'].append('extra'),lambda r:r['manifest'].__setitem__(0,r['manifest'][1]),lambda r:r['manifest'].__setitem__(0,'other')):
            b=copy.deepcopy(self.b);mutate(b)
            with self.assertRaises(ValueError):e.verify([self.a,b],ENV)

    def test_partition_overlap_missing_extra_and_duplicate_fail(self):
        for mutate in (lambda r:r['passed'].pop(),lambda r:r['passed'].append('extra'),lambda r:r['passed'].__setitem__(0,self.a['passed'][0]),lambda r:r['passed'].append(r['passed'][0])):
            b=copy.deepcopy(self.b);mutate(b)
            with self.assertRaises(ValueError):e.verify([self.a,b],ENV)

    def test_failure_skip_retry_and_runner_error_cannot_seal(self):
        for status in ('failed','timedOut','skipped','interrupted'):
            r=report(range(50));r['suites'][0]['specs'][0]['tests'][0]['results'][0]['status']=status
            with self.assertRaises(ValueError):e.seal(self.manifest,r,report(range(6)),1,ENV)
        for status in ('flaky','unexpected','skipped'):
            r=report(range(50));r['suites'][0]['specs'][0]['tests'][0]['status']=status
            with self.assertRaises(ValueError):e.seal(self.manifest,r,report(range(6)),1,ENV)
        r=report(range(50));r['suites'][0]['specs'][0]['tests'][0]['results'].append({'status':'passed'})
        with self.assertRaises(ValueError):e.seal(self.manifest,r,report(range(6)),1,ENV)
        r=report(range(50));r['errors']=[{'message':'runner failed'}]
        with self.assertRaises(ValueError):e.seal(self.manifest,r,report(range(6)),1,ENV)

    def test_review_required_only_on_first_shard(self):
        with self.assertRaises(ValueError):e.seal(self.manifest,report(range(50)),report(range(5)),1,ENV)
        a=copy.deepcopy(self.a);a['review_passed']=0
        with self.assertRaises(ValueError):e.verify([a,self.b],ENV)

    def test_review_statistics_status_retries_and_runner_errors_fail(self):
        for field in ('expected','skipped','unexpected','flaky'):
            review=report(range(6));review['stats'][field]=9
            with self.subTest(field=field),self.assertRaises(ValueError):
                e.seal(self.manifest,report(range(50)),review,1,ENV)
        for status in ('unexpected','flaky','skipped'):
            review=report(range(6));review['suites'][0]['specs'][0]['tests'][0]['status']=status
            with self.subTest(status=status),self.assertRaises(ValueError):
                e.seal(self.manifest,report(range(50)),review,1,ENV)
        review=report(range(6));review['suites'][0]['specs'][0]['tests'][0]['results'].append({'status':'passed'})
        with self.assertRaises(ValueError):e.seal(self.manifest,report(range(50)),review,1,ENV)
        review=report(range(6));review['errors']=[{'message':'runner failed'}]
        with self.assertRaises(ValueError):e.seal(self.manifest,report(range(50)),review,1,ENV)

    def test_statistics_and_empty_result_fail(self):
        for field in ('unexpected','flaky','skipped','expected'):
            r=report(range(50));r['stats'][field]=7
            with self.assertRaises(ValueError):e.seal(self.manifest,r,report(range(6)),1,ENV)
        with self.assertRaises(ValueError):e.seal(self.manifest,report([]),report(range(6)),1,ENV)

    def test_workflow_preserves_isolation_and_gate(self):
        s=(ROOT/'.github/workflows/multi-tenant-ab.yml').read_text()
        self.assertIn('fail-fast: false',s);self.assertIn('shard: [1, 2]',s)
        self.assertIn('run: bun run test:multitenant-ab --shard=${{ matrix.shard }}/2',s)
        self.assertIn('if: matrix.shard == 1',s)
        self.assertIn('pattern: ab-shard-sealed-${{ github.run_id }}-${{ github.run_attempt }}-*',s)
        self.assertIn('needs: multi-tenant-ab\n    if: always()',s)
        self.assertIn('test "$SHARDS_RESULT" = "success"',s)
        self.assertIn('start-guarded --profile ab',s)
        self.assertIn('name: Destruir entorno efímero\n        if: always()',s)
        config=(ROOT/'playwright.multitenant.config.ts').read_text()
        self.assertIn('workers: 1',config);self.assertIn('fullyParallel: false',config)

if __name__=='__main__':unittest.main()

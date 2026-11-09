import hashlib
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('apt_cache', Path(__file__).parents[1] / 'cache-playwright-apt.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def metadata(data=b'valid', version='1:2.0'):
    return f'Package: fonts-demo\nVersion: {version}\nArchitecture: all\nSize: {len(data)}\nSHA256: {hashlib.sha256(data).hexdigest()}\n\n'


class CacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cache = Path(self.temp.name) / 'cache'
        self.archive = Path(self.temp.name) / 'archive'
        self.cache.mkdir()
        self.archive.mkdir()
        self.calls = []

    def run_mock(self, argv, **kwargs):
        self.calls.append(argv)
        return subprocess.CompletedProcess(argv, 0, stdout=metadata())

    def test_verified_epoch_archive_and_signed_refresh_before_copy(self):
        (self.cache / 'fonts-demo_1%3a2.0_all.deb').write_bytes(b'valid')
        with patch.object(module.subprocess, 'run', side_effect=self.run_mock):
            module.restore(self.cache, self.archive)
        self.assertEqual(self.calls[0], ['sudo', 'apt-get', 'update', '-o', 'APT::Update::Error-Mode=any'])
        self.assertEqual(self.calls[1], ['apt-cache', 'dumpavail'])
        self.assertEqual(self.calls[2][:4], ['sudo', 'cp', '--remove-destination', '--'])

    def test_same_size_corruption_wrong_name_and_stale_version_never_copied(self):
        for name, data in [('fonts-demo_1%3a2.0_all.deb', b'evil!'),
                           ('other_1%3a2.0_all.deb', b'valid'),
                           ('fonts-demo_3.0_all.deb', b'valid')]:
            (self.cache / name).write_bytes(data)
        with patch.object(module.subprocess, 'run', side_effect=self.run_mock):
            module.restore(self.cache, self.archive)
        self.assertEqual(len(self.calls), 2)

    def test_symlink_and_nested_content_ignored(self):
        (self.cache / 'sub').mkdir()
        real = self.cache / 'sub' / 'fonts-demo_1%3a2.0_all.deb'
        real.write_bytes(b'valid')
        (self.cache / real.name).symlink_to(real)
        with patch.object(module.subprocess, 'run', side_effect=self.run_mock):
            module.restore(self.cache, self.archive)
        self.assertEqual(self.calls, [])

    def test_unsigned_or_failed_index_refresh_blocks_copy(self):
        (self.cache / 'fonts-demo_1%3a2.0_all.deb').write_bytes(b'valid')
        with patch.object(module.subprocess, 'run', side_effect=subprocess.CalledProcessError(100, 'apt-get')) as call:
            with self.assertRaises(subprocess.CalledProcessError):
                module.restore(self.cache, self.archive)
            self.assertEqual(call.call_count, 1)

    def test_no_sha256_and_malformed_records_not_trusted(self):
        self.assertEqual(module.trusted_packages(metadata().replace('SHA256:', 'MD5sum:')), {})
        self.assertEqual(module.trusted_packages(metadata().replace('fonts-demo', '../escape')), {})
        self.assertEqual(module.trusted_packages(metadata().replace('Size: 5', 'Size: -1')), {})

    def test_ambiguous_index_digest_not_trusted(self):
        self.assertEqual(module.trusted_packages(metadata() + metadata(b'other')), {})

    def test_save_replaces_destination_symlink_without_following_it(self):
        source = self.archive / 'font.deb'
        source.write_bytes(b'archive')
        victim = Path(self.temp.name) / 'victim'
        victim.write_bytes(b'keep')
        (self.cache / source.name).symlink_to(victim)
        with patch.dict(module.os.environ, {'PLAYWRIGHT_APT_CACHE': str(self.cache), 'PLAYWRIGHT_APT_ARCHIVE': str(self.archive)}), patch.object(module.sys, 'argv', ['cache.py', 'save']):
            module.main()
        self.assertEqual(victim.read_bytes(), b'keep')
        self.assertFalse((self.cache / source.name).is_symlink())
        self.assertEqual((self.cache / source.name).read_bytes(), b'archive')

    def test_restore_copies_the_verified_snapshot_after_cache_mutation(self):
        package = self.cache / 'fonts-demo_1%3a2.0_all.deb'
        package.write_bytes(b'valid')
        copied = []
        def execute(argv, **kwargs):
            if argv[:2] == ['sudo', 'cp']:
                package.write_bytes(b'evil!')
                copied.append(Path(argv[-2]).read_bytes())
            return subprocess.CompletedProcess(argv, 0, stdout=metadata())
        with patch.object(module.subprocess, 'run', side_effect=execute):
            module.restore(self.cache, self.archive)
        self.assertEqual(copied, [b'valid'])

    def test_root_symlinks_rejected_before_subprocess(self):
        link = Path(self.temp.name) / 'link'
        link.symlink_to(self.cache, target_is_directory=True)
        with patch.object(module.subprocess, 'run') as run:
            for cache, archive in [(link, self.archive), (self.cache, link)]:
                with self.assertRaises(ValueError):
                    module.restore(cache, archive)
            run.assert_not_called()

    def test_empty_archive_reports_zero_to_prevent_immutable_empty_cache(self):
        output = Path(self.temp.name) / 'output'
        with patch.dict(module.os.environ, {'PLAYWRIGHT_APT_CACHE': str(self.cache), 'PLAYWRIGHT_APT_ARCHIVE': str(self.archive), 'GITHUB_OUTPUT': str(output)}), patch.object(module.sys, 'argv', ['cache.py', 'save']):
            module.main()
        self.assertEqual(output.read_text(), 'package-count=0\npackage-bytes=0\n')
        source = Path('.github/actions/setup-playwright/action.yml').read_text()
        self.assertIn("steps.apt-archives.outputs.package-count != '0'", source)

    def test_helper_changes_trigger_consumer_workflows(self):
        source = Path('.github/workflows/multi-tenant-ab.yml').read_text()
        self.assertEqual(source.count('      - "scripts/cache-playwright-apt.py"'), 2)
        self.assertEqual(source.count('      - ".github/actions/setup-playwright/**"'), 2)
        source = Path('.github/workflows/ci.yml').read_text()
        self.assertIn("              - 'scripts/cache-playwright-apt.py'", source)

    def test_full_install_remains_unconditional_and_no_installed_state_cached(self):
        source = Path('.github/actions/setup-playwright/action.yml').read_text()
        self.assertIn('bunx playwright install-deps chromium', source)
        self.assertIn('bunx playwright install --with-deps chromium', source)
        self.assertNotIn('allow-unauthenticated', source)
        self.assertNotIn('/usr/lib', source)
        self.assertIn("inputs.save-cache == 'true' && steps.apt-cache.outputs.cache-hit != 'true'", source)


if __name__ == '__main__':
    unittest.main()

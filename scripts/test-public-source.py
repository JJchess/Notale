#!/usr/bin/env python3
"""Small source-boundary checks; fixtures and Git histories live only in temporary directories."""
import io
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parent
POLICY = runpy.run_path(str(SCRIPTS / 'check-public-source.py'))
SETUP = runpy.run_path(str(SCRIPTS / 'setup-repository.py'))
ORG = 'THU' + '-AICosmos'


class SourcePolicy(unittest.TestCase):
    def setUp(self):
        POLICY['errors'].clear()

    def test_canonical_coordinates_and_private_suffixes(self):
        for text in [ORG + '/Notale', 'git@github.com:' + ORG + '/Notale.git',
                     'https://github.com/' + ORG + '/Notale/actions/workflows/ci.yml',
                     '[core](' + 'https://github.com/' + ORG + '/Notale.git)',
                     "github.repository == '" + ORG + "/Notale'"]:
            POLICY['inspect']('README.md', text.encode())
        self.assertEqual(POLICY['errors'], [])
        for suffix in ['-online', '-integration-archive', '-private', '.git-private', 'Extra']:
            POLICY['errors'].clear()
            POLICY['inspect']('README.md', ('https://github.com/' + ORG + '/Notale' + suffix).encode())
            self.assertTrue(POLICY['errors'], suffix)
        POLICY['errors'].clear()
        POLICY['inspect']('README.md', ('https://github.com/' + ORG + '/Other').encode())
        self.assertTrue(POLICY['errors'])
        for suffix in ['-online', '-integration-archive']:
            POLICY['errors'].clear()
            POLICY['inspect']('README.md', ('Notale' + suffix).encode())
            self.assertTrue(POLICY['errors'])

    def test_bundled_private_reference_is_rejected(self):
        data = (ORG + '/Notale' + '-online').encode()
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode='w:gz') as archive:
            entry = tarfile.TarInfo('package/README.md')
            entry.size = len(data)
            archive.addfile(entry, io.BytesIO(data))
        POLICY['archive']('editor.tgz', output.getvalue())
        self.assertIn('editor.tgz:package/README.md: private workspace reference', POLICY['errors'])

    def test_hook_rejects_private_ancestry_even_behind_clean_tip(self):
        with tempfile.TemporaryDirectory(prefix='notale-policy-') as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=root, text=True, stderr=subprocess.DEVNULL).strip()
            git('init', '--quiet')
            git('config', 'user.name', 'Policy fixture')
            git('config', 'user.email', 'policy@example.invalid')
            (root / 'scripts').mkdir()
            shutil.copyfile(SCRIPTS / 'check-public-source.py', root / 'scripts/check-public-source.py')
            (root / 'README.md').write_text('core')
            git('add', '.')
            git('commit', '--quiet', '-m', 'clean root')
            safe = git('rev-parse', 'HEAD')
            hook = root / '.git/pre-push-fixture'
            hook.write_text(SETUP['hook_source']())
            def push(url, sha, remote_sha='0' * 40):
                return subprocess.run([sys.executable, str(hook), 'origin', url], cwd=root, text=True,
                    input=f'refs/heads/main {sha} refs/heads/main {remote_sha}\n', capture_output=True)
            for url in SETUP['ALLOWED']:
                self.assertEqual(push(url, safe).returncode, 0)
            self.assertNotEqual(push('git@github.com:' + ORG + '/Notale' + '-online.git', safe).returncode, 0)
            (root / 'integration').mkdir()
            (root / 'integration/private.txt').write_text('private implementation')
            git('add', '.')
            git('commit', '--quiet', '-m', 'private parent')
            unsafe = git('rev-parse', 'HEAD')
            git('rm', '--quiet', 'integration/private.txt')
            git('commit', '--quiet', '-m', 'clean tip')
            git('update-ref', 'refs/remotes/origin/main', unsafe)
            result = push(SETUP['ALLOWED'][0], git('rev-parse', 'HEAD'), unsafe)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('integration/private.txt', result.stderr)


if __name__ == '__main__':
    unittest.main()

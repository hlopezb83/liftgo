#!/usr/bin/env python3
"""Cache downloaded packages, verifying them against fresh signed apt indexes."""
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import quote


def trusted_packages(index):
    result = {}
    for record in index.split('\n\n'):
        fields = dict(line.split(': ', 1) for line in record.splitlines()
                      if line and not line[0].isspace() and ': ' in line)
        package, version, arch = (fields.get(k, '') for k in ('Package', 'Version', 'Architecture'))
        digest, size = fields.get('SHA256', ''), fields.get('Size', '')
        if not (re.fullmatch(r'[a-z0-9][a-z0-9+.-]*', package)
                and re.fullmatch(r'[A-Za-z0-9.+:~\-]+', version)
                and re.fullmatch(r'[a-z0-9][a-z0-9-]*', arch)
                and re.fullmatch(r'[a-fA-F0-9]{64}', digest) and size.isdigit()):
            continue
        filename = f'{package}_{quote(version, safe=".+~-_")}_{arch}.deb'
        # apt encodes the epoch separator with a lowercase hex digit.
        filename = filename.replace('%3A', '%3a')
        result.setdefault(filename, set()).add((int(size), digest.lower()))
    return {name: values for name, values in result.items() if len(values) == 1}


def reject_symlink_roots(cache, archive):
    if cache.is_symlink() or archive.is_symlink():
        raise ValueError('Package cache and archive roots must not be symlinks')


def restore(cache, archive):
    reject_symlink_roots(cache, archive)
    packages = [p for p in cache.glob('*.deb') if p.is_file() and not p.is_symlink()]
    if not packages:
        print('No downloaded packages to restore')
        return
    # Do not trust Actions cache bytes or apt's same-size local-file fast path.
    # Obtain authenticated current indexes before validating each archive.
    subprocess.run(['sudo', 'apt-get', 'update', '-o', 'APT::Update::Error-Mode=any'], check=True)
    indexes = subprocess.run(['apt-cache', 'dumpavail'], check=True, text=True, capture_output=True).stdout
    trusted = trusted_packages(indexes)
    accepted = 0
    for package in packages:
        data = package.read_bytes()
        fingerprint = (len(data), hashlib.sha256(data).hexdigest())
        if fingerprint not in trusted.get(package.name, set()):
            print(f'Ignoring archive absent from authenticated indexes: {package.name}')
            continue
        # Copy exactly the already-verified bytes, not a second read of cache.
        with tempfile.TemporaryDirectory(prefix='verified-apt-') as directory:
            verified = Path(directory) / package.name
            verified.write_bytes(data)
            subprocess.run(['sudo', 'cp', '--remove-destination', '--', str(verified), str(archive) + '/'], check=True)
        accepted += 1
    print(f'Verified and restored {accepted} downloaded packages')


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ('restore', 'save'):
        raise SystemExit('Expected restore or save')
    cache = Path(os.environ['PLAYWRIGHT_APT_CACHE'])
    archive = Path(os.environ.get('PLAYWRIGHT_APT_ARCHIVE', '/var/cache/apt/archives'))
    reject_symlink_roots(cache, archive)
    cache.mkdir(parents=True, exist_ok=True)
    if sys.argv[1] == 'restore':
        restore(cache, archive)
    else:
        for package in archive.glob('*.deb'):
            if package.is_file() and not package.is_symlink():
                # Atomic replacement does not follow an existing cache symlink.
                with tempfile.NamedTemporaryFile(dir=cache, delete=False) as target:
                    temporary = Path(target.name)
                try:
                    shutil.copyfile(package, temporary)
                    temporary.replace(cache / package.name)
                finally:
                    temporary.unlink(missing_ok=True)
        packages = [p for p in cache.glob('*.deb') if p.is_file() and not p.is_symlink()]
        count, size = len(packages), sum(p.stat().st_size for p in packages)
        print(f'Downloaded package cache: {count} archives, {size} bytes')
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf8') as output:
                output.write(f'package-count={count}\npackage-bytes={size}\n')


if __name__ == '__main__':
    main()

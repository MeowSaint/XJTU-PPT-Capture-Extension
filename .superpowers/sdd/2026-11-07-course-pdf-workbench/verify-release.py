#!/usr/bin/env python3
"""Verify the final local 3.1.2 artifact without extracting or changing it."""
import binascii
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath

root = Path(sys.argv[1])
assert root.is_absolute() and root.resolve(strict=True) == root, 'Expected the physical absolute worktree'
assert not any(path.is_symlink() for path in (root, *root.parents)), 'Symlinked worktree path'
archive = root / 'ppt-capture.zip'
assert archive.is_file() and not archive.is_symlink(), 'Expected a regular release ZIP'
assert archive.resolve(strict=True) == archive, 'Unexpected release path'

release_script = (root / 'scripts/release.cjs').read_text(encoding='utf-8')
match = re.search(r'const files = \[(.*?)\];', release_script, re.S)
assert match, 'Missing authoritative packaging allowlist'
expected = re.findall(r"'([^']+)'", match.group(1))
assert len(expected) == len(set(expected)) == 34, 'Expected 34 unique release members'
assert 'motion.js' in expected and 'icons/readme-banner.svg' in expected, 'Missing packaged UI resources'

manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
lock = json.loads((root / 'package-lock.json').read_text(encoding='utf-8'))
versions = [manifest['version'], package['version'], lock['version'], lock['packages']['']['version']]
assert versions == ['3.1.2'] * 4, f'Unexpected versions: {versions}'
assert package['scripts'].get('test:improvements'), 'Missing improvements suite entry'

html = (root / 'capture.html').read_text(encoding='utf-8')
assert re.findall(r'<span class="version">([^<]+)</span>', html) == ['3.1.2'], 'Visible version marker differs from release workflow contract'
readme = (root / 'README.md').read_text(encoding='utf-8')
assert re.findall(r'^当前版本：\*\*([^*]+)\*\*', readme, re.M) == ['3.1.2'], 'README current version marker differs from release workflow contract'
scripts = re.findall(r'<script\b[^>]*\bsrc=[\"\']([^\"\']+)[\"\']', html, re.I)
assert 'motion.js' in scripts, 'Missing motion script tag'
assert scripts.index('motion.js') < scripts.index('capture.js'), 'Motion must load before capture'
assert scripts.index('motion.js') < scripts.index('workspace.js'), 'Motion must load before workspace'
assert set(scripts) <= set(expected), 'An entrypoint script is absent from the ZIP allowlist'

members = []
with zipfile.ZipFile(archive) as release:
    assert release.namelist() == expected, 'ZIP order or exact membership differs from the allowlist'
    for info in release.infolist():
        name = info.filename
        relative = PurePosixPath(name)
        assert not relative.is_absolute() and '..' not in relative.parts and '\\' not in name, f'Unsafe name: {name}'
        assert not info.is_dir() and not (info.flag_bits & 1), f'Unexpected directory or encrypted entry: {name}'
        assert info.compress_type == zipfile.ZIP_DEFLATED, f'Unexpected compression: {name}'
        source = root / name
        assert source.is_file() and source.resolve(strict=True) == source and not source.is_symlink(), f'Unexpected source path: {name}'
        payload = release.read(info)
        assert len(payload) == info.file_size, f'Incorrect size: {name}'
        assert binascii.crc32(payload) & 0xffffffff == info.CRC, f'CRC mismatch: {name}'
        assert payload == source.read_bytes(), f'Payload differs from current source: {name}'
        members.append({'name': name, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()})
    assert json.loads(release.read('manifest.json'))['version'] == '3.1.2', 'Packaged manifest version mismatch'

proof = {
    'version': '3.1.2',
    'version_markers_match_release_workflow': True,
    'worktree': str(root),
    'archive': str(archive),
    'archive_bytes': archive.stat().st_size,
    'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
    'member_count': len(members),
    'exact_ordered_membership': True,
    'all_payloads_equal_current_source': True,
    'crc_valid': True,
    'motion_loads_before_capture_and_workspace': True,
    'members': members,
}
output = root / '.test-output/v3.1.2/release-verification.json'
output.parent.mkdir(parents=True, exist_ok=True)
assert not any(path.is_symlink() for path in (output, *output.parents)), 'Symlinked verification output'
with output.open('x', encoding='utf-8') as destination:
    json.dump(proof, destination, ensure_ascii=False, indent=2)
    destination.write('\n')
print(json.dumps({key: value for key, value in proof.items() if key != 'members'}, ensure_ascii=False, indent=2))
print(f'Proof: {output}')

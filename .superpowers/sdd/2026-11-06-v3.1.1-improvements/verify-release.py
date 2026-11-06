"""Read-only verification of the final local archive; no extraction or moves."""
import base64
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

root = Path(sys.argv[1])
assert root.is_absolute() and root.resolve() == root and not root.is_symlink()
archive = root / "ppt-capture.zip"
assert archive.is_file() and not archive.is_symlink()
script = (root / "scripts/release.cjs").read_text(encoding="utf-8")
block = re.search(r"const files = \[(.*?)\n\];", script, re.S)
assert block, "Release allowlist was not found"
expected = re.findall(r"'([^']+)'", block.group(1))
assert len(expected) == 33 and len(set(expected)) == 33
assert "icons/readme-banner.svg" in expected
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
package = json.loads((root / "package.json").read_text(encoding="utf-8"))
lock = json.loads((root / "package-lock.json").read_text(encoding="utf-8"))
assert manifest["version"] == package["version"] == lock["version"] == lock["packages"][""]["version"] == "3.1.1"
assert "test:improvements" in package["scripts"]
contents = []
with zipfile.ZipFile(archive) as release:
    assert release.namelist() == expected, "Archive membership/order differs from the release allowlist"
    assert release.testzip() is None, "CRC validation failed"
    for entry in release.infolist():
        relative = PurePosixPath(entry.filename)
        assert not relative.is_absolute() and ".." not in relative.parts and "\\" not in entry.filename
        source = root / entry.filename
        assert source.is_file() and not source.is_symlink() and source.resolve().is_relative_to(root)
        data = release.read(entry)
        assert data == source.read_bytes(), f"Archive does not contain the current source: {entry.filename}"
        assert entry.compress_type == zipfile.ZIP_DEFLATED
        contents.append({"name": entry.filename, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    assert json.loads(release.read("manifest.json"))["version"] == "3.1.1"
    banner = release.read("icons/readme-banner.svg")
    assert not re.search(br"<!\s*(DOCTYPE|ENTITY)", banner, re.I)
    svg = ET.fromstring(banner)
    namespace = "{http://www.w3.org/2000/svg}"
    assert svg.tag == namespace + "svg" and svg.get("viewBox")
    for label in ["title", "desc"]:
        node = svg.find(namespace + label)
        assert node is not None and "".join(node.itertext()).strip()
    images, styles = [], []
    original_logo = release.read("icons/logo-1024.png")
    for node in svg.iter():
        tag = node.tag.rsplit("}", 1)[-1]
        assert tag not in {"script", "foreignObject"}
        if tag == "style":
            styles.append("".join(node.itertext()))
        for key, value in node.attrib.items():
            attribute = key.rsplit("}", 1)[-1]
            assert not attribute.lower().startswith("on")
            if attribute == "style":
                styles.append(value)
            if attribute == "href":
                if tag == "image":
                    assert value.startswith("data:image/png;base64,")
                    decoded = base64.b64decode(re.sub(r"\s+", "", value.split(",", 1)[1]), validate=True)
                    assert decoded == original_logo, "Banner logo differs from the existing PNG"
                    images.append(decoded)
                else:
                    assert value.startswith("#"), "Banner has an external reference"
            for reference in re.findall(r"url\(\s*['\"]?([^)'\"\s]+)", value):
                assert reference.startswith("#"), "Banner has an external paint reference"
    assert len(images) == 1
    for style in styles:
        assert not re.search(r"@(?:import|font-face)\b", style, re.I)
        assert all(reference.startswith("#") for reference in re.findall(r"url\(\s*['\"]?([^)'\"\s]+)", style))
    readme = release.read("README.md").decode("utf-8")
    assert "icons/readme-banner.svg" in readme
    assert not re.search(r"^#\s+XJTU PPT Capture Extension\s*$", readme, re.M)
report = {
    "version": "3.1.1",
    "archive": str(archive),
    "archive_bytes": archive.stat().st_size,
    "archive_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
    "file_count": len(contents),
    "crc_valid": True,
    "exact_allowlist_and_source_bytes": True,
    "banner": {
        "name": "icons/readme-banner.svg",
        "svg_sha256": hashlib.sha256(banner).hexdigest(),
        "viewBox": svg.get("viewBox"),
        "self_contained": True,
        "embedded_logo_bytes": len(original_logo),
        "embedded_logo_sha256": hashlib.sha256(original_logo).hexdigest(),
        "embedded_logo_matches_original": True,
        "readme_reference_and_title_removal": True,
    },
    "files": contents,
}
output = root / ".test-output/v3.1.1/release-verification.json"
output.parent.mkdir(parents=True, exist_ok=True)
assert not output.is_symlink()
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({key: value for key, value in report.items() if key != "files"}, ensure_ascii=False, indent=2))
print(f"Verification report: {output}")

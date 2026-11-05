$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$project = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $project ('.test-output/release-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
foreach ($file in Get-ChildItem -LiteralPath $project -File) {
  if ($file.Name -eq 'LICENSE' -or $file.Extension -in @('.js', '.json', '.html', '.css', '.md', '.txt')) { Copy-Item -LiteralPath $file.FullName -Destination $fixture }
}
Copy-Item -LiteralPath (Join-Path $project 'vendor') -Destination $fixture -Recurse
Copy-Item -LiteralPath (Join-Path $project 'icons') -Destination $fixture -Recurse
$release = Join-Path $project 'scripts/release.ps1'
function File-Hash([string]$Path) {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($Path)
  try { return [System.BitConverter]::ToString($algorithm.ComputeHash($stream)) } finally { $stream.Dispose(); $algorithm.Dispose() }
}
function Set-FixtureVersion([string]$Version) {
  foreach ($name in @('manifest.json', 'package.json')) {
    $path = Join-Path $fixture $name
    $data = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    $data.version = $Version
    [System.IO.File]::WriteAllText($path, ($data | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding($false)))
  }
}
Set-FixtureVersion '1.0.0'
& $release -Root $fixture
$latest = Join-Path $fixture 'ppt-capture.zip'
$oldHash = File-Hash $latest
Copy-Item -LiteralPath $latest -Destination (Join-Path $fixture 'legacy.zip')
Set-FixtureVersion '2.4.0'
& $release -Root $fixture
$archive = Join-Path $fixture 'last-release/ppt-capture-v1.0.0.zip'
if ((File-Hash $archive) -ne $oldHash) { throw 'Old release changed during archival' }
if (-not (Test-Path -LiteralPath (Join-Path $fixture 'last-release/legacy.zip'))) { throw 'Legacy root ZIP was not archived' }
& $release -Root $fixture
& $release -Root $fixture
$rootZIPs = @(Get-ChildItem -LiteralPath $fixture -File -Filter '*.zip')
if ($rootZIPs.Count -ne 1 -or $rootZIPs[0].Name -ne 'ppt-capture.zip') { throw 'Root must contain only latest ZIP' }
if (@(Get-ChildItem -LiteralPath (Join-Path $fixture 'last-release') -File -Filter '*.zip').Count -ne 4) { throw 'A historical collision was overwritten' }
$zip = [System.IO.Compression.ZipFile]::OpenRead($latest)
try {
  $reader = New-Object System.IO.StreamReader($zip.GetEntry('manifest.json').Open())
  try { $version = ($reader.ReadToEnd() | ConvertFrom-Json).version } finally { $reader.Dispose() }
  if ($version -ne '2.4.0' -or $zip.Entries.Count -ne 25 -or -not $zip.GetEntry('course.js') -or -not $zip.GetEntry('batch.js') -or -not $zip.GetEntry('README.md')) { throw 'Latest package has wrong contents' }
  $license = $zip.GetEntry('LICENSE')
  if (-not $license) { throw 'Latest package is missing project license' }
  $reader = New-Object System.IO.StreamReader($license.Open())
  try { $packagedLicense = $reader.ReadToEnd() } finally { $reader.Dispose() }
  $sourceLicense = Get-Content -LiteralPath (Join-Path $project 'LICENSE') -Raw -Encoding UTF8
  if ($packagedLicense -cne $sourceLicense) { throw 'Packaged project license differs from source' }
  foreach ($size in @(16, 32, 48, 128)) {
    if (-not $zip.GetEntry("icons/icon-$size.png")) { throw "Latest package is missing icon-$size.png" }
  }
  foreach ($browser in @('chrome', 'edge', 'brave')) {
    if (-not $zip.GetEntry("icons/browsers/$browser.svg")) { throw "Latest package is missing $browser.svg" }
  }
  if (-not $zip.GetEntry('icons/browsers/LICENSE.txt')) { throw 'Latest package is missing browser logo license' }
  if ($zip.Entries.FullName -match '^(tests|\.git|last-release|node_modules)/') { throw 'Development/private data leaked into ZIP' }
} finally { $zip.Dispose() }
$beforeFailure = File-Hash $latest
Move-Item -LiteralPath (Join-Path $fixture 'course.js') -Destination (Join-Path $fixture 'course.backup')
$failed = $false
try { & $release -Root $fixture } catch { $failed = $true }
if (-not $failed -or (File-Hash $latest) -ne $beforeFailure) { throw 'Failed build modified existing latest ZIP' }
Write-Output 'Release tests passed: only latest in root, versioned history retained, collisions preserved, failed build leaves latest untouched.'

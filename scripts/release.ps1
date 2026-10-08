param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$releaseRoot = (Resolve-Path -LiteralPath $Root).Path
$history = Join-Path $releaseRoot 'last-release'
$temporary = Join-Path $releaseRoot 'tmp'
$latest = Join-Path $releaseRoot 'ppt-capture.zip'
$files = @('manifest.json', 'background.js', 'media.js', 'course.js', 'content.js', 'page-hook.js', 'capture.html', 'capture.js', 'scanner.js', 'pdf.js', 'style.css', 'README.md', 'THIRD_PARTY_NOTICES.md')
# Resolve the Chinese filename without relying on Windows PowerShell's ANSI decoding.
$instructions = ([char]0x4f7f).ToString() + [char]0x7528 + [char]0x8bf4 + [char]0x660e + '.txt'
$files += $instructions
$files += @('vendor/hls.min.js', 'vendor/hls.LICENSE')
foreach ($relative in $files) {
  if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot $relative) -PathType Leaf)) { throw "Missing release file: $relative" }
}
$manifest = Get-Content -LiteralPath (Join-Path $releaseRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version' }
$package = Get-Content -LiteralPath (Join-Path $releaseRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($package.version -ne $manifest.version) { throw 'manifest.json and package.json versions differ' }
New-Item -ItemType Directory -Path $history, $temporary -Force | Out-Null
$staged = Join-Path $temporary ('release-' + [guid]::NewGuid().ToString('N') + '.zip')
$zip = [System.IO.Compression.ZipFile]::Open($staged, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relative in $files) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $releaseRoot $relative), $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $zip.Dispose() }
# Build and verify first; a failure above leaves the existing latest ZIP untouched.
$zip = [System.IO.Compression.ZipFile]::OpenRead($staged)
try {
  if ($zip.Entries.Count -ne $files.Count -or -not $zip.GetEntry('manifest.json')) { throw 'Release ZIP validation failed' }
} finally { $zip.Dispose() }

foreach ($old in Get-ChildItem -LiteralPath $releaseRoot -File -Filter '*.zip') {
  $name = $old.Name
  if ($name -ieq 'ppt-capture.zip') {
    $oldVersion = 'unknown'
    try {
      $zip = [System.IO.Compression.ZipFile]::OpenRead($old.FullName)
      try {
        $entry = $zip.GetEntry('manifest.json')
        if (-not $entry) { $entry = $zip.Entries | Where-Object { $_.FullName -match '(^|/)manifest\.json$' } | Select-Object -First 1 }
        if ($entry) {
          $reader = New-Object System.IO.StreamReader($entry.Open())
          try { $oldManifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
          if ($oldManifest.version -match '^\d+(?:\.\d+){1,3}$') { $oldVersion = $oldManifest.version }
        }
      } finally { $zip.Dispose() }
    } catch { Write-Warning 'Old ZIP version could not be read; preserving it as unknown.' }
    $name = "ppt-capture-v$oldVersion.zip"
  }
  $destination = Join-Path $history $name
  if (Test-Path -LiteralPath $destination) {
    # Preserve colliding releases; never overwrite a historical archive.
    $base = [System.IO.Path]::GetFileNameWithoutExtension($name)
    $suffix = Get-Date -Format 'yyyyMMdd-HHmmss'
    $counter = 1
    do { $destination = Join-Path $history ("$base-$suffix-$counter.zip"); $counter++ } while (Test-Path -LiteralPath $destination)
  }
  $resolvedDestination = [System.IO.Path]::GetFullPath($destination)
  if ([System.IO.Path]::GetDirectoryName($old.FullName) -ne $releaseRoot -or [System.IO.Path]::GetDirectoryName($resolvedDestination) -ne $history) { throw 'Archive target escapes release directory' }
  Move-Item -LiteralPath $old.FullName -Destination $resolvedDestination
  Write-Output "Archived: $resolvedDestination"
}
Move-Item -LiteralPath $staged -Destination $latest
Write-Output "Latest v$($manifest.version): $latest"

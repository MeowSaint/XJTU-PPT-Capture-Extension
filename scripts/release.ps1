param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'release.cjs') $Root
if ($LASTEXITCODE -ne 0) { throw "Node release failed (exit $LASTEXITCODE)." }

$ErrorActionPreference = 'Stop'
& node --test (Join-Path $PSScriptRoot 'release.test.cjs')
if ($LASTEXITCODE -ne 0) { throw "Node release tests failed (exit $LASTEXITCODE)." }

$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

Write-Host ''
Write-Host 'Starting Dubliner Checklist on http://localhost:5001 ...' -ForegroundColor Cyan
Write-Host ''

npm.cmd start

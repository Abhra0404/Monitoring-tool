<#
  Theoria agent installer — Windows (PowerShell 5.1+).

  Creates a Windows service named "TheoriaAgent" that runs the Go agent
  under the built-in LocalService account with Automatic (Delayed) start.
  Uses the native `sc.exe` (no third-party nssm needed).

  Usage (elevated PowerShell):
    iwr https://raw.githubusercontent.com/theoria-monitoring/theoria/main/deploy/agent/install.ps1 -UseBasicParsing | iex
    Install-TheoriaAgent -Url https://monitor.example.com -Key <API_KEY>

  Or with an onboarding token:
    Install-TheoriaAgent -Token <JWT>
#>

[CmdletBinding()]
param(
  [string]$Url,
  [string]$Key,
  [string]$Id = $env:COMPUTERNAME,
  [string]$Token,
  [switch]$Docker,
  [string]$Version = 'latest',
  [string]$Repo = 'theoria-monitoring/theoria',
  [string]$InstallDir = "$env:ProgramFiles\Theoria"
)

function Ensure-Admin {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'install.ps1 must be run from an elevated PowerShell (Run as Administrator).'
  }
}

function Resolve-OnboardingToken {
  param([string]$Token)
  $parts = $Token.Split('.')
  if ($parts.Length -lt 2) { throw 'Invalid onboarding token (not a JWT).' }
  $b64 = $parts[1].Replace('-', '+').Replace('_', '/')
  switch ($b64.Length % 4) { 2 { $b64 += '==' } 3 { $b64 += '=' } }
  $payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
  if (-not $payload.url) { throw 'Token missing "url" claim.' }
  $response = Invoke-RestMethod -Method Post `
    -Uri "$($payload.url)/api/auth/onboarding/verify" `
    -ContentType 'application/json' `
    -Body (@{ token = $Token } | ConvertTo-Json)
  return [pscustomobject]@{
    Url      = $payload.url
    Key      = $response.apiKey
    ServerId = $response.serverId
  }
}

function Install-TheoriaAgent {
  Ensure-Admin

  if ($Token) {
    $resolved = Resolve-OnboardingToken -Token $Token
    if (-not $Url) { $Url = $resolved.Url }
    if (-not $Key) { $Key = $resolved.Key }
    if ($resolved.ServerId) { $Id = $resolved.ServerId }
  }

  if (-not $Url -or -not $Key) {
    throw 'Pass -Url and -Key (or -Token).'
  }

  # ─── Download binary ────────────────────────────────────────────────────
  $binary = 'theoria-agent-windows-amd64.exe'
  $downloadUrl = if ($Version -eq 'latest') {
    "https://github.com/$Repo/releases/latest/download/$binary"
  } else {
    "https://github.com/$Repo/releases/download/$Version/$binary"
  }
  Write-Host "→ Downloading $downloadUrl"
  if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir | Out-Null }
  $exePath = Join-Path $InstallDir 'theoria-agent.exe'
  Invoke-WebRequest -Uri $downloadUrl -OutFile $exePath -UseBasicParsing

  # ─── Service ────────────────────────────────────────────────────────────
  $service = 'TheoriaAgent'
  $dockerFlag = if ($Docker) { 'true' } else { 'false' }
  $binPath = '"' + $exePath + '"' +
             " --url `"$Url`"" +
             " --key `"$Key`"" +
             " --id `"$Id`"" +
             " --docker=$dockerFlag"

  if (Get-Service -Name $service -ErrorAction SilentlyContinue) {
    Write-Host "→ Service $service already exists — stopping + updating binPath"
    Stop-Service -Name $service -ErrorAction SilentlyContinue
    & sc.exe config $service binPath= $binPath start= delayed-auto obj= 'NT AUTHORITY\LocalService' | Out-Null
  } else {
    & sc.exe create $service binPath= $binPath start= delayed-auto obj= 'NT AUTHORITY\LocalService' DisplayName= 'Theoria Agent' | Out-Null
    & sc.exe description $service 'Theoria Agent — system metrics collector' | Out-Null
    & sc.exe failure $service reset= 86400 actions= restart/10000/restart/10000/restart/30000 | Out-Null
  }

  Start-Service -Name $service
  Write-Host "✓ $service running — Get-Service $service"
}

# Auto-invoke when called directly (not when dot-sourced for the one-liner).
if ($MyInvocation.InvocationName -notin '.', 'Source' -and ($Url -or $Token)) {
  Install-TheoriaAgent
}

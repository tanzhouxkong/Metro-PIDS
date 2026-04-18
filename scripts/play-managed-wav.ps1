param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System

$resolved = [System.IO.Path]::GetFullPath($Path)
if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
  throw "file-not-found: $resolved"
}

$player = New-Object System.Media.SoundPlayer
$player.SoundLocation = $resolved
$player.Load()
$player.PlaySync()

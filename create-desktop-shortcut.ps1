$workspace = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath("Desktop")
$shell = New-Object -ComObject WScript.Shell

$startTarget = Join-Path $workspace "start-kinoauk.cmd"
$stopTarget = Join-Path $workspace "stop-kinoauk.cmd"

Get-ChildItem -LiteralPath $desktop -Filter "*.lnk" | ForEach-Object {
  $shortcut = $shell.CreateShortcut($_.FullName)
  if ($shortcut.TargetPath -eq $startTarget -or $shortcut.TargetPath -eq $stopTarget) {
    Remove-Item -LiteralPath $_.FullName -Force
  }
}

function New-Shortcut($codes, $target, $icon) {
  $name = -join ($codes | ForEach-Object { [char]$_ })
  $path = Join-Path $desktop ($name + ".lnk")
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $target
  $shortcut.WorkingDirectory = $workspace
  $shortcut.Description = $name
  $shortcut.IconLocation = $icon
  $shortcut.Save()
  Write-Host "Created shortcut: $path"
}

New-Shortcut `
  -codes @(1050,1080,1085,1086,1072,1091,1082,32,1052,1072,1082,1089,1080,1084,1072,32,1080,32,1054,1083,1080) `
  -target $startTarget `
  -icon "$env:SystemRoot\System32\shell32.dll,137"

New-Shortcut `
  -codes @(1054,1089,1090,1072,1085,1086,1074,1080,1090,1100,32,1050,1080,1085,1086,1072,1091,1082) `
  -target $stopTarget `
  -icon "$env:SystemRoot\System32\shell32.dll,131"

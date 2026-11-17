$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
py -3 -m venv .venv
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
& ".\.venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean --windowed --name PrezcioPlataforma `
    --icon prezio.ico --collect-all webview --collect-all clr_loader --hidden-import clr plataforma.py
if (-not (Test-Path ".\dist\PrezcioPlataforma\PrezcioPlataforma.exe")) { throw "No se generó PrezcioPlataforma.exe" }
Write-Host "App creada: $PSScriptRoot\dist\PrezcioPlataforma"

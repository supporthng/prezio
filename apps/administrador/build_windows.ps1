$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
py -3 -m venv .venv
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
# Carpeta (onedir): pywebview + pythonnet funcionan mejor así. Incluye el conector y la ventana.
& ".\.venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean --windowed --name PrezioAdministrador `
    --icon prezio.ico --paths ..\..\conector --hidden-import prezio_conector --hidden-import pyodbc `
    --add-data "interfaz.html;." --collect-all webview --collect-all clr_loader --hidden-import clr administrador.py
if (-not (Test-Path ".\dist\PrezioAdministrador\PrezioAdministrador.exe")) { throw "No se generó PrezioAdministrador.exe" }
& ".\.venv\Scripts\python.exe" -c "import pyodbc; print('pyodbc', pyodbc.version)"
Write-Host "App creada: $PSScriptRoot\dist\PrezioAdministrador"

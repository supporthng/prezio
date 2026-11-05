; Instalador de Prezcio para Windows (verificador tipo quiosco).
; Se instala para el usuario actual (no pide administrador) y arranca al iniciar sesión.
#define MyAppName "Prezcio"
#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif
#define MyAppExeName "Prezio.exe"
[Setup]
AppId={{6F2D9A41-8C3B-4E75-A1D0-5B7E2C9F1A04}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Prezcio
DefaultDirName={localappdata}\Programs\Prezio
DefaultGroupName=Prezcio
DisableProgramGroupPage=yes
OutputDir=..\..\dist_instalador
OutputBaseFilename=Instalador_Prezio
SetupIconFile=prezio.ico
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=force
RestartApplications=no
[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"
[Tasks]
Name: "inicio"; Description: "Abrir automáticamente al iniciar Windows (recomendado para el verificador)"
Name: "escritorio"; Description: "Crear un acceso directo en el escritorio"
[Files]
Source: "dist\Prezio\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[InstallDelete]
; Los accesos directos con el nombre anterior (Prezio) se reemplazan por los de Prezcio.
Type: files; Name: "{group}\Prezio.lnk"
Type: files; Name: "{userdesktop}\Prezio.lnk"

[Icons]
Name: "{group}\Prezcio"; Filename: "{app}\{#MyAppExeName}"
Name: "{userdesktop}\Prezcio"; Filename: "{app}\{#MyAppExeName}"; Tasks: escritorio
[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Prezio"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: inicio
[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir Prezcio ahora"; Flags: postinstall nowait skipifsilent
; Actualización automática (instalación silenciosa desde la app): volver a abrirla al terminar.
Filename: "{app}\{#MyAppExeName}"; Flags: nowait; Check: WizardSilent

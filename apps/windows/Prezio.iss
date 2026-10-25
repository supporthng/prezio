; Instalador de Prezio para Windows (verificador tipo quiosco).
; Se instala para el usuario actual (no pide administrador) y arranca al iniciar sesión.
#define MyAppName "Prezio"
#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif
#define MyAppExeName "Prezio.exe"
[Setup]
AppId={{6F2D9A41-8C3B-4E75-A1D0-5B7E2C9F1A04}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Prezio
DefaultDirName={localappdata}\Programs\Prezio
DefaultGroupName=Prezio
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
[Icons]
Name: "{group}\Prezio"; Filename: "{app}\{#MyAppExeName}"
Name: "{userdesktop}\Prezio"; Filename: "{app}\{#MyAppExeName}"; Tasks: escritorio
[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Prezio"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: inicio
[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir Prezio ahora"; Flags: postinstall nowait skipifsilent
; Actualización automática (instalación silenciosa desde la app): volver a abrirla al terminar.
Filename: "{app}\{#MyAppExeName}"; Flags: nowait; Check: WizardSilent

; Instalador de Prezcio Plataforma (la administración del portal: negocios, licencias, pagos y planes).
; Se instala para el usuario actual (no pide administrador).
#define MyAppName "Prezcio Plataforma"
#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif
#define MyAppExeName "PrezcioPlataforma.exe"
[Setup]
AppId={{F0311C52-AFF1-4EE4-9283-3C75BAA906B7}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Prezcio
DefaultDirName={localappdata}\Programs\PrezcioPlataforma
DefaultGroupName=Prezcio
DisableProgramGroupPage=yes
OutputDir=..\..\dist_instalador
OutputBaseFilename=Instalador_Prezcio_Plataforma
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
Name: "escritorio"; Description: "Crear un acceso directo en el escritorio"
[Files]
Source: "dist\PrezcioPlataforma\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\Prezcio Plataforma"; Filename: "{app}\{#MyAppExeName}"
Name: "{userdesktop}\Prezcio Plataforma"; Filename: "{app}\{#MyAppExeName}"; Tasks: escritorio
[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir Prezcio Plataforma ahora"; Flags: postinstall nowait skipifsilent
; Actualización desde la app (instalación silenciosa): volver a abrirla al terminar.
Filename: "{app}\{#MyAppExeName}"; Flags: nowait; Check: WizardSilent

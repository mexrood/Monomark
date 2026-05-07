; Custom NSIS macros for Monomark installer — MINIMAL version.
;
; Heavy cleanup (registry, C:\Program Files, Defender exclusion) is done by
; scripts/cleanup.ps1 which the user runs ONCE manually as admin.
;
; This installer.nsh does only the bare minimum to avoid triggering AV
; behavioral detection (CrowdStrike was silently killing the installer when
; it ran taskkill+wmic+runas in quick succession).

!macro customInit
  ; Soft kill of any running Monomark — single attempt, no /T flag, no wmic
  nsExec::ExecToStack 'taskkill /F /IM Monomark.exe'
  Pop $0
  Pop $0

  ; Force install directory to LocalAppData (override any registry-based default)
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Monomark"
!macroend


!macro customInit
  ; 安装前清理旧版本残留的 displays 目录，避免覆盖安装后仍看到旧文件
  Push $0
  StrCpy $0 "$INSTDIR\resources\app.asar.unpacked\displays"
  IfFileExists "$0\*.*" 0 skip_cleanup
    RMDir /r "$0"
  skip_cleanup:
  Pop $0
!macroend

!macro customUnInstall
  ; 以前这里会检测 Metro-PIDS 是否正在运行，导致卸载时可能卡住
  ; 现在不再做强制检测，直接允许卸载（交给系统处理正在运行的进程）
!macroend

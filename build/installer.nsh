
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
<<<<<<< Updated upstream
<<<<<<< Updated upstream
  ; 防止卸载时程序仍在运行
  Push $0

  loop_check_app:
    ; 根据窗口标题查找应用主窗口（标题：Metro-PIDS）
    FindWindow $0 "" "Metro-PIDS"
    StrCmp $0 0 done_check_app

    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
      "检测到 Metro-PIDS 正在运行，请先关闭应用后再继续卸载。" \
      IDRETRY loop_check_app IDCANCEL cancel_uninstall

  cancel_uninstall:
    Pop $0
    Abort

  done_check_app:
    Pop $0
=======
  ; 以前这里会检测 Metro-PIDS 是否正在运行，导致卸载时可能卡住
  ; 现在不再做强制检测，直接允许卸载（交给系统处理正在运行的进程）
>>>>>>> Stashed changes
=======
  ; 以前这里会检测 Metro-PIDS 是否正在运行，导致卸载时可能卡住
  ; 现在不再做强制检测，直接允许卸载（交给系统处理正在运行的进程）
>>>>>>> Stashed changes
!macroend

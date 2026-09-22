@echo off
chcp 65001>nul
setlocal
set "APP_DIR=%~dp0"
powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\董解析.lnk'); $s.TargetPath='%APP_DIR%启动智几何.bat'; $s.WorkingDirectory='%APP_DIR%'; $s.Description='启动本地董解析解题与动态图形工作台'; $s.Save()"
echo 已在桌面创建“董解析”快捷方式。
pause

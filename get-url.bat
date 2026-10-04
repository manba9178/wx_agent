@echo off
chcp 65001 >nul
cd /d e:\codebuddy\wx_agent

powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; $u = Select-String -Path tunnel.log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | ForEach-Object { $_.Matches.Value } | Select-Object -Unique | Select-Object -Last 1; if ($u) { $cb = $u + '/wecom/callback'; Write-Output ''; Write-Output '  最新公网地址 : ' $u; Write-Output '  回调地址(填后台) : ' $cb; Set-Clipboard -Value $cb; Write-Output ''; Write-Output '  [OK] 回调地址已复制到剪贴板, 直接去企业微信后台 Ctrl+V 即可' } else { Write-Output ''; Write-Output '  [X] 没找到 URL, 先双击 start.bat 启动服务' }"

echo.
pause

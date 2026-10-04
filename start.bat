@echo off
chcp 65001 >nul
cd /d e:\codebuddy\wx_agent

echo [1/4] 清理旧进程 ...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='cloudflared.exe'\" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*src/index.ts*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul

if exist server.log del server.log
if exist tunnel.log del tunnel.log

echo [2/4] 启动服务 ...
start "wx-agent" /min cmd /c "e:\codebuddy\wx_agent\.run-server.cmd"

echo [3/4] 启动 cloudflared 隧道 ...
start "cloudflared" /min cmd /c "e:\codebuddy\wx_agent\.run-tunnel.cmd"

echo.
echo [4/4] 等待 14 秒让 cloudflared 建连 ...
timeout /t 14 /nobreak >nul

echo.
echo ============================================================
powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; $u = Select-String -Path tunnel.log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | ForEach-Object { $_.Matches.Value } | Select-Object -Unique | Select-Object -Last 1; if ($u) { $old = $null; if (Test-Path .last-url) { $old = (Get-Content .last-url -ErrorAction SilentlyContinue | Where-Object { $_.Trim() } | Select-Object -First 1); if ($old) { $old = $old.Trim() } }; if ($old -and $old -ne $u) { Write-Output '  [!] URL 已变化, 需要去企业微信后台更新!' ; Write-Output ('  旧地址 : ' + $old); Write-Output ('  新地址 : ' + $u) ; Write-Output ('  回调地址: ' + $u + '/wecom/callback') } else { Write-Output '  [OK] URL 与上次启动相同, 直接可用'; Write-Output ('  公网地址 : ' + $u); Write-Output ('  回调地址 : ' + $u + '/wecom/callback') }; $u | Out-File -FilePath .last-url -Encoding ascii } else { Write-Output '  [X] 未找到 URL, 请检查 tunnel.log' }"
echo ============================================================
echo.
echo  手机/工作台里发条消息试试, 应该秒回 '正在处理...'
echo  关闭所有 cmd 窗口 = 停服
echo ============================================================
pause
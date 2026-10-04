@echo off
chcp 65001 >nul
cd /d e:\codebuddy\wx_agent

echo ============================================================
echo   wx-agent 服务状态
echo ============================================================
echo.

echo [进程]
powershell -NoProfile -Command "$n = Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*src/index.ts*' }; $c = Get-CimInstance Win32_Process -Filter \"Name='cloudflared.exe'\"; if ($n) { Write-Output ('  wx-agent  : 运行中 (PID ' + ($n.ProcessId -join ',') + ')') } else { Write-Output '  wx-agent  : 未运行' }; if ($c) { Write-Output ('  cloudflared: 运行中 (PID ' + ($c.ProcessId -join ',') + ')') } else { Write-Output '  cloudflared: 未运行' }"

echo.
echo [当前对外 URL]
powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; $urls = Select-String -Path tunnel.log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | ForEach-Object { $_.Matches.Value } | Select-Object -Unique; $u = $urls | Select-Object -Last 1; $old = $null; if (Test-Path .last-url) { $old = (Get-Content .last-url -ErrorAction SilentlyContinue | Where-Object { $_.Trim() } | Select-Object -First 1); if ($old) { $old = $old.Trim() } }; if (-not $u) { Write-Output '  未找到 URL, 服务可能没启动或 tunnel.log 不存在'; exit }; Write-Output ('  当前 : ' + $u); if ($urls.Count -gt 1) { Write-Output ('  本次运行期间 URL 轮换过 ' + $urls.Count + ' 个版本(隧道重连), 最新的是上面那个') }; if ($old -and $old -ne $u) { Write-Output ('  启动时: ' + $old); Write-Output '  [!] URL 已变化, 必须去企业微信后台更新回调地址!'; Write-Output ('  新回调地址: ' + $u + '/wecom/callback') } elseif ($old) { Write-Output '  [OK] 与启动时相同' } else { Write-Output '  (没有 .last-url 历史记录, 仅供参考)' }; Write-Output ('  完整回调地址: ' + $u + '/wecom/callback')"

echo.
echo [连通性测试 - 测的是上面这个最新 URL]
powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; $u = Select-String -Path tunnel.log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | ForEach-Object { $_.Matches.Value } | Select-Object -Unique | Select-Object -Last 1; if (-not $u) { Write-Output '  无 URL 可测试, 请先运行 start.bat' } else { try { $r = Invoke-WebRequest ($u + '/') -UseBasicParsing -TimeoutSec 8; Write-Output ('  [OK] HTTP ' + $r.StatusCode + ' : ' + $r.Content + ' (服务+隧道都通畅)') } catch { Write-Output ('  [X] 不可达: ' + $_.Exception.Message); Write-Output '      这个 URL 已失效, 重启 start.bat 换新 URL' } }"

echo.
echo [最后收到的消息 (server.log 最近 4 条)]
powershell -NoProfile -Command "if (Test-Path server.log) { Get-Content server.log -Tail 4 -Encoding UTF8 -ErrorAction SilentlyContinue | ForEach-Object { Write-Output ('  ' + $_) } } else { Write-Output '  server.log 不存在' }"

echo.
pause
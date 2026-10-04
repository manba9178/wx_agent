@echo off
cd /d e:\codebuddy\wx_agent
.\cloudflared.exe tunnel --url http://localhost:3300 > tunnel.log 2>&1
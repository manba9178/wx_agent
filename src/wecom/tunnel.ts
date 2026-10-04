import fs from 'node:fs';
import path from 'node:path';

const TUNNEL_LOG = path.join(process.cwd(), 'tunnel.log');
const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/g;

/**
 * 从 cloudflared 日志里读出当前对外 URL。
 * tunnel.log 里同一个 URL 会出现多次（首次分配 + 后续注册日志），取最后一个即可。
 */
export function getCurrentTunnelUrl(): string | undefined {
  try {
    const content = fs.readFileSync(TUNNEL_LOG, 'utf8');
    const matches = [...content.matchAll(URL_PATTERN)];
    return matches.length ? matches[matches.length - 1][0] : undefined;
  } catch {
    return undefined;
  }
}

/** 启动时把当前 URL 写到 server.log，user 一眼能看到 */
export function logTunnelStatus(label: string): void {
  const url = getCurrentTunnelUrl();
  if (url) console.log(`[tunnel] ${label}: ${url}`);
  else console.log(`[tunnel] ${label}: 未找到 tunnel.log 或 URL 未生成`);
}
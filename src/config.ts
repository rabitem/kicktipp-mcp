import os from 'node:os';
import path from 'node:path';

export type KicktippConfig = {
  baseUrl: string;
  email: string | null;
  password: string | null;
  loginCookie: string | null;
  defaultCommunity: string | null;
  sessionFile: string;
  keychain: {
    enabled: boolean;
    service: string;
    account: string | null;
    host: string;
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): KicktippConfig {
  const baseUrl = (env.KICKTIPP_BASE_URL || 'https://www.kicktipp.de').replace(/\/+$/, '');
  const host = new URL(baseUrl).hostname;
  return {
    baseUrl,
    email: env.KICKTIPP_EMAIL || null,
    password: env.KICKTIPP_PASSWORD || null,
    loginCookie: env.KICKTIPP_LOGIN_COOKIE || null,
    defaultCommunity: env.KICKTIPP_DEFAULT_COMMUNITY || null,
    sessionFile:
      env.KICKTIPP_SESSION_FILE ||
      path.join(os.homedir(), '.cache', 'kicktipp-mcp', 'session.json'),
    keychain: {
      enabled: !['0', 'false', 'no'].includes((env.KICKTIPP_KEYCHAIN || '').toLowerCase()),
      service: env.KICKTIPP_KEYCHAIN_SERVICE || 'kicktipp',
      account: env.KICKTIPP_KEYCHAIN_ACCOUNT || env.KICKTIPP_EMAIL || null,
      host: env.KICKTIPP_KEYCHAIN_HOST || host,
    },
  };
}

export function requireCommunity(config: KicktippConfig, explicit?: string): string {
  const community = explicit || config.defaultCommunity;
  if (!community) {
    throw new Error('community is required; pass it explicitly or set KICKTIPP_DEFAULT_COMMUNITY');
  }
  return community;
}

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { CookieJar } from 'tough-cookie';
import type { KicktippConfig } from '../config.js';

export type CommandRunner = (
  command: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

export type ChromeCookieImportResult = {
  imported: number;
  rejected: number;
  sessionFile: string;
  profilePath: string;
};

type ChromeCookieRow = {
  host_key: string;
  name: string;
  path: string;
  is_secure: number;
  is_httponly: number;
  expires_utc: number;
  value: string | null;
  encrypted_value_hex: string | null;
};

const execFileAsync = promisify(execFile);
const CHROME_SAFE_STORAGE_SERVICE = 'Chrome Safe Storage';
const CHROME_SAFE_STORAGE_ACCOUNT = 'Chrome';
const CHROME_KEY_SALT = 'saltysalt';
const CHROME_IV = Buffer.alloc(16, ' ');

export async function importChromeKicktippSession(
  config: KicktippConfig,
  options: {
    profilePath?: string;
    runner?: CommandRunner;
    platform?: NodeJS.Platform;
  } = {},
): Promise<ChromeCookieImportResult> {
  const platform = options.platform ?? process.platform;
  if (platform !== 'darwin') {
    throw new Error('Chrome session import is only supported on macOS');
  }

  const runner = options.runner ?? defaultCommandRunner;
  const profilePath = options.profilePath ?? defaultChromeProfilePath();
  const rows = await readChromeCookies(path.join(profilePath, 'Cookies'), runner);
  const safeStoragePassword = await readChromeSafeStoragePassword(runner);
  const key = crypto.pbkdf2Sync(safeStoragePassword, CHROME_KEY_SALT, 1003, 16, 'sha1');
  const jar = new CookieJar();
  let imported = 0;
  let rejected = 0;

  for (const row of rows) {
    const value = decryptChromeCookie(row, key);
    const cookie = jar.setCookieSync(formatCookie(row, value), config.baseUrl, { ignoreError: true });
    if (cookie) imported += 1;
    else rejected += 1;
  }

  await saveSessionJar(config, jar);
  return {
    imported,
    rejected,
    sessionFile: config.sessionFile,
    profilePath,
  };
}

async function readChromeCookies(cookieDb: string, runner: CommandRunner): Promise<ChromeCookieRow[]> {
  const query = [
    'select host_key,name,path,is_secure,is_httponly,expires_utc,value,hex(encrypted_value) as encrypted_value_hex',
    "from cookies where host_key like '%kicktipp%' order by host_key,name;",
  ].join(' ');
  const result = await runner('sqlite3', ['-json', cookieDb, query]);
  const parsed = JSON.parse(result.stdout || '[]') as ChromeCookieRow[];
  return parsed.filter((row) => row.host_key && row.name);
}

async function readChromeSafeStoragePassword(runner: CommandRunner): Promise<string> {
  const result = await runner('security', [
    'find-generic-password',
    '-w',
    '-s',
    CHROME_SAFE_STORAGE_SERVICE,
    '-a',
    CHROME_SAFE_STORAGE_ACCOUNT,
  ]);
  const password = result.stdout.trim();
  if (!password) throw new Error('Chrome Safe Storage password was empty');
  return password;
}

function decryptChromeCookie(row: ChromeCookieRow, key: Buffer): string {
  if (!row.encrypted_value_hex) return row.value ?? '';

  const encrypted = Buffer.from(row.encrypted_value_hex, 'hex');
  if (encrypted.subarray(0, 3).toString('utf8') !== 'v10') {
    return row.value ?? '';
  }

  const decipher = crypto.createDecipheriv('aes-128-cbc', key, CHROME_IV);
  let plaintext = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]);
  const domainHash = crypto.createHash('sha256').update(row.host_key).digest();
  if (plaintext.length > domainHash.length && plaintext.subarray(0, domainHash.length).equals(domainHash)) {
    plaintext = plaintext.subarray(domainHash.length);
  }
  return plaintext.toString('utf8');
}

function formatCookie(row: ChromeCookieRow, value: string): string {
  const parts = [`${row.name}=${value}`, `Path=${row.path || '/'}`];
  if (row.host_key.startsWith('.')) parts.push(`Domain=${row.host_key}`);
  if (row.is_secure) parts.push('Secure');
  if (row.is_httponly) parts.push('HttpOnly');
  const expires = chromeTimeToDate(row.expires_utc);
  if (expires) parts.push(`Expires=${expires.toUTCString()}`);
  return parts.join('; ');
}

function chromeTimeToDate(value: number): Date | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Date(value / 1000 - 11644473600000);
}

async function saveSessionJar(config: KicktippConfig, jar: CookieJar): Promise<void> {
  await fs.mkdir(path.dirname(config.sessionFile), { recursive: true });
  await fs.writeFile(
    config.sessionFile,
    `${JSON.stringify(
      {
        baseUrl: config.baseUrl,
        jar: jar.toJSON(),
        savedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  await fs.chmod(config.sessionFile, 0o600);
}

function defaultChromeProfilePath(): string {
  return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'Default');
}

async function defaultCommandRunner(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
  });
  return { stdout, stderr };
}

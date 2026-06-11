import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CookieJar } from 'tough-cookie';
import { importChromeKicktippSession, type CommandRunner } from '../src/auth/chrome-session.js';
import { loadConfig } from '../src/config.js';

const safeStoragePassword = 'chrome-safe-storage-secret';
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Chrome session import', () => {
  it('imports encrypted Kicktipp cookies into the session jar', async () => {
    const tempDir = makeTempDir();
    const sessionFile = path.join(tempDir, 'session.json');
    const cookieRows = [
      {
        host_key: '.kicktipp.de',
        name: 'login',
        path: '/',
        is_secure: 1,
        is_httponly: 1,
        expires_utc: 13457198853900986,
        value: '',
        encrypted_value_hex: encryptChromeValue('.kicktipp.de', 'login-cookie-value'),
      },
      {
        host_key: 'www.kicktipp.de',
        name: 'SESSION',
        path: '/',
        is_secure: 1,
        is_httponly: 1,
        expires_utc: 0,
        value: '',
        encrypted_value_hex: encryptChromeValue('www.kicktipp.de', 'session-cookie-value'),
      },
    ];
    const runner: CommandRunner = async (command) => {
      if (command === 'security') return { stdout: `${safeStoragePassword}\n`, stderr: '' };
      if (command === 'sqlite3') return { stdout: JSON.stringify(cookieRows), stderr: '' };
      throw new Error(`unexpected command ${command}`);
    };

    const result = await importChromeKicktippSession(
      loadConfig({
        KICKTIPP_BASE_URL: 'https://www.kicktipp.de',
        KICKTIPP_SESSION_FILE: sessionFile,
      }),
      {
        profilePath: path.join(tempDir, 'Chrome', 'Default'),
        runner,
        platform: 'darwin',
      },
    );

    expect(result).toMatchObject({ imported: 2, rejected: 0, sessionFile });
    expect((fs.statSync(sessionFile).mode & 0o777).toString(8)).toBe('600');

    const stored = JSON.parse(fs.readFileSync(sessionFile, 'utf8')) as { jar: unknown };
    const jar = CookieJar.fromJSON(stored.jar as never);
    expect(jar.getCookieStringSync('https://www.kicktipp.de')).toContain('login=login-cookie-value');
    expect(jar.getCookieStringSync('https://www.kicktipp.de')).toContain('SESSION=session-cookie-value');
  });

  it('rejects Chrome import outside macOS', async () => {
    await expect(
      importChromeKicktippSession(loadConfig({ KICKTIPP_BASE_URL: 'https://www.kicktipp.de' }), {
        platform: 'linux',
      }),
    ).rejects.toThrow('only supported on macOS');
  });
});

function encryptChromeValue(domain: string, value: string): string {
  const key = crypto.pbkdf2Sync(safeStoragePassword, 'saltysalt', 1003, 16, 'sha1');
  const iv = Buffer.alloc(16, ' ');
  const payload = Buffer.concat([crypto.createHash('sha256').update(domain).digest(), Buffer.from(value)]);
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([Buffer.from('v10'), cipher.update(payload), cipher.final()]).toString('hex');
}

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kicktipp-chrome-session-'));
  tempDirs.push(dir);
  return dir;
}

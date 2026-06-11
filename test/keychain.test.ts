import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import {
  credentialsFromEnvironment,
  credentialsFromMacOSKeychain,
  type SecurityCommandRunner,
} from '../src/auth/keychain.js';

describe('credential resolution', () => {
  it('uses explicit environment credentials first', () => {
    const config = loadConfig({
      KICKTIPP_BASE_URL: 'https://www.kicktipp.de',
      KICKTIPP_EMAIL: 'user@example.com',
      KICKTIPP_PASSWORD: 'secret',
    });

    expect(credentialsFromEnvironment(config)).toEqual({
      email: 'user@example.com',
      password: 'secret',
      source: 'environment',
    });
  });

  it('reads a generic macOS Keychain password for a configured account', async () => {
    const config = loadConfig({
      KICKTIPP_BASE_URL: 'https://www.kicktipp.de',
      KICKTIPP_KEYCHAIN_SERVICE: 'kicktipp',
      KICKTIPP_KEYCHAIN_ACCOUNT: 'user@example.com',
    });
    const calls: string[][] = [];
    const runner: SecurityCommandRunner = async (args) => {
      calls.push(args);
      return { stdout: 'keychain-secret\n', stderr: '' };
    };

    await expect(credentialsFromMacOSKeychain(config, runner, 'darwin')).resolves.toEqual({
      email: 'user@example.com',
      password: 'keychain-secret',
      source: 'macos-keychain-generic',
    });
    expect(calls).toEqual([
      ['find-generic-password', '-s', 'kicktipp', '-a', 'user@example.com', '-w'],
    ]);
  });

  it('falls back to internet password items when generic lookup misses', async () => {
    const config = loadConfig({
      KICKTIPP_BASE_URL: 'https://www.kicktipp.de',
      KICKTIPP_KEYCHAIN_ACCOUNT: 'user@example.com',
    });
    const runner: SecurityCommandRunner = async (args) => {
      if (args[0] === 'find-generic-password') throw new Error('not found');
      return { stdout: 'internet-secret\n', stderr: '' };
    };

    await expect(credentialsFromMacOSKeychain(config, runner, 'darwin')).resolves.toEqual({
      email: 'user@example.com',
      password: 'internet-secret',
      source: 'macos-keychain-internet',
    });
  });

  it('does not query Keychain on non-macOS platforms', async () => {
    const config = loadConfig({ KICKTIPP_BASE_URL: 'https://www.kicktipp.de' });
    const runner: SecurityCommandRunner = async () => {
      throw new Error('should not be called');
    };

    await expect(credentialsFromMacOSKeychain(config, runner, 'linux')).resolves.toBeNull();
  });
});

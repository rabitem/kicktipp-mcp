import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { KicktippConfig } from '../config.js';

export type CredentialSource = 'environment' | 'macos-keychain-generic' | 'macos-keychain-internet';

export type KicktippCredentials = {
  email: string;
  password: string;
  source: CredentialSource;
};

export type SecurityCommandRunner = (
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

const execFileAsync = promisify(execFile);

export function credentialsFromEnvironment(config: KicktippConfig): KicktippCredentials | null {
  if (!config.email || !config.password) return null;
  return {
    email: config.email,
    password: config.password,
    source: 'environment',
  };
}

export async function credentialsFromMacOSKeychain(
  config: KicktippConfig,
  runner: SecurityCommandRunner = defaultSecurityRunner,
  platform = process.platform,
): Promise<KicktippCredentials | null> {
  if (!config.keychain.enabled || platform !== 'darwin') return null;

  const generic = await readGenericPassword(config, runner);
  if (generic) return generic;

  return readInternetPassword(config, runner);
}

async function readGenericPassword(
  config: KicktippConfig,
  runner: SecurityCommandRunner,
): Promise<KicktippCredentials | null> {
  const account = config.keychain.account ?? (await findAccount(['find-generic-password', '-s', config.keychain.service], runner));
  if (!account) return null;

  const password = await findPassword(
    ['find-generic-password', '-s', config.keychain.service, '-a', account, '-w'],
    runner,
  );
  if (!password) return null;

  return {
    email: account,
    password,
    source: 'macos-keychain-generic',
  };
}

async function readInternetPassword(
  config: KicktippConfig,
  runner: SecurityCommandRunner,
): Promise<KicktippCredentials | null> {
  const account = config.keychain.account ?? (await findAccount(['find-internet-password', '-s', config.keychain.host], runner));
  if (!account) return null;

  const password = await findPassword(
    ['find-internet-password', '-s', config.keychain.host, '-a', account, '-w'],
    runner,
  );
  if (!password) return null;

  return {
    email: account,
    password,
    source: 'macos-keychain-internet',
  };
}

async function findAccount(args: string[], runner: SecurityCommandRunner): Promise<string | null> {
  const output = await runSecurity(args, runner);
  if (!output) return null;
  return output.match(/"acct"<blob>="([^"]+)"/)?.[1] ?? null;
}

async function findPassword(args: string[], runner: SecurityCommandRunner): Promise<string | null> {
  const output = await runSecurity(args, runner);
  const password = output?.trim();
  return password || null;
}

async function runSecurity(args: string[], runner: SecurityCommandRunner): Promise<string | null> {
  try {
    const result = await runner(args);
    return result.stdout || result.stderr;
  } catch {
    return null;
  }
}

async function defaultSecurityRunner(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('security', args, {
    encoding: 'utf8',
    windowsHide: true,
  });
  return { stdout, stderr };
}

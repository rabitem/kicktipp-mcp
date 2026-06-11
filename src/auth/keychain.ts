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
  for (const service of unique([
    config.keychain.service,
    'kicktipp',
    config.keychain.host,
    normalizedDomain(config.keychain.host),
    `https://${config.keychain.host}`,
  ])) {
    const credentials = await readPasswordItem(
      {
        account: config.keychain.account,
        argsForAccount: ['find-generic-password', '-s', service],
        argsForPassword: (account) => ['find-generic-password', '-s', service, '-a', account, '-w'],
        source: 'macos-keychain-generic',
      },
      runner,
    );
    if (credentials) return credentials;
  }

  for (const label of unique(['kicktipp', 'Kicktipp', config.keychain.host, normalizedDomain(config.keychain.host)])) {
    const credentials = await readPasswordItem(
      {
        account: config.keychain.account,
        argsForAccount: ['find-generic-password', '-l', label],
        argsForPassword: (account) => ['find-generic-password', '-l', label, '-a', account, '-w'],
        source: 'macos-keychain-generic',
      },
      runner,
    );
    if (credentials) return credentials;
  }

  return null;
}

async function readInternetPassword(
  config: KicktippConfig,
  runner: SecurityCommandRunner,
): Promise<KicktippCredentials | null> {
  for (const host of unique([config.keychain.host, normalizedDomain(config.keychain.host), `www.${normalizedDomain(config.keychain.host)}`])) {
    const credentials = await readPasswordItem(
      {
        account: config.keychain.account,
        argsForAccount: ['find-internet-password', '-s', host],
        argsForPassword: (account) => ['find-internet-password', '-s', host, '-a', account, '-w'],
        source: 'macos-keychain-internet',
      },
      runner,
    );
    if (credentials) return credentials;
  }

  for (const label of unique(['kicktipp', 'Kicktipp', config.keychain.host, normalizedDomain(config.keychain.host)])) {
    const credentials = await readPasswordItem(
      {
        account: config.keychain.account,
        argsForAccount: ['find-internet-password', '-l', label],
        argsForPassword: (account) => ['find-internet-password', '-l', label, '-a', account, '-w'],
        source: 'macos-keychain-internet',
      },
      runner,
    );
    if (credentials) return credentials;
  }

  return null;
}

async function readPasswordItem(
  options: {
    account: string | null;
    argsForAccount: string[];
    argsForPassword: (account: string) => string[];
    source: CredentialSource;
  },
  runner: SecurityCommandRunner,
): Promise<KicktippCredentials | null> {
  const account = options.account ?? (await findAccount(options.argsForAccount, runner));
  if (!account) return null;

  const password = await findPassword(options.argsForPassword(account), runner);
  if (!password) return null;

  return {
    email: account,
    password,
    source: options.source,
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

function normalizedDomain(host: string): string {
  return host.replace(/^www\./, '');
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
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

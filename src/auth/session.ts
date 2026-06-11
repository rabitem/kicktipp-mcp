import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import type { KicktippConfig } from '../config.js';
import { AuthError } from '../errors.js';
import { HttpClient } from '../http/client.js';
import { createUrls } from '../urls.js';
import {
  credentialsFromEnvironment,
  credentialsFromMacOSKeychain,
  type KicktippCredentials,
} from './keychain.js';

type StoredSession = {
  baseUrl: string;
  jar: unknown;
  savedAt: string;
};

export class KicktippSession {
  private authenticatedClient: HttpClient | null = null;

  constructor(private readonly config: KicktippConfig) {}

  publicClient(): HttpClient {
    return new HttpClient({ baseUrl: this.config.baseUrl });
  }

  async client(): Promise<HttpClient> {
    if (this.authenticatedClient) return this.authenticatedClient;

    const fromFile = await this.loadStoredClient();
    if (fromFile && (await this.isLoggedIn(fromFile))) {
      this.authenticatedClient = fromFile;
      return fromFile;
    }

    const fromCookie = this.clientFromLoginCookie();
    if (fromCookie && (await this.isLoggedIn(fromCookie))) {
      await this.saveStoredClient(fromCookie);
      this.authenticatedClient = fromCookie;
      return fromCookie;
    }

    const credentials = await this.resolveCredentials();
    if (!credentials) {
      throw new AuthError(
        'Kicktipp credentials are required for this operation. Set KICKTIPP_EMAIL/KICKTIPP_PASSWORD, KICKTIPP_LOGIN_COOKIE, or a macOS Keychain item.',
      );
    }

    const client = await this.login(credentials);
    await this.saveStoredClient(client);
    this.authenticatedClient = client;
    return client;
  }

  async authState(): Promise<{ configured: boolean; loggedIn: boolean; reason: string | null }> {
    const configured =
      Boolean(this.config.email && this.config.password) ||
      Boolean(this.config.loginCookie) ||
      this.config.keychain.enabled;
    if (!configured) return { configured, loggedIn: false, reason: 'no credentials configured' };
    try {
      const client = await this.client();
      return { configured, loggedIn: await this.isLoggedIn(client), reason: null };
    } catch (error) {
      return {
        configured,
        loggedIn: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async login(credentials: KicktippCredentials): Promise<HttpClient> {
    const urls = createUrls(this.config.baseUrl);
    const client = this.publicClient();
    const page = await client.get(urls.loginPage());
    const $ = cheerio.load(page.html);
    const action = $('form:has(input[name="kennung"])').attr('action') || '/info/profil/loginaction';
    await client.postForm(new URL(action, urls.loginPage()).toString(), {
      kennung: credentials.email,
      passwort: credentials.password,
      submitbutton: 'Anmelden',
    });

    if (!(await this.isLoggedIn(client))) {
      throw new AuthError('Kicktipp login failed; no valid authenticated session was established');
    }
    return client;
  }

  private async resolveCredentials(): Promise<KicktippCredentials | null> {
    return credentialsFromEnvironment(this.config) ?? (await credentialsFromMacOSKeychain(this.config));
  }

  private async isLoggedIn(client: HttpClient): Promise<boolean> {
    const urls = createUrls(this.config.baseUrl);
    const response = await client.get(urls.myCommunities());
    if (/\/profil\/login\b/.test(response.finalUrl)) return false;
    if (/name=["']kennung["']/.test(response.html) && /name=["']passwort["']/.test(response.html)) return false;
    return response.status >= 200 && response.status < 400;
  }

  private clientFromLoginCookie(): HttpClient | null {
    if (!this.config.loginCookie) return null;
    const jar = new CookieJar();
    const cookie = this.config.loginCookie.includes('=')
      ? this.config.loginCookie
      : `login=${this.config.loginCookie}`;
    jar.setCookieSync(cookie, this.config.baseUrl, { ignoreError: true });
    return new HttpClient({ baseUrl: this.config.baseUrl, jar });
  }

  private async loadStoredClient(): Promise<HttpClient | null> {
    try {
      const text = await fs.readFile(this.config.sessionFile, 'utf8');
      const stored = JSON.parse(text) as StoredSession;
      if (stored.baseUrl !== this.config.baseUrl) return null;
      const jar = CookieJar.fromJSON(stored.jar as never);
      return new HttpClient({ baseUrl: this.config.baseUrl, jar });
    } catch {
      return null;
    }
  }

  private async saveStoredClient(client: HttpClient): Promise<void> {
    const payload: StoredSession = {
      baseUrl: this.config.baseUrl,
      jar: client.jar.toJSON(),
      savedAt: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(this.config.sessionFile), { recursive: true });
    await fs.writeFile(this.config.sessionFile, `${JSON.stringify(payload, null, 2)}\n`, {
      mode: 0o600,
    });
  }
}

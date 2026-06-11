import { CookieJar } from 'tough-cookie';

export type HttpResponse = {
  status: number;
  finalUrl: string;
  html: string;
};

export type HttpClientOptions = {
  baseUrl: string;
  jar?: CookieJar;
  fetchFn?: typeof fetch;
};

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const MAX_REDIRECTS = 8;

export class HttpClient {
  readonly jar: CookieJar;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: HttpClientOptions) {
    this.jar = options.jar ?? new CookieJar();
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async get(url: string): Promise<HttpResponse> {
    return this.request('GET', url);
  }

  async postForm(url: string, form: Record<string, string>): Promise<HttpResponse> {
    return this.request('POST', url, new URLSearchParams(form).toString(), 'application/x-www-form-urlencoded');
  }

  cookiesFor(url = this.options.baseUrl): string {
    return this.jar.getCookieStringSync(url);
  }

  private async request(
    method: string,
    rawUrl: string,
    body?: string,
    contentType?: string,
  ): Promise<HttpResponse> {
    let url = new URL(rawUrl, this.options.baseUrl);
    let activeMethod = method;
    let activeBody = body;
    let activeContentType = contentType;

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const headers: Record<string, string> = {
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.6',
        'User-Agent': USER_AGENT,
      };
      const cookieHeader = this.jar.getCookieStringSync(url.toString());
      if (cookieHeader) headers.Cookie = cookieHeader;
      if (activeBody && activeContentType) headers['Content-Type'] = activeContentType;

      const init: RequestInit = {
        method: activeMethod,
        headers,
        redirect: 'manual',
      };
      if (activeBody !== undefined) init.body = activeBody;

      const response = await this.fetchFn(url.toString(), init);

      for (const setCookie of getSetCookies(response.headers)) {
        this.jar.setCookieSync(setCookie, url.toString(), { ignoreError: true });
      }

      const location = response.headers.get('location');
      if (isRedirect(response.status) && location) {
        const nextUrl = new URL(location, url);
        if (!['http:', 'https:'].includes(nextUrl.protocol)) {
          throw new Error(`refusing redirect to unsupported protocol: ${nextUrl.protocol}`);
        }
        if (url.protocol === 'https:' && nextUrl.protocol === 'http:') {
          throw new Error('refusing insecure redirect downgrade from https to http');
        }
        if (response.status === 303 || response.status === 302 || response.status === 301) {
          activeMethod = 'GET';
          activeBody = undefined;
          activeContentType = undefined;
        }
        if (nextUrl.host !== url.host && activeMethod !== 'GET') {
          activeMethod = 'GET';
          activeBody = undefined;
          activeContentType = undefined;
        }
        url = nextUrl;
        continue;
      }

      return {
        status: response.status,
        finalUrl: url.toString(),
        html: await response.text(),
      };
    }

    throw new Error(`too many redirects while requesting ${rawUrl}`);
  }
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function getSetCookies(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetter.getSetCookie === 'function') return withGetter.getSetCookie();
  const combined = headers.get('set-cookie');
  if (!combined) return [];
  return splitSetCookieHeader(combined);
}

function splitSetCookieHeader(header: string): string[] {
  return header.split(/,(?=\s*[^;,\s]+=)/g).map((value) => value.trim()).filter(Boolean);
}

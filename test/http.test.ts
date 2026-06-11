import { describe, expect, it } from 'vitest';
import { HttpClient } from '../src/http/client.js';

describe('HTTP client safety', () => {
  it('refuses HTTPS to HTTP redirect downgrades', async () => {
    const client = new HttpClient({
      baseUrl: 'https://www.kicktipp.de',
      fetchFn: async () =>
        new Response('', {
          status: 302,
          headers: { location: 'http://www.kicktipp.de/login' },
        }),
    });

    await expect(client.get('https://www.kicktipp.de/start')).rejects.toThrow(
      'refusing insecure redirect downgrade',
    );
  });

  it('does not send host-scoped cookies to a different redirect host', async () => {
    const seenCookies: Array<string | null> = [];
    const client = new HttpClient({
      baseUrl: 'https://www.kicktipp.de',
      fetchFn: async (url, init) => {
        const headers = init?.headers as Record<string, string> | undefined;
        seenCookies.push(headers?.Cookie ?? null);
        if (String(url).includes('www.kicktipp.de')) {
          return new Response('', {
            status: 302,
            headers: {
              location: 'https://example.org/next',
              'set-cookie': 'login=abc; Path=/; Secure',
            },
          });
        }
        return new Response('ok', { status: 200 });
      },
    });

    await client.get('https://www.kicktipp.de/start');

    expect(seenCookies).toEqual([null, null]);
  });
});

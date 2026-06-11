import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { KicktippClient, type KicktippHttpClient, type KicktippSessionLike } from '../src/core/kicktipp-client.js';

const betFormHtml = `
  <form action="/demo/tippabgabe" method="post">
    <input type="hidden" name="csrf" value="token">
    <table id="tippabgabeSpiele">
      <tr>
        <td>12.06.26 20:00</td>
        <td>FC Home</td>
        <td>SV Away</td>
        <td><input name="spieltippForms[0].heimTipp" value=""></td>
        <td><input name="spieltippForms[0].gastTipp" value=""></td>
      </tr>
      <tr>
        <td>13.06.26 20:00</td>
        <td>FC Existing</td>
        <td>SV Existing</td>
        <td><input name="spieltippForms[1].heimTipp" value="1"></td>
        <td><input name="spieltippForms[1].gastTipp" value="1"></td>
      </tr>
      <tr class="nichttippbar">
        <td>14.06.26 20:00</td>
        <td>FC Locked</td>
        <td>SV Locked</td>
        <td><input name="spieltippForms[2].heimTipp" value=""></td>
        <td><input name="spieltippForms[2].gastTipp" value=""></td>
      </tr>
    </table>
  </form>
`;

describe('tip submission', () => {
  it('dry-runs by default and reports skipped existing and locked matches', async () => {
    const { client, http } = clientWithForm();

    const result = await client.submitTips({
      community: 'demo',
      tips: [
        { formIndex: 0, home: 2, away: 1 },
        { formIndex: 1, home: 3, away: 2 },
        { formIndex: 2, home: 1, away: 0 },
      ],
    });

    expect(result.submitted).toBe(false);
    expect(http.posts).toHaveLength(0);
    expect(result.diffs).toMatchObject([
      { formIndex: 0, skipped: false, from: null, to: { home: 2, away: 1 } },
      { formIndex: 1, skipped: true, reason: 'existing tip; pass override=true to replace' },
      { formIndex: 2, skipped: true, reason: 'match locked' },
    ]);
  });

  it('requires explicit confirmation for real writes', async () => {
    const { client } = clientWithForm();

    await expect(
      client.submitTips({
        community: 'demo',
        dryRun: false,
        tips: [{ formIndex: 0, home: 2, away: 1 }],
      }),
    ).rejects.toThrow('real submissions require confirmation="SUBMIT_TIPS"');
  });

  it('submits the full form and preserves unchanged tips', async () => {
    const { client, http } = clientWithForm();

    const result = await client.submitTips({
      community: 'demo',
      dryRun: false,
      override: true,
      confirmation: 'SUBMIT_TIPS',
      tips: [{ formIndex: 0, home: 2, away: 1 }],
    });

    expect(result.submitted).toBe(true);
    expect(http.posts).toHaveLength(1);
    expect(http.posts[0]?.form).toMatchObject({
      csrf: 'token',
      submitbutton: 'submit',
      'spieltippForms[0].heimTipp': '2',
      'spieltippForms[0].gastTipp': '1',
      'spieltippForms[1].heimTipp': '1',
      'spieltippForms[1].gastTipp': '1',
      'spieltippForms[2].heimTipp': '',
      'spieltippForms[2].gastTipp': '',
    });
  });
});

function clientWithForm() {
  const http = new FakeHttp(betFormHtml);
  const session: KicktippSessionLike = {
    publicClient: () => http,
    client: async () => http,
    authState: async () => ({ configured: true, loggedIn: true, reason: null }),
  };
  const client = new KicktippClient(loadConfig({ KICKTIPP_BASE_URL: 'https://www.kicktipp.de' }), session);
  return { client, http };
}

class FakeHttp implements KicktippHttpClient {
  readonly posts: Array<{ url: string; form: Record<string, string> }> = [];

  constructor(private readonly html: string) {}

  async get(url: string) {
    return { status: 200, finalUrl: url, html: this.html };
  }

  async postForm(url: string, form: Record<string, string>) {
    this.posts.push({ url, form });
    return { status: 200, finalUrl: url, html: 'ok' };
  }
}

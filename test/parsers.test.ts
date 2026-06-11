import { describe, expect, it } from 'vitest';
import { parseBetForm } from '../src/scrape/bet-form.js';
import { parseRules } from '../src/scrape/rules.js';
import { parseSchedule } from '../src/scrape/schedule.js';
import { parseStandings } from '../src/scrape/standings.js';

describe('Kicktipp parsers', () => {
  it('parses local bet-form indexes separately from match ids', () => {
    const parsed = parseBetForm(`
      <form action="/runde/tippabgabe" method="post">
        <input type="hidden" name="spieltagIndex" value="1">
        <table id="tippabgabeSpiele">
          <tr>
            <td>12.06.26 20:00</td>
            <td>FC Home</td>
            <td>SV Away</td>
            <td><input id="spieltippForms_0_heimTipp" name="spieltippForms[0].heimTipp" value=""></td>
            <td><input id="spieltippForms_0_gastTipp" name="spieltippForms[0].gastTipp" value=""></td>
            <td>2,10 3,40 3,80</td>
          </tr>
        </table>
      </form>
    `);

    expect(parsed.fields).toEqual({ spieltagIndex: '1' });
    expect(parsed.matches[0]).toMatchObject({
      formIndex: 0,
      home: 'FC Home',
      away: 'SV Away',
      odds: { home: 2.1, draw: 3.4, away: 3.8 },
    });
  });

  it('parses current tips and locked rows from the bet form', () => {
    const parsed = parseBetForm(`
      <form>
        <table id="tippabgabeSpiele">
          <tr class="nichttippbar">
            <td>12.06.26 20:00</td>
            <td>FC Home</td>
            <td>SV Away</td>
            <td><input name="spieltippForms[7].heimTipp" value="2"></td>
            <td><input name="spieltippForms[7].gastTipp" value="0"></td>
          </tr>
        </table>
      </form>
    `);

    expect(parsed.matches[0]).toMatchObject({
      formIndex: 7,
      currentTip: { home: 2, away: 0 },
      locked: true,
    });
  });

  it('parses public schedule rows', () => {
    const schedule = parseSchedule(`
      <table id="spiele"><tbody>
        <tr data-url="/demo/tippspielplan/spiel?tippsaisonId=1&amp;tippspielId=1503034391">
          <td>29.08.26 15:30</td>
          <td>29.08.26 15:30</td>
          <td>FC Home</td>
          <td>SV Away</td>
          <td><span class="kicktipp-heim">2</span>:<span class="kicktipp-gast">1</span></td>
          <td>3 - 9 - 9</td>
        </tr>
      </tbody></table>
    `);

    expect(schedule).toEqual([
      {
        matchId: 1503034391,
        home: 'FC Home',
        away: 'SV Away',
        kickoff: '29.08.26 15:30',
        tipDeadline: '29.08.26 15:30',
        result: { home: 2, away: 1 },
        scoringRuleText: '3 - 9 - 9',
      },
    ]);
  });

  it('surfaces dynamic scoring assumptions', () => {
    const rules = parseRules(`
      <div class="pagecontent">
        <h2>Punkteregel: 3 - 11 Punkte</h2>
        <p>Die Punkte hängen von der Quote ab.</p>
      </div>
    `);

    expect(rules.dynamic).toBe(true);
    expect(rules.min).toBe(3);
    expect(rules.max).toBe(11);
    expect(rules.exact).toBeGreaterThan(rules.goalDifference);
  });

  it('parses standings table rows', () => {
    const standings = parseStandings(`
      <table class="sporttabelle"><tbody>
        <tr>
          <td>1.</td><td class="mannschaft"><div>FC Home</div></td>
          <td>10</td><td>24</td><td>20:8</td><td>12</td><td>7</td><td>3</td><td>0</td>
        </tr>
      </tbody></table>
    `);

    expect(standings[0]).toMatchObject({
      rank: 1,
      team: 'FC Home',
      played: 10,
      points: 24,
      goalsFor: 20,
      goalsAgainst: 8,
      goalDifference: 12,
    });
  });
});

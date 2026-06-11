import { describe, expect, it } from 'vitest';
import type { TipResearchPack } from '../src/domain/types.js';
import { runCouncils } from '../src/predict/councils.js';

describe('agent councils', () => {
  it('creates market, crowd, rules, contrarian, and consensus recommendations', () => {
    const pack: TipResearchPack = {
      community: 'demo',
      spieltagIndex: 1,
      generatedAt: '2026-06-11T00:00:00.000Z',
      warnings: [],
      rules: {
        tendency: 3,
        goalDifference: 4,
        exact: 5,
        dynamic: false,
        min: null,
        max: null,
        raw: '',
        assumption: 'test',
      },
      matches: [
        {
          matchId: 10,
          formIndex: 0,
          home: 'FC Home',
          away: 'SV Away',
          kickoff: '12.06.26 20:00',
          tipDeadline: '12.06.26 20:00',
          result: null,
          currentTip: null,
          locked: false,
          scoringRuleText: null,
          odds: { home: 1.7, draw: 3.7, away: 5.1 },
          distribution: {
            matchId: 10,
            home: 'FC Home',
            away: 'SV Away',
            visibility: 'sichtbar',
            dataAvailable: true,
            byTendency: { home: 0.35, draw: 0.35, away: 0.3 },
            byResult: [{ score: '1:1', pct: 16 }],
          },
          standings: { home: null, away: null },
        },
      ],
    };

    const result = runCouncils(pack, 'aggressive');
    const councils = result.recommendations.map((recommendation) => recommendation.council);

    expect(councils).toContain('market');
    expect(councils).toContain('crowd');
    expect(councils).toContain('rules');
    expect(councils).toContain('contrarian');
    expect(councils).toContain('consensus');
    expect(result.recommendations.find((r) => r.council === 'consensus')?.score).toBeTruthy();
  });
});

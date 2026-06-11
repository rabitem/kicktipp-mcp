export type KicktippUrls = ReturnType<typeof createUrls>;

export function createUrls(baseUrl = 'https://www.kicktipp.de') {
  const base = baseUrl.replace(/\/+$/, '');
  const communityPath = (community: string) => encodeCommunity(community);
  const query = (spieltagIndex?: number) =>
    typeof spieltagIndex === 'number' ? `?spieltagIndex=${encodeURIComponent(String(spieltagIndex))}` : '';

  return {
    base: () => `${base}/`,
    loginPage: () => `${base}/info/profil/login`,
    loginAction: () => `${base}/info/profil/loginaction`,
    myCommunities: () => `${base}/info/profil/meinetipprunden`,
    home: (community: string) => `${base}/${communityPath(community)}/`,
    betForm: (community: string, spieltagIndex?: number) =>
      `${base}/${communityPath(community)}/tippabgabe${query(spieltagIndex)}`,
    schedule: (community: string, spieltagIndex?: number) =>
      `${base}/${communityPath(community)}/tippspielplan${query(spieltagIndex)}`,
    overview: (community: string, spieltagIndex?: number) =>
      `${base}/${communityPath(community)}/tippuebersicht${query(spieltagIndex)}`,
    matchDetail: (community: string, matchId: number) =>
      `${base}/${communityPath(community)}/tippuebersicht/spiel?tippspielId=${encodeURIComponent(String(matchId))}`,
    standings: (community: string) => `${base}/${communityPath(community)}/tabellen`,
    rules: (community: string) => `${base}/${communityPath(community)}/spielregeln`,
  };
}

function encodeCommunity(community: string): string {
  const slug = community.trim().replace(/^\/+|\/+$/g, '');
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
    throw new Error(`invalid Kicktipp community slug: ${community}`);
  }
  return encodeURIComponent(slug);
}

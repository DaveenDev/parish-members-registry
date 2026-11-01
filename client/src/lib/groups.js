// Ministries and organizations on the website (0111): their addresses and
// names, shared by the pages, the form link and the sitemap.

export const GROUPS_PAGE = '/komunidad/grupo';

/** "Ministry" / "Organisasyon" as the website says it. */
export const groupKindLabel = (kind) => (kind === 'organization' ? 'Organisasyon' : 'Ministry');

/** A group's own page: /komunidad/grupo/ministry/3. */
export const groupPath = (g) => `${GROUPS_PAGE}/${g.kind === 'organization' ? 'organization' : 'ministry'}/${g.id}`;

/** The "Interesado ko" form for a group; the group's name and kind ride in the link. */
export const groupInterestPath = (g) => `/serbisyo/hangyo/interesado?groupName=${encodeURIComponent(g.name)}&groupKind=${g.kind === 'organization' ? 'organization' : 'ministry'}`;

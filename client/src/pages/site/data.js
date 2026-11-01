import { useEffect } from 'react';
import { api } from '../../api.js';
import { usePublicData } from '../../components/site/usePublicData.js';
import { todayIso } from '../../lib/website.js';
import { prayerVisitorId } from '../../lib/prayers.js';
import { parishTitle } from '../../lib/parishName.js';
import { isKaabagChart } from '../../lib/kaabag.js';

// One hook per kind of public data, so every page shares the same cache key.
export const useMassSchedule = () => usePublicData('mass', api.publicMassSchedules);
/** The Kaabag's Sunday schedule, today on (0113). */
export const useKaabagSchedule = () => usePublicData('kaabag', api.publicKaabagSchedule);
/** The Kaabag directory (0115): { total, people }, only those who agreed to be shown. */
export const useKaabagDirectory = () => usePublicData('kaabag-directory', api.publicKaabagDirectory);
export const useAnnouncements = () => usePublicData('announcements', api.publicAnnouncements);
export const useSacramentGuides = () => usePublicData('sacraments', api.publicSacramentGuides);
export const useBulletins = () => usePublicData('bulletins', api.publicBulletins);
export const useEvents = () => usePublicData('events', () => api.publicEvents(todayIso()));
export const useArticles = () => usePublicData('articles', api.publicArticles);
/** Home's two newest articles: two rows, not every article with its full text. */
export const useLatestArticles = () => usePublicData('articles-latest', () => api.publicLatestArticles(2));
/** The History page: { main, chapters } (0068), published only. */
export const useHistory = () => usePublicData('history', api.publicHistory);
export const useGkkDirectory = () => usePublicData('gkks', api.publicGkkDirectory);
/** A GKK page's photos and published history (0046), or null. */
export const useGkkPage = (name) => usePublicData(`gkk-page:${name}`, () => api.publicGkkPage(name));
/** The published org charts [{ title, slug, scope }] (0057), or none before it's run. */
export const useOrgCharts = () => usePublicData('org-charts', () => api.publicOrgCharts().catch(() => []));
/** The charts Ang Simbahan → Organisasyon lists: all but the Kaabag Structure, which is on the Kaabag page. */
export function useParishOrgCharts() {
  const q = useOrgCharts();
  return { ...q, data: q.data && q.data.filter((c) => !isKaabagChart(c)) };
}
/** One published org chart, `gkk` filling in the GKK Structure, or null. */
export const useOrgChart = (slug, gkk = null) => usePublicData(`org-chart:${slug}:${gkk || ''}`, () => (slug ? api.publicOrgChart(slug, gkk) : null));
export const useOffice = () => usePublicData('office', api.publicOfficeDetails);
/** The ministries and organizations on the website (0111), [] before the migration is run. */
export const useGroups = () => usePublicData('groups', () => api.publicGroups().catch(() => []));

// The last name seen, so a return visit shows it straight away instead of the fallback.
const NAME_KEY = 'pmr_parish_name';

/**
 * parishTitle() for the name saved in Parish Config: { name, sub, full, title }.
 * Shared by the website's header, footer, tab title and Home, the
 * registration form and the census portal.
 */
export function useParishTitle() {
  const office = useOffice();
  const saved = office.data?.name?.trim();
  useEffect(() => {
    if (saved) try { localStorage.setItem(NAME_KEY, saved); } catch {}
  }, [saved]);
  if (saved || !office.loading) return parishTitle(saved);
  try { return parishTitle(localStorage.getItem(NAME_KEY)); } catch { return parishTitle(''); }
}
/** The Downloads page: { songs, files } (0096), published only. */
export const useDownloads = () => usePublicData('downloads', api.publicDownloads);
/** The open census, or { open: false } (also before 0013 is run). */
export const useCensusProgress = () => usePublicData('census', () => api.publicCensusProgress().catch(() => ({ open: false })));
/** The last census closed (0114), or null. */
export const useCensusResult = () => usePublicData('census-result', api.publicCensusResult);
/** Whether the census family portal is open (0008), for the "update your record" buttons. */
export const usePortalStatus = () => usePublicData('portal', () => api.portalStatus().catch(() => ({ open: false })));

/** The prayer wall (0100): what shows today, newest first, each with this browser's "Nag-ampo ko". */
export const usePrayerWall = () => usePublicData('prayers', () => api.publicPrayerRequests(prayerVisitorId()));
/** One prayer request's page, or null when it no longer shows. */
export const usePrayerRequest = (id) => usePublicData(`prayer:${id}`, () => api.publicPrayerRequest(id, prayerVisitorId()));

/** A single list's state, with `empty` when it loaded with no rows. */
export function listState(q) {
  return { ...q, rows: q.data || [], empty: !q.loading && !q.error && !(q.data || []).length };
}

/** One published item for a detail page, fetched by id (so shared links work). */
export const useItem = (table, id) => usePublicData(`${table}:${id}`, () => api.publicItem(table, id));

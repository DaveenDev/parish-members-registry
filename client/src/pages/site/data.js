import { api } from '../../api.js';
import { usePublicData } from '../../components/site/usePublicData.js';
import { todayIso } from '../../lib/website.js';
import { prayerVisitorId } from '../../lib/prayers.js';

// One hook per kind of public data, so every page shares the same cache key.
export const useMassSchedule = () => usePublicData('mass', api.publicMassSchedules);
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
/** One published org chart, `gkk` filling in the GKK Structure, or null. */
export const useOrgChart = (slug, gkk = null) => usePublicData(`org-chart:${slug}:${gkk || ''}`, () => (slug ? api.publicOrgChart(slug, gkk) : null));
export const useOffice = () => usePublicData('office', api.publicOfficeDetails);
/** The Downloads page: { songs, files } (0096), published only. */
export const useDownloads = () => usePublicData('downloads', api.publicDownloads);
/** The open census, or { open: false } (also before 0013 is run). */
export const useCensusProgress = () => usePublicData('census', () => api.publicCensusProgress().catch(() => ({ open: false })));
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

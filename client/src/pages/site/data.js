import { api } from '../../api.js';
import { usePublicData } from '../../components/site/usePublicData.js';
import { todayIso } from '../../lib/website.js';

// One hook per kind of public data, so every page shares the same cache key.
export const useMassSchedule = () => usePublicData('mass', api.publicMassSchedules);
export const useAnnouncements = () => usePublicData('announcements', api.publicAnnouncements);
export const useSacramentGuides = () => usePublicData('sacraments', api.publicSacramentGuides);
export const useBulletins = () => usePublicData('bulletins', api.publicBulletins);
export const useEvents = () => usePublicData('events', () => api.publicEvents(todayIso()));
export const useArticles = () => usePublicData('articles', api.publicArticles);
export const useGkkDirectory = () => usePublicData('gkks', api.publicGkkDirectory);
/** A GKK page's photos and published history (0046), or null. */
export const useGkkPage = (name) => usePublicData(`gkk-page:${name}`, () => api.publicGkkPage(name));
export const useOffice = () => usePublicData('office', api.publicOfficeDetails);
/** The open census, or { open: false } (also before 0013 is run). */
export const useCensusProgress = () => usePublicData('census', () => api.publicCensusProgress().catch(() => ({ open: false })));
/** Whether the census family portal is open (0008), for the "update your record" buttons. */
export const usePortalStatus = () => usePublicData('portal', () => api.portalStatus().catch(() => ({ open: false })));

/** A single list's state, with `empty` when it loaded with no rows. */
export function listState(q) {
  return { ...q, rows: q.data || [], empty: !q.loading && !q.error && !(q.data || []).length };
}

/** One published item for a detail page, fetched by id (so shared links work). */
export const useItem = (table, id) => usePublicData(`${table}:${id}`, () => api.publicItem(table, id));

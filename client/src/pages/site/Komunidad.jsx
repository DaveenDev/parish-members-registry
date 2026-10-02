import React, { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { Avatar, BigButton, Card, DataState, EmptyNote, ErrorNote, Eyebrow, INNER, PAGE, PageHeader, Pills, Segmented, Skeleton, Skeletons } from '../../components/site/kit.jsx';
import { ArticleChip } from '../../components/site/cards.jsx';
import { phoneHref } from '../../lib/requests.js';
import { ARTICLE_LABELS, excerpt, fmtLong, fmtShort, gkkParts, groupGkksByArea, initialsOf } from '../../lib/site.js';
import { useSiteTitle } from './SiteLayout.jsx';
import { listState, useArticles, useCensusProgress, useGkkDirectory } from './data.js';

const SMALL = 'Ubos sa 5';

/** Komunidad: latest updates on activities held, then the GKK directory and census progress. */
export default function Komunidad() {
  const [params, setParams] = useSearchParams();
  const census = useCensusProgress().data;
  const view = params.get('view') === 'census' ? 'census' : 'gkk';
  const setView = (v) => setParams(v === 'census' ? { view: 'census' } : {}, { replace: true });

  return (
    <main className={PAGE}>
      <LatestUpdates />
      <PageHeader eyebrow="Komunidad" title="Mga GKK sa parokya">
        <Segmented label="Komunidad" options={[['gkk', 'GKK Directory'], ['census', census?.open ? census.label : 'Census']]} value={view} onChange={setView} />
      </PageHeader>
      {view === 'gkk' ? <GkkDirectory /> : <CensusProgress />}
    </main>
  );
}

function LatestUpdates() {
  const arts = listState(useArticles());
  return (
    <section aria-labelledby="lu-h" className="mb-7 lg:mb-12 lg:pb-10 lg:border-b lg:border-[#e7dcc4]">
      <Eyebrow>Mga nahimong kalihokan</Eyebrow>
      <h2 id="lu-h" className="font-serif font-semibold text-[30px] lg:text-[46px] mt-0.5 mb-3 lg:mb-5 text-parish-navy">Pinakabag-ong Balita</h2>
      {arts.loading ? (
        <>
          <div className="flex gap-3 overflow-hidden lg:hidden"><Skeleton h={260} className="flex-none w-[260px]" /><Skeleton h={260} alt className="flex-none w-[260px]" /></div>
          <div className="hidden lg:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-5"><Skeleton h={440} className="rounded-[20px]" /><Skeleton h={440} alt className="rounded-[20px]" /></div>
        </>
      ) : arts.error ? (
        <p className="m-0 text-parish-error text-[15px]">Wala ma-load ang mga balita.</p>
      ) : arts.empty ? (
        <p className="m-0 text-parish-text2 text-[15px]">Wala pay balita nga gi-post.</p>
      ) : (
        <>
        <ArticlesDesktop rows={arts.rows} />
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-3.5 px-3.5 pb-1.5 lg:hidden">
          {arts.rows.map((a) => (
            <Link key={a.id} to={`/komunidad/balita/${a.id}`} className="flex-none w-[262px] snap-start text-left overflow-hidden bg-parish-card border border-parish-border rounded-2xl shadow-cardSm">
              {a.photo_url
                ? <img src={a.photo_url} alt="" loading="lazy" className="w-full h-[128px] object-cover bg-[#efe6d3]" />
                : <div className="h-[128px] flex items-center justify-center bg-[var(--p-blue-tint)] text-parish-gold"><Icon name="cross" size={48} /></div>}
              <div className="px-3.5 pt-3 pb-3.5">
                <div className="flex gap-2 items-center mb-1.5"><ArticleChip a={a} /><span className="text-[13px] text-parish-text2">{fmtShort(a.held_on)}</span></div>
                <div className="font-serif text-[20px] font-bold leading-[1.18] text-parish-navy mb-1">{a.title}</div>
                <div className="text-[14px] leading-[1.45] text-[#4d4636]">{a.summary || excerpt(a.body, 110)}</div>
                <div className="font-bold text-[14px] text-parish-blue mt-2">Basaha →</div>
              </div>
            </Link>
          ))}
        </div>
        </>
      )}
    </section>
  );
}

const articlePath = (a) => `/komunidad/balita/${a.id}`;

function ArticlePhoto({ a, className }) {
  return a.photo_url
    ? <img src={a.photo_url} alt="" loading="lazy" className={`w-full object-cover bg-[#efe6d3] ${className}`} />
    : <div className={`flex items-center justify-center bg-[var(--p-blue-tint)] text-parish-gold ${className}`}><Icon name="cross" size={56} /></div>;
}

/** Desktop: the newest story large on the left, the next three listed beside it. */
function ArticlesDesktop({ rows }) {
  const [lead, ...rest] = rows;
  return (
    <div className="hidden lg:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-5 items-start">
      <Link to={articlePath(lead)} className="text-left overflow-hidden bg-parish-card border border-parish-border rounded-[20px] shadow-card hover:border-[var(--p-blue-border)]">
        <ArticlePhoto a={lead} className="h-[280px]" />
        <div className="px-[22px] pt-5 pb-[22px]">
          <div className="flex gap-2 items-center mb-2"><ArticleChip a={lead} /><span className="text-[14px] text-parish-text2">{[fmtShort(lead.held_on), lead.place].filter(Boolean).join(' · ')}</span></div>
          <div className="font-serif text-[32px] font-bold leading-[1.1] text-parish-navy mb-2">{lead.title}</div>
          <div className="text-[16.5px] leading-[1.55] text-[#4d4636]">{lead.summary || excerpt(lead.body, 220)}</div>
          <div className="font-bold text-[15px] text-parish-blue mt-3">Basaha ang tibuok balita →</div>
        </div>
      </Link>
      <div className="flex flex-col gap-3.5">
        {rest.slice(0, 3).map((a) => (
          <Link key={a.id} to={articlePath(a)} className="text-left grid grid-cols-[132px_minmax(0,1fr)] gap-4 p-3 bg-parish-card border border-parish-border rounded-[18px] hover:border-[var(--p-blue-border)]">
            <ArticlePhoto a={a} className="h-[112px] rounded-xl" />
            <div className="pt-0.5 pr-1">
              <div className="flex gap-2 items-center mb-[5px]"><span className="font-bold text-[11px] tracking-[.08em] uppercase text-parish-blueDeep">{ARTICLE_LABELS[a.tag] || a.tag}</span><span className="text-[13px] text-parish-text2">{fmtShort(a.held_on)}</span></div>
              <div className="font-serif text-[21px] font-bold leading-[1.15] text-parish-navy mb-1">{a.title}</div>
              <div className="text-[14px] leading-[1.45] text-[#4d4636]">{a.summary || excerpt(a.body, 90)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function GkkDirectory() {
  const dir = listState(useGkkDirectory());
  const [q, setQ] = useState('');
  const groups = groupGkksByArea(dir.rows, q);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const examples = [...new Set(dir.rows.map((g) => gkkParts(g.name).area).filter(Boolean))].slice(0, 3);

  return (
    <>
      <div className="lg:bg-parish-card lg:border lg:border-parish-border lg:rounded-[20px] lg:shadow-card lg:px-[22px] lg:py-5 lg:mb-[26px] lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-5 lg:gap-y-2 lg:items-end">
      <div>
      <label htmlFor="gkk-q" className="block font-bold text-[15px] text-parish-navy mb-1.5 lg:font-serif lg:text-[26px] lg:mb-2">Asa ka nagpuyo?</label>
      <div className="relative mb-1.5 lg:mb-0">
        <Icon name="search" className="absolute left-3.5 top-3.5 text-parish-text2 lg:left-4 lg:top-4" />
        <input
          id="gkk-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Barangay, sitio o purok"
          className="w-full min-h-[50px] px-11 text-[16px] text-parish-ink bg-parish-card border-[1.5px] border-parish-borderSoft rounded-[14px] outline-none focus:border-parish-blue [&::-webkit-search-cancel-button]:hidden lg:min-h-[52px] lg:px-12 lg:text-[17px] lg:bg-parish-bg"
        />
        {q && (
          <button type="button" aria-label="Hawani" onClick={() => setQ('')} className="absolute right-[3px] top-[3px] lg:right-1 lg:top-1 w-11 h-11 flex items-center justify-center text-parish-text2">
            <Icon name="x" size={18} />
          </button>
        )}
      </div>
      </div>
      {examples.length > 0 && <div className="text-[13.5px] lg:text-[14px] text-parish-text2 mb-4 lg:mb-0 lg:pb-[15px]">Sulayi: {examples.join(', ')}</div>}
      </div>

      <DataState
        state={dir}
        skeleton={<Skeletons n={2} h={120} />}
        errorText="Wala ma-load ang GKK directory."
        empty={dir.empty}
        emptyText="Wala pay GKK nga gi-publish. Pangutana sa opisina sa parokya."
      >
        {q && <div aria-live="polite" className="font-semibold text-[14px] lg:text-[15px] text-[#4d4636] mb-2.5 lg:mb-3">{count} ka GKK ang nakit-an</div>}
        {!count ? (
          <div className="bg-parish-card border border-dashed border-[#d9cdb4] rounded-2xl p-[18px] text-center lg:max-w-[560px] lg:mx-auto lg:p-[26px] lg:rounded-[18px]">
            <div className="font-serif text-[21px] lg:text-[24px] font-bold text-parish-navy mb-1">Walay GKK nga nakit-an para sa “{q}”</div>
            <p className="m-0 mb-3 text-[15px] text-[#4d4636]">Sulayi ang ngalan sa barangay, o pangutan-a ang opisina.</p>
            <BigButton variant="secondary" to="/kontak" className="!w-auto inline-flex px-4">Kontaka ang opisina</BigButton>
          </div>
        ) : (
          <div className="flex flex-col gap-5 lg:gap-7">
            {groups.map((grp) => (
              <div key={grp.area}>
                <h2 className="m-0 mb-2 lg:mb-2.5 flex items-center gap-1.5 font-bold text-[13px] lg:text-[13.5px] tracking-[.1em] uppercase text-[#4d4636]"><Icon name="pin" size={15} />{grp.area}</h2>
                <div className="flex flex-col gap-2.5 lg:hidden">{grp.items.map((g) => <GkkCard key={g.name} g={g} />)}</div>
                <GkkTable items={grp.items} />
              </div>
            ))}
          </div>
        )}
      </DataState>
    </>
  );
}

const gkkPath = (name) => `/komunidad/gkk/${encodeURIComponent(name)}`;

/** Desktop: one area's GKKs as a table; the GKK name opens its page. */
function GkkTable({ items }) {
  const th = 'text-left px-4 py-2.5 font-bold text-[12px] tracking-[.08em] uppercase text-[#4d4636]';
  return (
    <div className="hidden lg:block bg-parish-card border border-parish-border rounded-[18px] shadow-cardSm overflow-hidden">
      <table className="w-full border-collapse">
        <thead className="bg-parish-bg">
          <tr>
            <th scope="col" className={th}>GKK</th>
            <th scope="col" className={th}>Purok / Sitio</th>
            <th scope="col" className={`${th} whitespace-nowrap`}>Pamilya</th>
            <th scope="col" className={th}>Iskedyul sa tigom</th>
            <th scope="col" className={th}>Coordinator</th>
          </tr>
        </thead>
        <tbody>
          {items.map((g) => (
            <tr key={g.name} className="border-t border-[#f0e8d6] hover:bg-[#fbf7ef]">
              <td className="px-4 py-3">
                <Link to={gkkPath(g.name)} className="font-serif text-[18px] font-bold text-parish-navy hover:text-parish-blue">
                  {g.patron} {g.area && <span className="text-parish-blue">-{g.area}</span>}
                </Link>
              </td>
              <td className="px-4 py-3 text-[14px] text-parish-text2">{g.puroks || '—'}</td>
              <td className="px-4 py-3 text-[14.5px] text-[#3f3b2f] whitespace-nowrap"><strong>{g.households ?? SMALL}</strong></td>
              <td className="px-4 py-3 text-[14px] text-[#3f3b2f]">{g.meeting_schedule || '—'}</td>
              <td className="px-4 py-3 text-[14px]">
                {g.coordinator ? (
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold">{g.coordinator.name}</span>
                    {g.coordinator.mobile && (
                      <a href={`tel:${phoneHref(g.coordinator.mobile)}`} aria-label={`Tawagi si ${g.coordinator.name}`} className="w-8 h-8 rounded-lg border-[1.5px] border-[var(--p-blue-border)] text-parish-blue flex items-center justify-center flex-none">
                        <Icon name="phone" size={16} />
                      </a>
                    )}
                  </div>
                ) : (
                  <Link to="/kontak" className="font-semibold text-parish-blue underline">Pangutan-a ang opisina</Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GkkCard({ g }) {
  return (
    <Card className="flex flex-col lg:rounded-[18px] hover:border-[var(--p-blue-border)]">
      <Link to={gkkPath(g.name)} className="w-full text-left px-3.5 pt-3.5 pb-2.5 lg:px-[18px] lg:pt-4 lg:pb-3 flex gap-2.5 items-start lg:flex-1">
        <div className="flex-1 min-w-0">
          <div className="font-serif text-[21px] lg:text-[23px] font-bold leading-[1.15] text-parish-navy">
            {g.patron} {g.area && <span className="text-parish-blue">-{g.area}</span>}
          </div>
          {g.puroks && <div className="text-[13.5px] text-parish-text2 mt-0.5">{g.puroks}</div>}
          <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 mt-2 text-[14px] text-[#3f3b2f]">
            <span className="flex items-center gap-[5px]"><Icon name="home" size={15} className="text-parish-blue" /><strong>{g.households ?? SMALL}</strong> pamilya</span>
            {g.meeting_schedule && <span className="flex items-center gap-[5px]"><Icon name="clock" size={15} className="text-parish-blue" />{g.meeting_schedule}</span>}
          </div>
        </div>
        <Icon name="chev" size={18} className="text-parish-muted mt-1 lg:hidden" />
      </Link>
      <div className="border-t border-[#f0e8d6] px-3.5 py-2.5 lg:px-[18px] lg:min-h-[58px] lg:flex lg:items-center">
        {g.coordinator ? (
          <div className="flex items-center gap-2.5 w-full">
            <Avatar initials={initialsOf(g.coordinator.name)} />
            <div className="flex-1 min-w-0"><div className="font-semibold text-[14.5px]">{g.coordinator.name}</div><div className="text-[12.5px] text-parish-text2">Coordinator</div></div>
            {g.coordinator.mobile && (
              <a href={`tel:${phoneHref(g.coordinator.mobile)}`} aria-label="Tawagi ang coordinator" className="w-11 h-11 rounded-xl border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blue flex items-center justify-center">
                <Icon name="phone" size={19} />
              </a>
            )}
          </div>
        ) : (
          <div className="text-[14px] text-parish-text2">Coordinator: <Link to="/kontak" className="font-semibold text-parish-blue underline">Pangutan-a ang opisina sa parokya</Link></div>
        )}
      </div>
    </Card>
  );
}

export function GkkDetail() {
  const { name } = useParams();
  const dir = listState(useGkkDirectory());
  const census = useCensusProgress().data;
  const found = dir.rows.find((g) => g.name === name);
  const { patron, area } = gkkParts(name);
  useSiteTitle(patron);

  const pad = `${INNER} lg:max-w-[760px]`;
  if (dir.loading) return <main className={pad}><Skeletons n={3} h={90} /></main>;
  if (dir.error) return <main className={pad}><ErrorNote onRetry={dir.reload}>Wala ma-load ang GKK.</ErrorNote></main>;
  if (!found) return <main className={pad}><EmptyNote>Wala namo makit-i kini nga GKK.</EmptyNote><BigButton variant="secondary" to="/komunidad">Tan-awa ang tanang GKK</BigButton></main>;
  const g = found;
  const c = g.coordinator;

  // Desktop: details and the register button on the left, the coordinator on the right.
  return (
    <main className={`${INNER} lg:max-w-[1240px] lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-x-10 lg:items-start`}>
      <div className="lg:col-start-1 lg:row-start-1">
      {area && <div className="inline-flex items-center gap-[5px] font-bold text-[12px] lg:text-[12.5px] tracking-[.1em] uppercase text-[var(--p-eyebrow)]"><Icon name="pin" size={14} />{area}</div>}
      <h1 className="font-serif font-semibold text-[34px] lg:text-[54px] leading-[1.05] lg:leading-[1.02] mt-1 mb-1 lg:mt-1.5 lg:mb-1.5 text-parish-navy">{patron}</h1>
      {g.puroks && <div className="text-[15px] lg:text-[17px] text-[#4d4636] mb-4 lg:mb-6">{g.puroks}</div>}
      <div className={`grid gap-2.5 mb-3.5 lg:grid-cols-3 lg:gap-3.5 lg:mb-[22px] ${census?.open ? 'grid-cols-2' : 'grid-cols-1'} ${g.puroks ? '' : 'mt-3'}`}>
        <StatTile value={g.households} label="Pamilya" />
        {census?.open && <StatTile value={g.census_pct != null ? `${g.census_pct}%` : null} small="—" label="Census na-update" />}
        {g.meeting_schedule && (
          <div className="hidden lg:block bg-parish-card border border-parish-border rounded-[18px] p-[18px]">
            <div className="font-semibold text-[17px] leading-[1.3]">{g.meeting_schedule}</div>
            <div className="font-bold text-[11.5px] tracking-[.12em] uppercase text-parish-text2 mt-2">Bible-sharing</div>
          </div>
        )}
      </div>
      {g.meeting_place && (
        <div className="hidden lg:flex gap-3 items-center text-[16px] text-[#3f3b2f] mb-7">
          <Icon name="pin" className="text-parish-blue" />Tigomanan: {g.meeting_place}
        </div>
      )}
      {(g.meeting_schedule || g.meeting_place) && (
        <Card className="px-3.5 py-1 mb-3.5 shadow-none lg:hidden">
          {g.meeting_schedule && (
            <div className={`flex gap-3 py-3 ${g.meeting_place ? 'border-b border-[#f0e8d6]' : ''}`}>
              <Icon name="clock" className="text-parish-blue" />
              <div><div className="text-[13px] text-parish-text2">Bible-sharing</div><div className="font-semibold text-[15.5px]">{g.meeting_schedule}</div></div>
            </div>
          )}
          {g.meeting_place && (
            <div className="flex gap-3 py-3">
              <Icon name="pin" className="text-parish-blue" />
              <div><div className="text-[13px] text-parish-text2">Tigomanan</div><div className="font-semibold text-[15.5px]">{g.meeting_place}</div></div>
            </div>
          )}
        </Card>
      )}

      </div>

      <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
      <h2 className="font-serif font-semibold text-[22px] lg:text-[26px] m-0 mb-2 lg:mt-2 lg:mb-2.5 text-parish-navy">Coordinator</h2>
      {c ? (
        <Card className="p-3.5 mb-5 shadow-none lg:p-5 lg:rounded-[20px] lg:shadow-card lg:mb-0">
          <div className={`flex items-center gap-3 lg:gap-3.5 ${c.mobile ? 'mb-3 lg:mb-4' : ''}`}>
            <span className="lg:hidden"><Avatar initials={initialsOf(c.name)} size={52} /></span>
            <span className="hidden lg:block"><Avatar initials={initialsOf(c.name)} size={64} /></span>
            <div><div className="font-bold text-[17px] lg:text-[19px]">{c.name}</div><div className="text-[13.5px] lg:text-[14px] text-parish-text2">GKK Coordinator</div></div>
          </div>
          {c.mobile && (
            <div className="grid grid-cols-2 gap-2 lg:gap-2.5">
              <ContactButton href={`tel:${phoneHref(c.mobile)}`} icon="phone">Tawag</ContactButton>
              <ContactButton href={`sms:${phoneHref(c.mobile)}`} icon="sms">Text</ContactButton>
            </div>
          )}
        </Card>
      ) : (
        <div className="bg-parish-card border border-dashed border-[#d9cdb4] rounded-2xl p-3.5 mb-5 flex gap-3 items-center lg:p-5 lg:rounded-[20px] lg:gap-3.5 lg:mb-0">
          <div className="w-11 h-11 lg:w-[52px] lg:h-[52px] rounded-full bg-[#efe6d3] flex-none flex items-center justify-center text-parish-text2"><Icon name="people" /></div>
          <div className="text-[14.5px] lg:text-[15.5px] leading-[1.45] text-[#4d4636]">
            Wala pay coordinator nga mouyon nga ipakita. <Link to="/kontak" className="font-bold text-parish-blue underline">Pangutan-a ang opisina sa parokya</Link>
          </div>
        </div>
      )}
      </div>
      <Link
        to={`/register?gkk=${encodeURIComponent(g.name)}`}
        className="w-full min-h-[56px] flex items-center justify-center text-center px-4 font-bold text-[16.5px] text-white bg-parish-blue rounded-[14px] hover:bg-parish-blueDeep lg:col-start-1 lg:row-start-2 lg:w-auto lg:justify-self-start lg:min-h-[58px] lg:px-8 lg:text-[17px]"
        style={{ boxShadow: '0 14px 30px -12px color-mix(in srgb, var(--p-blue) 65%, transparent)' }}
      >
        Mao ni ang akong GKK, magparehistro
      </Link>
    </main>
  );
}

function StatTile({ value, small = SMALL, label }) {
  return (
    <div className="bg-parish-card border border-parish-border rounded-2xl p-3.5 lg:rounded-[18px] lg:p-[18px]">
      {value == null
        ? <div className="font-serif text-[24px] lg:text-[28px] font-bold text-[#4d4636] leading-[1.25] lg:leading-[1.3]">{small}</div>
        : <div className="font-serif text-[36px] lg:text-[44px] font-bold text-parish-blue leading-none">{value}</div>}
      <div className="font-bold text-[11px] lg:text-[11.5px] tracking-[.12em] uppercase text-parish-text2 mt-1.5 lg:mt-2">{label}</div>
    </div>
  );
}

function ContactButton({ href, icon, children }) {
  return (
    <a href={href} className="min-h-[46px] rounded-xl border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blueDeep font-bold text-[15px] flex items-center justify-center gap-[7px]">
      <Icon name={icon} size={18} />{children}
    </a>
  );
}

function CensusProgress() {
  const q = useCensusProgress();
  const c = q.data;
  const [sort, setSort] = useState('pct');

  if (q.loading) return <div className="lg:grid lg:grid-cols-[380px_1fr] lg:gap-6"><Skeleton h={200} className="mb-3 lg:h-[420px]" /><Skeleton h={260} alt className="lg:h-[520px]" /></div>;
  if (q.error) return <ErrorNote onRetry={q.reload}>Wala ma-load ang progreso sa census.</ErrorNote>;
  if (!c?.open) {
    return (
      <Card className="px-[18px] py-[22px] text-center shadow-none lg:max-w-[560px] lg:mx-auto lg:p-[30px] lg:rounded-[18px]">
        <div className="font-serif text-[23px] lg:text-[28px] font-bold text-parish-navy mb-1.5">Sirado ang census karon</div>
        <p className="m-0 text-[15px] leading-normal text-[#4d4636]">Ipakita diri ang progreso inig abli sa sunod nga census.</p>
      </Card>
    );
  }
  if (c.pct == null) return <EmptyNote>Bag-o pa lang giablihan ang census. Wala pay igo nga na-update aron ipakita.</EmptyNote>;

  const rows = [...(c.gkks || [])].sort((a, b) => (sort === 'pct' ? (b.pct ?? -1) - (a.pct ?? -1) : a.name.localeCompare(b.name)));

  return (
    <div className="lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-6 lg:items-start">
      <Card className="px-4 py-[18px] text-center mb-4 shadow-card lg:sticky lg:top-24 lg:mb-0 lg:px-6 lg:py-7 lg:rounded-[20px]">
        <div role="img" aria-label={`${c.pct} porsyento`} className="w-[132px] h-[132px] lg:w-[180px] lg:h-[180px] rounded-full mx-auto mb-3 lg:mb-4 flex items-center justify-center" style={{ background: `conic-gradient(var(--p-blue) 0 ${c.pct}%, #ece2cd 0)` }}>
          <div className="w-[104px] h-[104px] lg:w-[144px] lg:h-[144px] rounded-full bg-parish-card flex flex-col items-center justify-center">
            <div className="font-serif text-[40px] lg:text-[54px] font-bold leading-none text-parish-blue">{c.pct}%</div>
            <div className="text-[12px] lg:text-[13px] text-parish-text2">na-update</div>
          </div>
        </div>
        <h2 className="font-serif font-semibold text-[24px] lg:text-[28px] leading-[1.15] lg:leading-[1.12] m-0 mb-1.5 lg:mb-2 text-parish-navy">{c.label}: {c.pct}% sa mga pamilya na-update na</h2>
        <p className="m-0 mb-3.5 lg:mb-[18px] text-[15px] lg:text-[15.5px] leading-normal lg:leading-[1.55] text-[#4d4636]">
          Salamat sa tanang GKK!{c.ends_on ? ` Abli pa hangtod ${fmtLong(c.ends_on)}.` : ''} Ang matag pamilya nga mo-update makatabang sa parokya sa pag-alagad.
        </p>
        <BigButton to="/census" className="min-h-[52px] text-[16px]">I-update ang among rekord</BigButton>
        {(c.gkks || []).some((r) => r.pct === 100) && (
          <div className="hidden lg:block text-[13px] text-parish-text2 mt-3">{c.gkks.filter((r) => r.pct === 100).length} ka GKK ang kompleto na</div>
        )}
      </Card>
      <div>
      <div className="flex items-center justify-between gap-2 mb-2.5 lg:mb-3">
        <h3 className="m-0 font-serif text-[21px] lg:text-[26px] font-bold text-parish-navy">Matag GKK</h3>
        <Pills options={[['pct', 'Pinakataas'], ['name', 'Ngalan']]} value={sort} onChange={setSort} className="[&>button]:flex-none [&>button]:px-3 [&>button]:min-h-[40px] [&>button]:text-[13.5px]" />
      </div>
      <Card className="px-3.5 py-1 shadow-none lg:px-[22px] lg:py-1.5 lg:rounded-[18px] lg:grid lg:grid-cols-2 lg:gap-x-8">
        {rows.map((r) => (
          <div key={r.name} className="py-[11px] lg:py-3 border-b border-[#f4eddd] last:border-b-0">
            <div className="flex items-baseline gap-2 mb-1.5">
              <div className="flex-1 min-w-0 font-semibold text-[14.5px] leading-[1.25]">{r.name}</div>
              {r.pct === 100 && (
                <span className="inline-flex items-center gap-1 font-bold text-[11.5px] text-parish-navy rounded-full px-2 py-0.5" style={{ background: 'var(--p-gold-light)' }}>
                  <Icon name="star" size={12} />Kompleto!
                </span>
              )}
              <span className="font-bold text-[14.5px] text-parish-blueDeep min-w-[38px] text-right">{r.pct != null ? `${r.pct}%` : '—'}</span>
            </div>
            {r.pct != null ? (
              <div className="h-2 rounded-full bg-[#efe6d3] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: 'var(--p-blue-light)' }} /></div>
            ) : (
              <div className="text-[12.5px] text-parish-text2">Ubos sa 5 ka pamilya. Dili ipakita ang porsyento.</div>
            )}
          </div>
        ))}
      </Card>
      <div className="text-[12.5px] lg:text-[13px] text-parish-text2 mt-2 lg:mt-2.5">Porsyento lang ang gipakita. Walay ngalan sa pamilya.</div>
      </div>
    </div>
  );
}

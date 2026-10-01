import React, { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { Avatar, BigButton, Card, DataState, EmptyNote, ErrorNote, Eyebrow, PageTitle, Pills, Segmented, Skeleton, Skeletons } from '../../components/site/kit.jsx';
import { ArticleChip } from '../../components/site/cards.jsx';
import { phoneHref } from '../../lib/requests.js';
import { excerpt, fmtLong, fmtShort, gkkParts, groupGkksByArea, initialsOf } from '../../lib/site.js';
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
    <main className="px-3.5 pt-4 pb-7 animate-fadeUp">
      <LatestUpdates />
      <Eyebrow>Komunidad</Eyebrow>
      <PageTitle>Mga GKK sa parokya</PageTitle>
      <Segmented label="Komunidad" options={[['gkk', 'GKK Directory'], ['census', census?.open ? census.label : 'Census']]} value={view} onChange={setView} />
      {view === 'gkk' ? <GkkDirectory /> : <CensusProgress />}
    </main>
  );
}

function LatestUpdates() {
  const arts = listState(useArticles());
  return (
    <section aria-labelledby="lu-h" className="mb-7">
      <Eyebrow>Mga nahimong kalihokan</Eyebrow>
      <h2 id="lu-h" className="font-serif font-semibold text-[30px] mt-0.5 mb-3 text-parish-navy">Pinakabag-ong Balita</h2>
      {arts.loading ? (
        <div className="flex gap-3 overflow-hidden"><Skeleton h={260} className="flex-none w-[260px]" /><Skeleton h={260} alt className="flex-none w-[260px]" /></div>
      ) : arts.error ? (
        <p className="m-0 text-parish-error text-[15px]">Wala ma-load ang mga balita.</p>
      ) : arts.empty ? (
        <p className="m-0 text-parish-text2 text-[15px]">Wala pay balita nga gi-post.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-3.5 px-3.5 pb-1.5">
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
      )}
    </section>
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
      <label htmlFor="gkk-q" className="block font-bold text-[15px] text-parish-navy mb-1.5">Asa ka nagpuyo?</label>
      <div className="relative mb-1.5">
        <Icon name="search" className="absolute left-3.5 top-3.5 text-parish-text2" />
        <input
          id="gkk-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Barangay, sitio o purok"
          className="w-full min-h-[50px] px-11 text-[16px] text-parish-ink bg-parish-card border-[1.5px] border-parish-borderSoft rounded-[14px] outline-none focus:border-parish-blue [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" aria-label="Hawani" onClick={() => setQ('')} className="absolute right-[3px] top-[3px] w-11 h-11 flex items-center justify-center text-parish-text2">
            <Icon name="x" size={18} />
          </button>
        )}
      </div>
      {examples.length > 0 && <div className="text-[13.5px] text-parish-text2 mb-4">Sulayi: {examples.join(', ')}</div>}

      <DataState
        state={dir}
        skeleton={<Skeletons n={2} h={120} />}
        errorText="Wala ma-load ang GKK directory."
        empty={dir.empty}
        emptyText="Wala pay GKK nga gi-publish. Pangutana sa opisina sa parokya."
      >
        {q && <div aria-live="polite" className="font-semibold text-[14px] text-[#4d4636] mb-2.5">{count} ka GKK ang nakit-an</div>}
        {!count ? (
          <div className="bg-parish-card border border-dashed border-[#d9cdb4] rounded-2xl p-[18px] text-center">
            <div className="font-serif text-[21px] font-bold text-parish-navy mb-1">Walay GKK nga nakit-an para sa “{q}”</div>
            <p className="m-0 mb-3 text-[15px] text-[#4d4636]">Sulayi ang ngalan sa barangay, o pangutan-a ang opisina.</p>
            <BigButton variant="secondary" to="/kontak" className="!w-auto inline-flex px-4">Kontaka ang opisina</BigButton>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((grp) => (
              <div key={grp.area}>
                <h2 className="m-0 mb-2 flex items-center gap-1.5 font-bold text-[13px] tracking-[.1em] uppercase text-[#4d4636]"><Icon name="pin" size={15} />{grp.area}</h2>
                <div className="flex flex-col gap-2.5">{grp.items.map((g) => <GkkCard key={g.name} g={g} />)}</div>
              </div>
            ))}
          </div>
        )}
      </DataState>
    </>
  );
}

const gkkPath = (name) => `/komunidad/gkk/${encodeURIComponent(name)}`;

function GkkCard({ g }) {
  return (
    <Card>
      <Link to={gkkPath(g.name)} className="w-full text-left px-3.5 pt-3.5 pb-2.5 flex gap-2.5 items-start">
        <div className="flex-1 min-w-0">
          <div className="font-serif text-[21px] font-bold leading-[1.15] text-parish-navy">
            {g.patron} {g.area && <span className="text-parish-blue">-{g.area}</span>}
          </div>
          {g.puroks && <div className="text-[13.5px] text-parish-text2 mt-0.5">{g.puroks}</div>}
          <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 mt-2 text-[14px] text-[#3f3b2f]">
            <span className="flex items-center gap-[5px]"><Icon name="home" size={15} className="text-parish-blue" /><strong>{g.households ?? SMALL}</strong> pamilya</span>
            {g.meeting_schedule && <span className="flex items-center gap-[5px]"><Icon name="clock" size={15} className="text-parish-blue" />{g.meeting_schedule}</span>}
          </div>
        </div>
        <Icon name="chev" size={18} className="text-parish-muted mt-1" />
      </Link>
      <div className="border-t border-[#f0e8d6] px-3.5 py-2.5">
        {g.coordinator ? (
          <div className="flex items-center gap-2.5">
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

  if (dir.loading) return <main className="px-4 pt-[18px]"><Skeletons n={3} h={90} /></main>;
  if (dir.error) return <main className="px-4 pt-[18px]"><ErrorNote onRetry={dir.reload}>Wala ma-load ang GKK.</ErrorNote></main>;
  if (!found) return <main className="px-4 pt-[18px]"><EmptyNote>Wala namo makit-i kini nga GKK.</EmptyNote><BigButton variant="secondary" to="/komunidad">Tan-awa ang tanang GKK</BigButton></main>;
  const g = found;
  const c = g.coordinator;

  return (
    <main className="px-4 pt-[18px] pb-7 animate-fadeUp">
      {area && <div className="inline-flex items-center gap-[5px] font-bold text-[12px] tracking-[.1em] uppercase text-[var(--p-eyebrow)]"><Icon name="pin" size={14} />{area}</div>}
      <h1 className="font-serif font-semibold text-[34px] leading-[1.05] mt-1 mb-1 text-parish-navy">{patron}</h1>
      {g.puroks && <div className="text-[15px] text-[#4d4636] mb-4">{g.puroks}</div>}
      <div className={`grid gap-2.5 mb-3.5 ${census?.open ? 'grid-cols-2' : 'grid-cols-1'} ${g.puroks ? '' : 'mt-3'}`}>
        <StatTile value={g.households} label="Pamilya" />
        {census?.open && <StatTile value={g.census_pct != null ? `${g.census_pct}%` : null} small="—" label="Census na-update" />}
      </div>
      {(g.meeting_schedule || g.meeting_place) && (
        <Card className="px-3.5 py-1 mb-3.5 shadow-none">
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

      <h2 className="font-serif font-semibold text-[22px] m-0 mb-2 text-parish-navy">Coordinator</h2>
      {c ? (
        <Card className="p-3.5 mb-5 shadow-none">
          <div className={`flex items-center gap-3 ${c.mobile ? 'mb-3' : ''}`}>
            <Avatar initials={initialsOf(c.name)} size={52} />
            <div><div className="font-bold text-[17px]">{c.name}</div><div className="text-[13.5px] text-parish-text2">GKK Coordinator</div></div>
          </div>
          {c.mobile && (
            <div className="grid grid-cols-2 gap-2">
              <ContactButton href={`tel:${phoneHref(c.mobile)}`} icon="phone">Tawag</ContactButton>
              <ContactButton href={`sms:${phoneHref(c.mobile)}`} icon="sms">Text</ContactButton>
            </div>
          )}
        </Card>
      ) : (
        <div className="bg-parish-card border border-dashed border-[#d9cdb4] rounded-2xl p-3.5 mb-5 flex gap-3 items-center">
          <div className="w-11 h-11 rounded-full bg-[#efe6d3] flex-none flex items-center justify-center text-parish-text2"><Icon name="people" /></div>
          <div className="text-[14.5px] leading-[1.45] text-[#4d4636]">
            Wala pay coordinator nga mouyon nga ipakita. <Link to="/kontak" className="font-bold text-parish-blue underline">Pangutan-a ang opisina sa parokya</Link>
          </div>
        </div>
      )}
      <Link
        to={`/register?gkk=${encodeURIComponent(g.name)}`}
        className="w-full min-h-[56px] flex items-center justify-center text-center px-4 font-bold text-[16.5px] text-white bg-parish-blue rounded-[14px]"
        style={{ boxShadow: '0 14px 30px -12px color-mix(in srgb, var(--p-blue) 65%, transparent)' }}
      >
        Mao ni ang akong GKK, magparehistro
      </Link>
    </main>
  );
}

function StatTile({ value, small = SMALL, label }) {
  return (
    <div className="bg-parish-card border border-parish-border rounded-2xl p-3.5">
      {value == null
        ? <div className="font-serif text-[24px] font-bold text-[#4d4636] leading-[1.25]">{small}</div>
        : <div className="font-serif text-[36px] font-bold text-parish-blue leading-none">{value}</div>}
      <div className="font-bold text-[11px] tracking-[.12em] uppercase text-parish-text2 mt-1.5">{label}</div>
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

  if (q.loading) return <><Skeleton h={200} className="mb-3" /><Skeleton h={260} alt /></>;
  if (q.error) return <ErrorNote onRetry={q.reload}>Wala ma-load ang progreso sa census.</ErrorNote>;
  if (!c?.open) {
    return (
      <Card className="px-[18px] py-[22px] text-center shadow-none">
        <div className="font-serif text-[23px] font-bold text-parish-navy mb-1.5">Sirado ang census karon</div>
        <p className="m-0 text-[15px] leading-normal text-[#4d4636]">Ipakita diri ang progreso inig abli sa sunod nga census.</p>
      </Card>
    );
  }
  if (c.pct == null) return <EmptyNote>Bag-o pa lang giablihan ang census. Wala pay igo nga na-update aron ipakita.</EmptyNote>;

  const rows = [...(c.gkks || [])].sort((a, b) => (sort === 'pct' ? (b.pct ?? -1) - (a.pct ?? -1) : a.name.localeCompare(b.name)));

  return (
    <>
      <Card className="px-4 py-[18px] text-center mb-4 shadow-card">
        <div role="img" aria-label={`${c.pct} porsyento`} className="w-[132px] h-[132px] rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: `conic-gradient(var(--p-blue) 0 ${c.pct}%, #ece2cd 0)` }}>
          <div className="w-[104px] h-[104px] rounded-full bg-parish-card flex flex-col items-center justify-center">
            <div className="font-serif text-[40px] font-bold leading-none text-parish-blue">{c.pct}%</div>
            <div className="text-[12px] text-parish-text2">na-update</div>
          </div>
        </div>
        <h2 className="font-serif font-semibold text-[24px] leading-[1.15] m-0 mb-1.5 text-parish-navy">{c.label}: {c.pct}% sa mga pamilya na-update na</h2>
        <p className="m-0 mb-3.5 text-[15px] leading-normal text-[#4d4636]">
          Salamat sa tanang GKK!{c.ends_on ? ` Abli pa hangtod ${fmtLong(c.ends_on)}.` : ''} Ang matag pamilya nga mo-update makatabang sa parokya sa pag-alagad.
        </p>
        <BigButton to="/census" className="min-h-[52px] text-[16px]">I-update ang among rekord</BigButton>
      </Card>
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h3 className="m-0 font-serif text-[21px] font-bold text-parish-navy">Matag GKK</h3>
        <Pills options={[['pct', 'Pinakataas'], ['name', 'Ngalan']]} value={sort} onChange={setSort} className="[&>button]:flex-none [&>button]:px-3 [&>button]:min-h-[40px] [&>button]:text-[13.5px]" />
      </div>
      <Card className="px-3.5 py-1 shadow-none">
        {rows.map((r) => (
          <div key={r.name} className="py-[11px] border-b border-[#f4eddd] last:border-b-0">
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
      <div className="text-[12.5px] text-parish-text2 mt-2">Porsyento lang ang gipakita. Walay ngalan sa pamilya.</div>
    </>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BAND_PAD, Band, BigButton, Card, Chip, DataState, EmptyNote, ErrorNote, INNER, PageHeader, Pills, Segmented, Skeletons, WRAP, useShare, useSiteToast } from '../../components/site/kit.jsx';
import { api } from '../../api.js';
import {
  SONG_CATEGORIES, fileKindLabel, fileMatches, firstLine, fold, groupFiles, opensInBrowser, orderCategories, songByline, songFileName,
  songIdFromParam, songJsonLd, songMatches, songPath, songText, sortSongs, stanzas,
} from '../../lib/downloads.js';
import { fmtFileSize } from '../../lib/gkkDocuments.js';
import { triggerDownload } from '../../lib/csv.js';
import { excerpt } from '../../lib/seo.js';
import { PARISH_NAME, PARISH_SUB, PageMeta, useSiteTitle } from './SiteLayout.jsx';
import { useDownloads } from './data.js';

// Forms first and by default; the song lyrics are an extra (?tab=kanta).
const TABS = [['porma', 'Mga Porma'], ['kanta', 'Mga Kanta']];

/**
 * Downloads: the forms the parish office shares (GKK forms, the manual
 * census form…) to download, and the songs sung at the GKK Kasaulogan, the
 * Bible Service and other gatherings, to read on a phone. Both are kept
 * under Parish Website in the admin (0096). The tab, search and category
 * stay in the address, so Back from a song returns to the same list.
 */
export default function Downloads() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'kanta' ? 'kanta' : 'porma';
  const q = params.get('q') || '';
  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    setParams(next, { replace: true });
  };
  const state = useDownloads();
  const songs = state.data?.songs || [];
  const files = state.data?.files || [];

  return (
    <main className="animate-fadeUp">
      <Band aria-label="Downloads">
        <div className={`${WRAP} ${BAND_PAD}`}>
          <PageHeader eyebrow="Downloads" title="Mga Porma ug Kanta">
            <Segmented label="Unsa ang pangitaon" options={TABS} value={tab} onChange={(v) => set({ tab: v === 'porma' ? '' : v, q: '', cat: '' })} />
          </PageHeader>
          <p className="m-0 mb-4 lg:mt-1 lg:mb-6 text-[15px] lg:text-[17px] leading-normal text-[#4d4636] max-w-[720px]">
            {tab === 'kanta'
              ? 'Ang mga liriko sa mga kanta sa Kasaulogan sa GKK, sa Bible Service ug sa uban pang panagtigom.'
              : 'Mga porma ug dokumento gikan sa opisina sa parokya: porma sa GKK, census ug uban pa. I-download ug i-print.'}
          </p>
          <SearchField
            value={q}
            onChange={(v) => set({ q: v })}
            label={tab === 'kanta' ? 'Pangitaa ang kanta' : 'Pangitaa ang porma'}
            placeholder={tab === 'kanta' ? 'Titulo o pulong sa kanta' : 'Pangalan sa porma'}
          />
        </div>
      </Band>
      <section className={`${WRAP} py-6 lg:py-10`}>
        <DataState state={state} skeleton={<Skeletons n={4} h={76} />} errorText="Wala ma-load ang downloads.">
          {tab === 'kanta'
            ? <SongList songs={songs} q={q} cat={params.get('cat') || ''} onCat={(c) => set({ cat: c })} />
            : <FileList files={files} q={q} />}
        </DataState>
      </section>
    </main>
  );
}

function SearchField({ value, onChange, label, placeholder }) {
  return (
    <div className="relative lg:max-w-[640px]">
      <label htmlFor="downloads-q" className="sr-only">{label}</label>
      <Icon name="search" className="absolute left-3.5 top-3.5 text-parish-text2 lg:left-4 lg:top-4" />
      <input
        id="downloads-q"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-h-[50px] px-11 text-[16px] text-parish-ink bg-parish-card border-[1.5px] border-parish-borderSoft rounded-[14px] outline-none focus:border-parish-blue [&::-webkit-search-cancel-button]:hidden lg:min-h-[52px] lg:px-12 lg:text-[17px]"
      />
      {value && (
        <button type="button" aria-label="Hawani" onClick={() => onChange('')} className="absolute right-[3px] top-[3px] lg:right-1 lg:top-1 w-11 h-11 flex items-center justify-center text-parish-text2">
          <Icon name="x" size={18} />
        </button>
      )}
    </div>
  );
}

function SongList({ songs, q, cat, onCat }) {
  const cats = useMemo(() => orderCategories(songs.flatMap((s) => s.categories || []), SONG_CATEGORIES), [songs]);
  const current = cats.find((c) => fold(c) === fold(cat)) || '';
  const shown = sortSongs(songs.filter((s) => (!current || (s.categories || []).some((c) => fold(c) === fold(current))) && songMatches(s, q)));

  if (!songs.length) return <EmptyNote>Wala pay kanta nga gi-post. Balik unya!</EmptyNote>;
  return (
    <>
      {cats.length > 0 && (
        <Pills scroll className="mb-4 lg:mb-5" options={[['', 'Tanan'], ...cats.map((c) => [c, c])]} value={current} onChange={onCat} />
      )}
      <div className="text-[13.5px] font-semibold text-parish-text2 mb-2.5" aria-live="polite">
        {shown.length} ka kanta{q || current ? ' nakit-an' : ''}
      </div>
      {!shown.length ? (
        <EmptyNote>Walay kanta nga nakit-an{q ? ` para sa “${q}”` : ''}.</EmptyNote>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-2.5 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3.5">
          {shown.map((s) => (
            <li key={s.id}>
              <Link to={songPath(s)} className="h-full flex items-center gap-3.5 bg-parish-card border border-parish-border rounded-2xl p-3.5 lg:p-4 shadow-cardSm hover:border-[var(--p-blue-border)]">
                <span className="w-11 h-11 flex-none rounded-[13px] flex items-center justify-center bg-[var(--p-blue-tint)] text-parish-blue">
                  <Icon name="music" size={21} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-[16.5px] lg:text-[17px] text-parish-navy leading-snug">{s.title}</span>
                  {fold(firstLine(s.lyrics)) !== fold(s.title) && <span className="block text-[14px] text-parish-text2 truncate">{firstLine(s.lyrics)}</span>}
                  {songByline(s) && <span className="block text-[13px] text-parish-text2 truncate">{songByline(s)}</span>}
                  {(s.categories || []).length > 0 && <span className="block text-[12.5px] font-semibold text-[var(--p-eyebrow)] mt-0.5 truncate">{s.categories.join(' · ')}</span>}
                </span>
                <Icon name="chev" size={18} className="text-parish-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FileList({ files, q }) {
  const groups = groupFiles(files.filter((f) => fileMatches(f, q)));
  if (!files.length) return <EmptyNote>Wala pay porma nga gi-post. Balik unya!</EmptyNote>;
  if (!groups.length) return <EmptyNote>Walay porma nga nakit-an para sa “{q}”.</EmptyNote>;
  return (
    <div className="flex flex-col gap-7 lg:gap-10">
      {groups.map((g) => (
        <section key={g.category} aria-label={g.category}>
          <h2 className="m-0 mb-3 font-serif text-[24px] lg:text-[30px] font-bold text-parish-navy">{g.category}</h2>
          <ul className="m-0 p-0 list-none flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3.5">
            {g.files.map((f) => <li key={f.id}><FileCard f={f} /></li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FileCard({ f }) {
  const kind = fileKindLabel(f.content_type, f.file_name);
  return (
    <Card className="h-full p-3.5 lg:p-[18px] flex flex-col gap-3">
      <div className="flex gap-3.5 items-start">
        <span className="w-11 h-11 flex-none rounded-[13px] flex flex-col items-center justify-center bg-[var(--p-blue-tint)] text-parish-blue">
          <Icon name="doc" size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[16.5px] lg:text-[17px] text-parish-navy leading-snug">{f.title}</div>
          {f.description && <div className="text-[14.5px] text-[#4d4636] leading-normal mt-0.5 whitespace-pre-line">{f.description}</div>}
          <div className="flex items-center gap-2 mt-1.5 text-[13px] text-parish-text2">
            <Chip tone="gray">{kind}</Chip>
            {f.size_bytes ? <span>{fmtFileSize(f.size_bytes)}</span> : null}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-auto">
        <a href={api.downloadFileUrl(f, { download: true })} className="flex-1 min-h-[48px] rounded-xl inline-flex items-center justify-center gap-2 font-bold text-[15.5px] bg-parish-blue text-white hover:bg-parish-blueDeep">
          <Icon name="down" size={19} />I-download
        </a>
        {opensInBrowser(f.content_type) && (
          <a href={api.downloadFileUrl(f)} target="_blank" rel="noopener noreferrer" className="flex-1 min-h-[48px] rounded-xl inline-flex items-center justify-center gap-2 font-bold text-[15.5px] text-parish-blueDeep bg-parish-card border-[1.5px] border-[var(--p-blue-border)] hover:border-parish-blue">
            Ablihi
          </a>
        )}
      </div>
    </Card>
  );
}

// Lyrics text sizes, smallest to largest; the visitor's choice is kept on their device.
const SIZES = [17, 19, 22, 26];
const SIZE_KEY = 'pmr_lyrics_size';
function readSize() {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY));
    return SIZES.includes(n) ? n : SIZES[1];
  } catch {
    return SIZES[1];
  }
}

/**
 * One song's lyrics, large and easy to follow, with a text size switch. Open
 * to anyone anywhere, no account, nothing to pay: the lyrics are plain text
 * on the page (so search engines read them), with the composer credited, and
 * free to copy, print, save as a PDF or download as a text file.
 */
export function SongPage() {
  const { id: param } = useParams();
  const state = useDownloads();
  const id = songIdFromParam(param);
  const song = (state.data?.songs || []).find((s) => s.id === id);
  const [size, setSize] = useState(readSize);
  const share = useShare();
  const say = useSiteToast();
  useSiteTitle('Kanta');
  useEffect(() => { try { localStorage.setItem(SIZE_KEY, String(size)); } catch { /* not kept */ } }, [size]);

  if (state.loading) return <main className={`${INNER} lg:max-w-[820px]`}><Skeletons n={3} h={140} /></main>;
  if (state.error) return <main className={`${INNER} lg:max-w-[820px]`}><ErrorNote onRetry={state.reload}>Wala ma-load ang kanta.</ErrorNote></main>;
  if (!song) {
    return (
      <main className={`${INNER} lg:max-w-[820px]`}>
        <EmptyNote>Wala na makit-i kini nga kanta.</EmptyNote>
        <BigButton to="/downloads?tab=kanta" variant="secondary">Tan-awa ang tanang kanta</BigButton>
      </main>
    );
  }

  // One address per song, with its title in it (and the new title after a rename).
  const path = songPath(song);
  if (`/downloads/kanta/${param}` !== path) return <Navigate to={path} replace />;

  const url = new URL(path, window.location.origin).href;
  const i = SIZES.indexOf(size);
  const byline = songByline(song);
  async function copy() {
    try {
      await navigator.clipboard.writeText(songText(song, url));
      say('Na-copy ang liriko.');
    } catch {
      say('Wala ma-copy ang liriko.');
    }
  }

  return (
    <main className={`${INNER} lg:max-w-[820px]`}>
      <PageMeta
        title={`${song.title} (Lyrics)`}
        description={excerpt(`Lyrics: ${song.title}${song.composer ? `, ni ${song.composer}` : ''}. ${stanzas(song.lyrics).join(' ')}`)}
        jsonLd={songJsonLd({ song, url, parishName: `${PARISH_NAME} ${PARISH_SUB.split(' · ')[0]}` })}
      />
      {(song.categories || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">{song.categories.map((c) => <Chip key={c} tone="gold">{c}</Chip>)}</div>
      )}
      <h1 className="font-serif font-semibold text-[31px] lg:text-[44px] leading-[1.1] m-0 mb-1.5 text-parish-navy">{song.title}</h1>
      {byline && <p className="m-0 mb-1 font-semibold text-[15.5px] lg:text-[17px] text-parish-ink">{byline}</p>}
      {song.note && <p className="m-0 mb-1 text-[15px] lg:text-[16px] text-parish-text2">{song.note}</p>}

      <div className="sticky top-[58px] lg:top-[76px] z-10 -mx-4 px-4 lg:mx-0 lg:px-0 py-2.5 mb-3 flex items-center gap-2 bg-parish-bg/95 backdrop-blur-sm border-b border-parish-border">
        <span className="text-[13.5px] font-semibold text-parish-text2 mr-auto">Gidak-on sa letra</span>
        <button type="button" aria-label="Gamyon ang letra" disabled={i <= 0} onClick={() => setSize(SIZES[i - 1])} className="w-11 h-11 rounded-xl border-[1.5px] border-parish-borderSoft bg-parish-card font-bold text-[15px] text-parish-navy disabled:opacity-40">A−</button>
        <button type="button" aria-label="Dakoon ang letra" disabled={i >= SIZES.length - 1} onClick={() => setSize(SIZES[i + 1])} className="w-11 h-11 rounded-xl border-[1.5px] border-parish-borderSoft bg-parish-card font-bold text-[19px] text-parish-navy disabled:opacity-40">A+</button>
      </div>

      <div className="text-parish-ink" style={{ fontSize: size, lineHeight: 1.6 }}>
        {stanzas(song.lyrics).map((st, n) => <p key={n} className="m-0 mb-[1.1em] whitespace-pre-line">{st}</p>)}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-6">
        <BigButton variant="secondary" onClick={() => share(song.title, path)}><Icon name="share" size={19} />Ipaambit</BigButton>
        <BigButton variant="secondary" onClick={copy}><Icon name="doc" size={19} />Kopyaha ang liriko</BigButton>
        <BigButton variant="secondary" onClick={() => window.print()}><Icon name="doc" size={19} />I-print o i-save nga PDF</BigButton>
        <BigButton variant="secondary" onClick={() => triggerDownload(new Blob([songText(song, url)], { type: 'text/plain;charset=utf-8' }), songFileName(song))}>
          <Icon name="down" size={19} />I-download (text)
        </BigButton>
      </div>

      <p className="mt-6 mb-0 text-[13.5px] leading-normal text-parish-text2">
        Libre kini para sa tanan, alang sa pag-ampo ug pag-awit. Kung ikaw ang nagsulat sa kanta ug adunay ikatul-id, o dili nimo gusto nga naa kini dinhi,{' '}
        <Link to="/kontak" className="font-semibold text-parish-blue underline underline-offset-2">kontaka ang opisina sa parokya</Link>.
      </p>
      <SongPrintSheet song={song} byline={byline} url={url} />
    </main>
  );
}

/**
 * The song on paper (or as a PDF from the print dialog): title, composer and
 * lyrics in black on white, and where it came from. Hidden on screen and
 * revealed by the #print-sheet print rules in index.css.
 */
function SongPrintSheet({ song, byline, url }) {
  return createPortal(
    <div id="print-sheet" aria-hidden style={{ color: '#000', background: '#fff' }}>
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, margin: '0 0 4px' }}>{song.title}</h1>
      {byline && <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 2px' }}>{byline}</p>}
      {song.note && <p style={{ fontSize: 12, margin: '0 0 2px', color: '#333' }}>{song.note}</p>}
      <div style={{ fontSize: 15, lineHeight: 1.55, marginTop: 16, columnGap: 32 }}>
        {stanzas(song.lyrics).map((st, n) => <p key={n} style={{ margin: '0 0 14px', whiteSpace: 'pre-line', breakInside: 'avoid' }}>{st}</p>)}
      </div>
      <p style={{ fontSize: 10.5, color: '#444', marginTop: 20, borderTop: '1px solid #bbb', paddingTop: 6 }}>{PARISH_NAME} {PARISH_SUB} · {url}</p>
    </div>,
    document.body,
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BAND_PAD, Band, BigButton, Card, Chip, DataState, EmptyNote, ErrorNote, INNER, PageHeader, Pills, Skeletons, WRAP, useShare, useSiteToast } from '../../components/site/kit.jsx';
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

const FORMS_ID = 'forms';
const SONGS_ID = 'song-lyrics';
// Where the page was when a song was opened, so Back returns there (the
// layout starts every page at the top). Per tab, gone when it's closed.
const SCROLL_KEY = 'pmr_downloads_y';
// Clear of the sticky header when jumping to a section.
const SECTION = 'scroll-mt-[70px] lg:scroll-mt-[92px]';
const SECTION_TITLE = 'm-0 font-serif font-semibold text-[29px] lg:text-[40px] leading-[1.1] text-parish-navy';

/**
 * Downloads: one page, the forms the parish office shares (GKK forms, the
 * manual census form…) first, then the lyrics of the songs sung at the GKK
 * Kasaulogan, the Bible Service and other gatherings. Both are kept under
 * Parish Website in the admin (0096). One search covers both; it and the
 * song category stay in the address. ?tab=kanta (the /kanta, /lyrics and
 * /songs addresses) opens the page at the songs.
 */
export default function Downloads() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    setParams(next, { replace: true });
  };
  const state = useDownloads();
  const songs = state.data?.songs || [];
  const files = state.data?.files || [];
  const loaded = !!state.data;

  // Once the lists are on the page: back from a song, where it was; from a songs address, at the songs.
  useEffect(() => {
    if (!loaded) return undefined;
    let y = null;
    try { y = sessionStorage.getItem(SCROLL_KEY); sessionStorage.removeItem(SCROLL_KEY); } catch { /* not kept */ }
    if (y === null && params.get('tab') !== 'kanta') return undefined;
    // After the layout's own jump to the top.
    const t = setTimeout(() => (y !== null ? window.scrollTo(0, Number(y)) : document.getElementById(SONGS_ID)?.scrollIntoView()), 0);
    return () => clearTimeout(t);
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const jump = 'min-h-[40px] inline-flex items-center gap-1.5 px-3.5 rounded-full border-[1.5px] border-[var(--p-blue-border)] bg-parish-card font-semibold text-[14.5px] text-parish-blueDeep hover:border-parish-blue';
  return (
    <main className="animate-fadeUp">
      <Band aria-label="Downloads">
        <div className={`${WRAP} ${BAND_PAD}`}>
          <PageHeader eyebrow="Downloads" title="Forms and Song Lyrics" />
          <p className="m-0 mb-3.5 lg:mt-1 lg:mb-5 text-[15px] lg:text-[17px] leading-normal text-[#4d4636] max-w-[720px]">
            Mga porma gikan sa opisina sa parokya nga ma-download ug ma-print, ug ang mga liriko sa mga kanta sa Kasaulogan sa GKK, Bible Service ug uban pa.
          </p>
          <nav aria-label="Sa niini nga panid" className="flex flex-wrap gap-2 mb-4 lg:mb-5">
            <a href={`#${FORMS_ID}`} className={jump}><Icon name="doc" size={17} />Forms Available for Download</a>
            <a href={`#${SONGS_ID}`} className={jump}><Icon name="music" size={17} />Song Lyrics</a>
          </nav>
          <SearchField value={q} onChange={(v) => set({ q: v })} label="Pangitaa ang porma o kanta" placeholder="Porma, titulo o pulong sa kanta" />
        </div>
      </Band>

      <DataState state={state} skeleton={<div className={`${WRAP} py-6 lg:py-10`}><Skeletons n={4} h={76} /></div>} errorText="Wala ma-load ang downloads.">
        <section id={FORMS_ID} aria-labelledby={`${FORMS_ID}-title`} className={`${WRAP} ${SECTION} pt-7 pb-8 lg:pt-11 lg:pb-12`}>
          <h2 id={`${FORMS_ID}-title`} className={`${SECTION_TITLE} mb-4 lg:mb-6`}>Forms Available for Download</h2>
          <FileList files={files} q={q} />
        </section>

        <section id={SONGS_ID} aria-labelledby={`${SONGS_ID}-title`} className={`${SECTION} border-t border-parish-border`} style={{ background: '#f1ead9' }}>
          <div className={`${WRAP} pt-7 pb-8 lg:pt-11 lg:pb-12`}>
            <h2 id={`${SONGS_ID}-title`} className={`${SECTION_TITLE} mb-1.5`}>Song Lyrics</h2>
            <p className="m-0 mb-4 lg:mb-5 text-[15px] lg:text-[16.5px] leading-normal text-[#4d4636] max-w-[720px]">
              Ang mga liriko sa mga kanta sa Kasaulogan sa GKK, sa Bible Service ug sa uban pang panagtigom. Libre basahon, i-print ug i-download.
            </p>
            <SongList songs={songs} q={q} cat={params.get('cat') || ''} onCat={(c) => set({ cat: c })} />
          </div>
        </section>
      </DataState>
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
              <Link to={songPath(s)} onClick={() => { try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY)); } catch { /* not kept */ } }} className="h-full flex items-center gap-3.5 bg-parish-card border border-parish-border rounded-2xl p-3.5 lg:p-4 shadow-cardSm hover:border-[var(--p-blue-border)]">
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
  // One panel per category with its files as a list; on computers the panels
  // flow in two columns, each kept whole.
  return (
    <div className="flex flex-col gap-4 lg:block lg:columns-2 lg:gap-6">
      {groups.map((g) => (
        <Card as="section" key={g.category} aria-label={g.category} className="overflow-hidden lg:break-inside-avoid lg:mb-6">
          <h3 className="m-0 px-4 py-3 flex items-baseline justify-between gap-3 border-b border-parish-border bg-[#faf6ec]">
            <span className="font-serif font-semibold text-[21px] lg:text-[23px] leading-tight text-parish-navy">{g.category}</span>
            <span className="flex-none text-[12.5px] font-semibold text-parish-text2">{g.files.length} {g.files.length === 1 ? 'file' : 'files'}</span>
          </h3>
          <ul className="m-0 p-0 list-none divide-y divide-[#f0e8d6]">
            {g.files.map((f) => <li key={f.id}><FileRow f={f} /></li>)}
          </ul>
        </Card>
      ))}
    </div>
  );
}

// Each kind of file in its own colour, so a list is easy to scan.
const KIND_TONES = { PDF: 'red', Word: 'blue', Excel: 'green', Photo: 'gold' };

/**
 * One file in its category's list: its kind, title, a line of description
 * and size, and a download button. The title opens a PDF or picture in the
 * browser and downloads anything else.
 */
function FileRow({ f }) {
  const kind = fileKindLabel(f.content_type, f.file_name);
  const download = api.downloadFileUrl(f, { download: true });
  const opens = opensInBrowser(f.content_type);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--p-blue-tint)]">
      <span className="flex-none w-[52px] text-center"><Chip tone={KIND_TONES[kind] || 'gray'}>{kind}</Chip></span>
      <div className="flex-1 min-w-0">
        <a
          href={opens ? api.downloadFileUrl(f) : download}
          {...(opens ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="block font-semibold text-[15.5px] leading-snug text-parish-navy hover:text-parish-blue hover:underline underline-offset-2"
        >
          {f.title}
        </a>
        <div className="text-[13px] text-parish-text2 leading-snug line-clamp-2" title={f.description || undefined}>
          {[f.description, f.size_bytes ? fmtFileSize(f.size_bytes) : ''].filter(Boolean).join(' · ')}
        </div>
      </div>
      <a
        href={download}
        aria-label={`I-download ang ${f.title}`}
        title="I-download"
        className="flex-none w-11 h-11 rounded-xl flex items-center justify-center bg-parish-blue text-white hover:bg-parish-blueDeep"
      >
        <Icon name="down" size={19} />
      </a>
    </div>
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

import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BAND_PAD, Band, BigButton, EmptyNote, ErrorNote, Eyebrow, Skeleton, Skeletons, WRAP } from '../../components/site/kit.jsx';
import { chapterAnchor, historyWhen } from '../../lib/history.js';
import { Body, Gallery, Lightbox, Photo } from './Details.jsx';
import { useSiteTitle } from './SiteLayout.jsx';
import { useHistory } from './data.js';

// Below the sticky header (58px on phones, 76px on desktop) and the phone's year bar.
const CHAPTER_MT = 'scroll-mt-[124px] lg:scroll-mt-[100px]';
// How far down the screen a chapter's top must be to count as the one being read.
const READING_LINE = 160;
const NO_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/**
 * Kasaysayan (/simbahan/kasaysayan): the parish's history, written under
 * Parish Website → History. The main article's photo and gallery open the
 * page, then its text; then the chapters, oldest first, with a timeline
 * beside them (a row of years along the top on a phone) that follows the
 * reader and jumps to a chapter.
 */
export default function Kasaysayan() {
  useSiteTitle('Kasaysayan');
  const q = useHistory();
  const main = q.data?.main || null;
  const chapters = q.data?.chapters || [];

  if (q.loading) {
    return (
      <main className={`${WRAP} ${BAND_PAD}`}>
        <Skeleton h={380} className="rounded-[18px] mb-5" />
        <Skeletons n={3} h={90} />
      </main>
    );
  }
  if (q.error) return <main className={`${WRAP} ${BAND_PAD}`}><ErrorNote onRetry={q.reload}>Wala ma-load ang kasaysayan.</ErrorNote></main>;
  if (!main && !chapters.length) {
    return (
      <main className={`${WRAP} ${BAND_PAD}`}>
        <EmptyNote>Wala pay kasaysayan nga gi-publish. Balik unya.</EmptyNote>
        <BigButton variant="secondary" to="/simbahan" className="lg:w-auto lg:inline-flex lg:px-6">Balik sa Ang Simbahan</BigButton>
      </main>
    );
  }

  return (
    <main className="animate-fadeUp">
      <Hero main={main} />
      {main?.body && (
        <section aria-label="Ang sinugdanan" className={`${WRAP} pt-7 lg:pt-12`}>
          <div className="lg:max-w-[780px]"><Body text={main.body} /></div>
        </section>
      )}
      {chapters.length > 0 && <Chapters chapters={chapters} />}
    </main>
  );
}

/** The title and the main article's photos: its main photo large, its gallery beside it. */
function Hero({ main }) {
  const photos = [main?.photo_url && { url: main.photo_url, caption: '' }, ...(main?.photos || [])].filter((p) => p?.url);
  const [open, setOpen] = useState(null);
  const side = photos.slice(1, 5);
  const more = photos.length - 5;
  const tile = 'relative block w-full h-full overflow-hidden appearance-none border-none p-0 cursor-zoom-in bg-[#efe6d3]';

  return (
    <Band aria-labelledby="kasaysayan-title">
      <div className={`${WRAP} ${BAND_PAD}`}>
        <Eyebrow>Kasaysayan sa Parokya</Eyebrow>
        <h1 id="kasaysayan-title" className="font-serif font-semibold text-[32px] lg:text-[50px] leading-[1.08] lg:leading-[1.04] mt-0.5 mb-2 text-parish-navy lg:max-w-[900px]">
          {main?.title || 'Ang Among Kasaysayan'}
        </h1>
        {main?.author && <div className="mb-4 lg:mb-6 text-[15px] lg:text-[16px] text-parish-text2">Sinulat ni <span className="font-semibold text-parish-ink">{main.author}</span></div>}

        {photos.length > 0 && (
          // Phones: the main photo, then the rest in a row. Desktop: the main photo
          // on the left half, up to four more filling the right half.
          <div className={`grid gap-2 lg:gap-3 mt-4 ${side.length ? `grid-cols-4 ${side.length === 1 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} lg:grid-rows-2 lg:h-[500px]` : ''}`}>
            <button type="button" onClick={() => setOpen(0)} className={`${tile} rounded-[14px] lg:rounded-[18px] ${side.length ? 'col-span-4 lg:col-span-2 lg:row-span-2' : 'lg:h-[520px]'} aspect-[16/10] lg:aspect-auto`}>
              <img src={photos[0].url} alt={main?.title || ''} className="w-full h-full object-cover" />
            </button>
            {side.map((p, i) => (
              <button
                key={p.url} type="button" onClick={() => setOpen(i + 1)} aria-label={p.caption || `Litrato ${i + 2}`}
                // Full height with one or two beside it; with three, the first is.
                className={`${tile} rounded-[10px] lg:rounded-[14px] aspect-square lg:aspect-auto ${side.length <= 2 || (side.length === 3 && i === 0) ? 'lg:row-span-2' : ''}`}
              >
                <img src={p.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                {i === side.length - 1 && more > 0 && (
                  <span className="absolute inset-0 bg-black/50 text-white font-bold text-[18px] lg:text-[24px] flex items-center justify-center">+{more}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {open != null && <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
      </div>
    </Band>
  );
}

/** Which chapter is being read: the last one whose top has passed the reading line. */
function useCurrentChapter(chapters) {
  const [current, setCurrent] = useState(chapters[0]?.id ?? null);
  useEffect(() => {
    // A handful of chapters: cheap enough to check on every scroll.
    const update = () => {
      let id = chapters[0]?.id ?? null;
      for (const c of chapters) {
        const el = document.getElementById(chapterAnchor(c));
        if (el && el.getBoundingClientRect().top <= READING_LINE) id = c.id;
      }
      setCurrent(id);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [chapters]);
  return current;
}

function Chapters({ chapters }) {
  const current = useCurrentChapter(chapters);
  const { hash } = useLocation();

  const go = (c, behavior = 'smooth') => {
    document.getElementById(chapterAnchor(c))?.scrollIntoView({ behavior, block: 'start' });
    window.history.replaceState(window.history.state, '', `#${chapterAnchor(c)}`);
  };
  // A shared link to a chapter (#tuig-12): straight there once it's on the page.
  useEffect(() => {
    const c = chapters.find((x) => `#${chapterAnchor(x)}` === hash);
    if (c) setTimeout(() => go(c, 'auto'), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section aria-labelledby="panaw-title" className="mt-8 lg:mt-14 border-t" style={{ borderColor: 'var(--p-blue-border)' }}>
      <YearBar chapters={chapters} current={current} onPick={go} />
      <div className={`${WRAP} pt-6 lg:pt-12 pb-4 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-14 lg:items-start`}>
        <div className="min-w-0">
          <Eyebrow>Sukad sa sinugdanan</Eyebrow>
          <h2 id="panaw-title" className="m-0 mb-6 lg:mb-10 font-serif text-[30px] lg:text-[40px] font-bold text-parish-navy leading-tight">Ang Among Panaw</h2>
          {chapters.map((c, i) => <Chapter key={c.id} c={c} last={i === chapters.length - 1} />)}
        </div>
        <Timeline chapters={chapters} current={current} onPick={go} />
      </div>
    </section>
  );
}

/** One chapter: its year, title, cover photo, text and gallery. */
function Chapter({ c, last }) {
  const when = historyWhen(c);
  return (
    <article id={chapterAnchor(c)} aria-labelledby={`${chapterAnchor(c)}-title`} className={`${CHAPTER_MT} ${last ? '' : 'pb-8 mb-8 lg:pb-12 lg:mb-12 border-b border-[#e7dcc4]'}`}>
      <div className="flex items-center gap-3 mb-1.5">
        <span className="font-serif font-bold text-[26px] lg:text-[34px] leading-none text-[var(--p-gold-deep)]">{when}</span>
        <span className="flex-1 h-px bg-[#e7dcc4]" aria-hidden />
      </div>
      <h3 id={`${chapterAnchor(c)}-title`} className="m-0 mb-2 font-serif font-semibold text-[25px] lg:text-[32px] leading-tight text-parish-navy">{c.title}</h3>
      {c.author && <div className="mb-3.5 text-[14.5px] text-parish-text2">Sinulat ni <span className="font-semibold text-parish-ink">{c.author}</span></div>}
      <Photo src={c.photo_url} h={210} hLg={440} alt={c.title} />
      <Body text={c.body} />
      <Gallery photos={c.photos} id={`${chapterAnchor(c)}-gallery`} cols="grid-cols-2 sm:grid-cols-3" />
    </article>
  );
}

/** Desktop: the chapters down the right side, the one being read marked, sticking under the header. */
function Timeline({ chapters, current, onPick }) {
  return (
    <nav aria-label="Mga tuig" className="hidden lg:block sticky top-[100px] max-h-[calc(100vh-120px)] overflow-y-auto">
      <div className="font-bold text-[12px] tracking-[.18em] uppercase text-[var(--p-eyebrow)] mb-3">Mga tuig</div>
      <ol className="list-none m-0 p-0 relative">
        <span className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-[var(--p-blue-border)]" aria-hidden />
        {chapters.map((c) => {
          const on = c.id === current;
          return (
            <li key={c.id} className="relative">
              <a
                href={`#${chapterAnchor(c)}`}
                onClick={(e) => { e.preventDefault(); onPick(c); }}
                aria-current={on ? 'location' : undefined}
                className={`flex gap-3 items-start py-2 pr-2 rounded-lg no-underline ${on ? '' : 'hover:bg-[var(--p-blue-tint)]'}`}
              >
                <span
                  className={`relative mt-[5px] w-4 h-4 flex-none rounded-full border-2 ${on ? 'bg-parish-blue border-parish-blue' : 'bg-parish-bg border-[var(--p-blue-border)]'}`}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className={`block font-serif font-bold text-[18px] leading-tight ${on ? 'text-parish-blue' : 'text-parish-navy'}`}>{historyWhen(c)}</span>
                  <span className={`block text-[13.5px] leading-snug ${on ? 'text-parish-ink font-semibold' : 'text-parish-text2'}`}>{c.title}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Phones: the years in a row under the header, the one being read kept in view. */
function YearBar({ chapters, current, onPick }) {
  const row = useRef(null);
  useEffect(() => {
    const el = row.current?.querySelector('[aria-current]');
    if (!el || !row.current) return;
    const box = row.current;
    box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
  }, [current]);
  return (
    <nav aria-label="Mga tuig" className="lg:hidden sticky top-[58px] z-10 border-b backdrop-blur-md" style={{ background: 'rgba(247,242,232,.95)', borderColor: 'var(--p-blue-border)' }}>
      <div ref={row} className={`flex gap-2 overflow-x-auto px-3.5 py-2.5 ${NO_SCROLLBAR}`}>
        {chapters.map((c) => {
          const on = c.id === current;
          return (
            <button
              key={c.id} type="button" onClick={() => onPick(c)} aria-current={on ? 'location' : undefined}
              className={`flex-none min-h-[36px] px-3.5 rounded-full border-[1.5px] font-bold text-[14px] appearance-none cursor-pointer ${on ? 'bg-parish-blue border-parish-blue text-white' : 'bg-parish-card border-[var(--p-blue-border)] text-parish-blueDeep'}`}
            >
              {historyWhen(c)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

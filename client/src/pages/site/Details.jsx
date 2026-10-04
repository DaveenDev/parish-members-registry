import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BigButton, Card, EmptyNote, ErrorNote, INNER, InfoRow, Skeletons, useShare, useSiteToast } from '../../components/site/kit.jsx';
import { AnnouncementChip, ArticleChip, eventTone } from '../../components/site/cards.jsx';
import { triggerDownload } from '../../lib/csv.js';
import {
  ARTICLES_PAGE, BIS_DAYS, EVENT_ICONS, EVENT_TYPE_LABELS, articlePath, eventDays, eventIcs, eventSpan, eventTime, fmtLong, fmtShort, paragraphs, parseIso,
} from '../../lib/site.js';
import { PARISH_NAME, useSiteTitle } from './SiteLayout.jsx';
import { useItem } from './data.js';

const READING = `${INNER} lg:max-w-[760px]`;

/** Loading / error / not-found around a detail page. `className` sets the desktop layout. */
function Detail({ q, notFound, className = READING, children }) {
  if (q.loading) return <main className={READING}><Skeletons n={3} h={90} /></main>;
  if (q.error) return <main className={READING}><ErrorNote onRetry={q.reload}>Wala ma-load.</ErrorNote></main>;
  if (!q.data) {
    return (
      <main className={READING}>
        <EmptyNote>{notFound}</EmptyNote>
        <BigButton variant="secondary" to="/">Balik sa Home</BigButton>
      </main>
    );
  }
  return <main className={className}>{children(q.data)}</main>;
}

const READ_TEXT = 'text-[17px] lg:text-[19px] leading-[1.65] lg:leading-[1.7] text-parish-ink';
const DETAIL_TITLE = 'font-serif font-semibold text-[31px] lg:text-[48px] leading-[1.1] lg:leading-[1.06] m-0 mb-3.5 lg:mb-5 text-parish-navy';
const SHARE = 'mt-2 lg:w-auto lg:inline-flex lg:px-6 lg:min-h-[52px] lg:text-[16px]';

function Body({ text, className = READ_TEXT }) {
  return paragraphs(text).map((p, i) => <p key={i} className={`m-0 mb-3.5 lg:mb-4 whitespace-pre-line ${className}`}>{p}</p>);
}

const PHOTO_BOX = 'rounded-[14px] lg:rounded-[18px] mb-4 lg:mb-6 bg-[#efe6d3] h-[var(--h)] lg:h-[var(--h-lg)]';

/**
 * A cover photo across the full content width at a fixed height (article and
 * event pages). By default it's cropped to fill. With `whole`, the entire
 * image is shown centred over a blurred copy that fills the sides, like the
 * event cards, so a poster's text is never cut off.
 */
function Photo({ src, h = 200, hLg = h, alt = '', whole = false }) {
  if (!src) return null;
  const size = { '--h': `${h}px`, '--h-lg': `${hLg}px` };
  if (!whole) return <img src={src} alt={alt} loading="lazy" className={`w-full object-cover ${PHOTO_BOX}`} style={size} />;
  return (
    <div className={`relative overflow-hidden ${PHOTO_BOX}`} style={size}>
      <img src={src} alt="" aria-hidden loading="lazy" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-70" />
      <img src={src} alt={alt} loading="lazy" className="absolute inset-0 w-full h-full object-contain" />
    </div>
  );
}

export function EventDetail() {
  const { id } = useParams();
  useSiteTitle('Kalihokan');
  const share = useShare();
  const say = useSiteToast();
  return (
    <Detail
      q={useItem('events', id)}
      notFound="Wala na kini nga kalihokan sa kalendaryo."
      className={`${INNER} lg:max-w-[1240px] lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-x-10 lg:items-start lg:[grid-template-areas:'head_head''photo_photo''body_side''body_act']`}
    >
      {(e) => {
        const tone = eventTone(e);
        const span = eventSpan(e);
        const start = parseIso(e.start_date);
        const when = eventDays(e) > 1 ? `${fmtShort(e.start_date)} – ${fmtShort(e.end_date)}` : `${BIS_DAYS[start.getDay()]}, ${fmtLong(e.start_date)}`;
        function addToCalendar() {
          const ics = eventIcs(e, { parishName: PARISH_NAME });
          triggerDownload(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), `kalihokan-${e.id}.ics`);
          say('Na-download ang .ics file. Ablihi aron idugang sa kalendaryo.');
        }
        return (
          <>
            <div className="lg:[grid-area:head]">
              <div className="inline-flex items-center gap-1.5 font-bold text-[12px] lg:text-[12.5px] tracking-[.06em] uppercase rounded-lg px-[9px] py-[5px] lg:px-2.5 lg:py-1.5" style={{ color: tone.color, background: tone.background }}>
                <Icon name={EVENT_ICONS[e.type] || 'cal'} size={15} />{EVENT_TYPE_LABELS[e.type] || e.type}
              </div>
              <h1 className="font-serif font-semibold text-[32px] lg:text-[50px] leading-[1.08] lg:leading-[1.04] mt-2.5 mb-4 lg:mt-3.5 lg:mb-[18px] text-parish-navy">{e.title}</h1>
            </div>
            {/* Full width under the title like an article, but the whole poster is shown
                (over a blurred fill) and it's a little taller on phones so its text stays readable. */}
            {e.photo_url && (
              <div className="lg:[grid-area:photo]">
                <Photo src={e.photo_url} h={260} hLg={560} alt={e.title} whole />
              </div>
            )}
            <div className="lg:[grid-area:side]">
              <Card className="px-3.5 py-1 mb-4 shadow-none lg:px-5 lg:pt-2 lg:pb-2 lg:mb-3 lg:rounded-[20px] lg:shadow-card">
                <InfoRow icon="cal">{when}{span && <div className="text-[13.5px] font-normal text-parish-text2">{span}</div>}</InfoRow>
                <InfoRow icon="clock" last={!e.location && !e.organizer}>{eventTime(e)}</InfoRow>
                {e.location && <InfoRow icon="pin" last={!e.organizer}>{e.location}</InfoRow>}
                {e.organizer && <InfoRow icon="people" label="Nag-organisar" last>{e.organizer}</InfoRow>}
              </Card>
            </div>
            <div className="lg:[grid-area:body] lg:max-w-[640px]">
              {e.description && <Body text={e.description} className="text-[16px] lg:text-[18px] leading-relaxed lg:leading-[1.65] text-[#3f3b2f]" />}
            </div>
            <div className="mt-2 lg:mt-0 flex flex-col gap-2.5 lg:[grid-area:act]">
              <BigButton onClick={addToCalendar}><Icon name="cal" />Idugang sa kalendaryo</BigButton>
              <BigButton variant="secondary" onClick={() => share(e.title)}><Icon name="share" size={18} />Ipaambit</BigButton>
            </div>
          </>
        );
      }}
    </Detail>
  );
}

export function AnnouncementDetail() {
  const { id } = useParams();
  useSiteTitle('Pahibalo');
  const share = useShare();
  return (
    <Detail q={useItem('announcements', id)} notFound="Wala na kini nga pahibalo.">
      {(a) => (
        <>
          <div className="flex gap-2 items-center mb-2"><AnnouncementChip a={a} /><span className="text-[13.5px] lg:text-[14.5px] text-parish-text2">{fmtShort(a.publish_on)}</span></div>
          <h1 className={DETAIL_TITLE}>{a.title}</h1>
          <Body text={a.body} />
          <BigButton className={SHARE} onClick={() => share(a.title)}><Icon name="share" />Ipaambit sa Messenger</BigButton>
        </>
      )}
    </Detail>
  );
}

export function BulletinDetail() {
  const { id } = useParams();
  useSiteTitle('Bulletin');
  const share = useShare();
  return (
    <Detail q={useItem('bulletins', id)} notFound="Wala na kini nga bulletin.">
      {(b) => (
        <>
          <div className="text-[13.5px] text-parish-text2 mb-1">Semana sa {fmtLong(b.week_of)}</div>
          <h1 className={DETAIL_TITLE}>{b.title}</h1>
          <Body text={b.body} />
          <BigButton className={SHARE} onClick={() => share(b.title)}><Icon name="share" />Ipaambit sa Messenger</BigButton>
        </>
      )}
    </Detail>
  );
}

/** An old article link (/pahibalo/artikulo/:id, /komunidad/balita/:id): to its place on Komunidad. */
export function ArticleRedirect() {
  const { id } = useParams();
  return <Navigate to={articlePath(id)} replace />;
}

export function ArticleDetail() {
  const { id } = useParams();
  useSiteTitle('Artikulo');
  const share = useShare();
  return (
    // Desktop: the site's full content width, like the list pages.
    <Detail q={useItem('articles', id)} notFound="Wala na kini nga artikulo." className={`${INNER} lg:max-w-[1240px]`}>
      {(a) => (
        <>
          <div className="flex gap-2 items-center mb-2 flex-wrap">
            <ArticleChip a={a} />
            <span className="text-[13.5px] text-parish-text2">{[`Artikulo #${a.id}`, fmtLong(a.held_on), a.place].filter(Boolean).join(' · ')}</span>
          </div>
          <h1 className={DETAIL_TITLE}>{a.title}</h1>
          {a.author && (
            <div className="-mt-1.5 mb-4 lg:-mt-2.5 lg:mb-6 text-[15px] lg:text-[16px] text-parish-text2">
              Sinulat ni <span className="font-semibold text-parish-ink">{a.author}</span>
            </div>
          )}
          <Photo src={a.photo_url} hLg={560} />
          <Body text={a.body || a.summary} />
          <Gallery photos={a.photos} />
          <BigButton className={SHARE} onClick={() => share(a.title)}><Icon name="share" />Ipaambit sa Messenger</BigButton>
          <Link to={ARTICLES_PAGE} className="block text-center mt-4 min-h-[44px] font-bold text-[15px] text-parish-blue lg:inline-flex lg:items-center lg:ml-5 lg:mt-0">Tanang artikulo</Link>
        </>
      )}
    </Detail>
  );
}

/** An article's photo gallery: a grid of thumbnails; tapping one opens it full screen. */
function Gallery({ photos }) {
  const list = (photos || []).filter((p) => p?.url);
  const [open, setOpen] = useState(null);
  if (!list.length) return null;
  return (
    <section aria-labelledby="gallery-title" className="mt-2 mb-6 lg:mb-8">
      <h2 id="gallery-title" className="m-0 mb-3 font-serif text-[24px] lg:text-[28px] font-bold text-parish-navy">Mga litrato</h2>
      <ul className="list-none m-0 p-0 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 lg:gap-3.5">
        {list.map((p, i) => (
          <li key={p.url}>
            <button type="button" onClick={() => setOpen(i)} className="block w-full text-left appearance-none border-none bg-transparent p-0 cursor-zoom-in">
              <img src={p.url} alt={p.caption || `Litrato ${i + 1}`} loading="lazy" className="w-full aspect-[4/3] object-cover rounded-xl bg-[#efe6d3]" />
              {p.caption && <span className="block mt-1 text-[13px] leading-snug text-parish-text2 line-clamp-2">{p.caption}</span>}
            </button>
          </li>
        ))}
      </ul>
      {open != null && <Lightbox photos={list} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </section>
  );
}

function Lightbox({ photos, index, onIndex, onClose }) {
  const p = photos[index];
  const go = (d) => onIndex((index + d + photos.length) % photos.length);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  const btn = 'w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center text-[22px] border-none cursor-pointer';
  return (
    <div role="dialog" aria-modal="true" aria-label={p.caption || 'Litrato'} className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4" onClick={onClose}>
      <img src={p.url} alt={p.caption || ''} className="max-w-full max-h-[80vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
      {p.caption && <p className="m-0 mt-3 max-w-[760px] text-center text-[15px] leading-normal text-white/90">{p.caption}</p>}
      <div className="mt-4 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {photos.length > 1 && <button type="button" aria-label="Nauna" onClick={() => go(-1)} className={btn}>‹</button>}
        <span className="text-white/70 text-[13px] min-w-[52px] text-center">{index + 1} / {photos.length}</span>
        {photos.length > 1 && <button type="button" aria-label="Sunod" onClick={() => go(1)} className={btn}>›</button>}
        <button type="button" aria-label="Isira" onClick={onClose} className={btn}><Icon name="x" size={20} /></button>
      </div>
    </div>
  );
}

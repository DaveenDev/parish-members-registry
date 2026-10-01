import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BigButton, Card, EmptyNote, ErrorNote, INNER, InfoRow, Skeletons, useShare, useSiteToast } from '../../components/site/kit.jsx';
import { AnnouncementChip, ArticleChip, eventTone } from '../../components/site/cards.jsx';
import { triggerDownload } from '../../lib/csv.js';
import {
  BIS_DAYS, EVENT_ICONS, EVENT_TYPE_LABELS, eventDays, eventIcs, eventSpan, eventTime, fmtLong, fmtShort, paragraphs, parseIso,
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

function Photo({ src, h = 200, hLg = h }) {
  if (!src) return null;
  return <img src={src} alt="" loading="lazy" className="w-full object-cover rounded-[14px] lg:rounded-[18px] mb-4 lg:mb-6 bg-[#efe6d3] h-[var(--h)] lg:h-[var(--h-lg)]" style={{ '--h': `${h}px`, '--h-lg': `${hLg}px` }} />;
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
      className={`${INNER} lg:max-w-[1240px] lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-x-10 lg:items-start lg:[grid-template-areas:'head_side''body_side''body_act']`}
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
            <Card className="px-3.5 py-1 mb-4 shadow-none lg:[grid-area:side] lg:px-5 lg:pt-2 lg:pb-2 lg:mb-3 lg:rounded-[20px] lg:shadow-card">
              <InfoRow icon="cal">{when}{span && <div className="text-[13.5px] font-normal text-parish-text2">{span}</div>}</InfoRow>
              <InfoRow icon="clock" last={!e.location && !e.organizer}>{eventTime(e)}</InfoRow>
              {e.location && <InfoRow icon="pin" last={!e.organizer}>{e.location}</InfoRow>}
              {e.organizer && <InfoRow icon="people" label="Nag-organisar" last>{e.organizer}</InfoRow>}
            </Card>
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

export function ArticleDetail() {
  const { id } = useParams();
  useSiteTitle('Pinakabag-ong Balita');
  const share = useShare();
  return (
    <Detail q={useItem('articles', id)} notFound="Wala na kini nga balita.">
      {(a) => (
        <>
          <div className="flex gap-2 items-center mb-2 flex-wrap">
            <ArticleChip a={a} />
            <span className="text-[13.5px] text-parish-text2">{[fmtShort(a.held_on), a.place].filter(Boolean).join(' · ')}</span>
          </div>
          <h1 className={DETAIL_TITLE}>{a.title}</h1>
          <Photo src={a.photo_url} hLg={380} />
          <Body text={a.body || a.summary} />
          <BigButton className={SHARE} onClick={() => share(a.title)}><Icon name="share" />Ipaambit sa Messenger</BigButton>
          <Link to="/komunidad" className="block text-center mt-4 min-h-[44px] font-bold text-[15px] text-parish-blue lg:inline-flex lg:items-center lg:ml-5 lg:mt-0">Tanang balita</Link>
        </>
      )}
    </Detail>
  );
}

import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BigButton, Card, EmptyNote, ErrorNote, InfoRow, Skeletons, useShare, useSiteToast } from '../../components/site/kit.jsx';
import { AnnouncementChip, ArticleChip, eventTone } from '../../components/site/cards.jsx';
import { triggerDownload } from '../../lib/csv.js';
import {
  BIS_DAYS, EVENT_ICONS, EVENT_TYPE_LABELS, eventDays, eventIcs, eventSpan, eventTime, fmtLong, fmtShort, paragraphs, parseIso,
} from '../../lib/site.js';
import { PARISH_NAME, useSiteTitle } from './SiteLayout.jsx';
import { useItem } from './data.js';

/** Loading / error / not-found around a detail page. */
function Detail({ q, notFound, children }) {
  if (q.loading) return <main className="px-4 pt-[18px]"><Skeletons n={3} h={90} /></main>;
  if (q.error) return <main className="px-4 pt-[18px]"><ErrorNote onRetry={q.reload}>Wala ma-load.</ErrorNote></main>;
  if (!q.data) {
    return (
      <main className="px-4 pt-[18px]">
        <EmptyNote>{notFound}</EmptyNote>
        <BigButton variant="secondary" to="/">Balik sa Home</BigButton>
      </main>
    );
  }
  return <main className="px-4 pt-[18px] pb-7 animate-fadeUp">{children(q.data)}</main>;
}

function Body({ text, className = 'text-[17px] leading-[1.65] text-parish-ink' }) {
  return paragraphs(text).map((p, i) => <p key={i} className={`m-0 mb-3.5 whitespace-pre-line ${className}`}>{p}</p>);
}

function Photo({ src, h = 200 }) {
  if (!src) return null;
  return <img src={src} alt="" loading="lazy" className="w-full object-cover rounded-[14px] mb-4 bg-[#efe6d3]" style={{ height: h }} />;
}

export function EventDetail() {
  const { id } = useParams();
  useSiteTitle('Kalihokan');
  const share = useShare();
  const say = useSiteToast();
  return (
    <Detail q={useItem('events', id)} notFound="Wala na kini nga kalihokan sa kalendaryo.">
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
            <div className="inline-flex items-center gap-1.5 font-bold text-[12px] tracking-[.06em] uppercase rounded-lg px-[9px] py-[5px]" style={{ color: tone.color, background: tone.background }}>
              <Icon name={EVENT_ICONS[e.type] || 'cal'} size={15} />{EVENT_TYPE_LABELS[e.type] || e.type}
            </div>
            <h1 className="font-serif font-semibold text-[32px] leading-[1.08] mt-2.5 mb-4 text-parish-navy">{e.title}</h1>
            <Card className="px-3.5 py-1 mb-4 shadow-none">
              <InfoRow icon="cal">{when}{span && <div className="text-[13.5px] font-normal text-parish-text2">{span}</div>}</InfoRow>
              <InfoRow icon="clock" last={!e.location && !e.organizer}>{eventTime(e)}</InfoRow>
              {e.location && <InfoRow icon="pin" last={!e.organizer}>{e.location}</InfoRow>}
              {e.organizer && <InfoRow icon="people" label="Nag-organisar" last>{e.organizer}</InfoRow>}
            </Card>
            {e.description && <Body text={e.description} className="text-[16px] leading-relaxed text-[#3f3b2f]" />}
            <div className="mt-2 flex flex-col gap-2.5">
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
          <div className="flex gap-2 items-center mb-2"><AnnouncementChip a={a} /><span className="text-[13.5px] text-parish-text2">{fmtShort(a.publish_on)}</span></div>
          <h1 className="font-serif font-semibold text-[31px] leading-[1.1] m-0 mb-3.5 text-parish-navy">{a.title}</h1>
          <Body text={a.body} />
          <BigButton className="mt-2" onClick={() => share(a.title)}><Icon name="share" />Ipaambit sa Messenger</BigButton>
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
          <h1 className="font-serif font-semibold text-[31px] leading-[1.1] m-0 mb-3.5 text-parish-navy">{b.title}</h1>
          <Body text={b.body} />
          <BigButton className="mt-2" onClick={() => share(b.title)}><Icon name="share" />Ipaambit sa Messenger</BigButton>
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
          <h1 className="font-serif font-semibold text-[31px] leading-[1.1] m-0 mb-3.5 text-parish-navy">{a.title}</h1>
          <Photo src={a.photo_url} />
          <Body text={a.body || a.summary} />
          <BigButton className="mt-2" onClick={() => share(a.title)}><Icon name="share" />Ipaambit sa Messenger</BigButton>
          <Link to="/komunidad" className="block text-center mt-4 min-h-[44px] font-bold text-[15px] text-parish-blue">Tanang balita</Link>
        </>
      )}
    </Detail>
  );
}

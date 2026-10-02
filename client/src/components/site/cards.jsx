import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icons.jsx';
import { Chip, TONES } from './kit.jsx';
import { EVENT_TONES } from '../../lib/website.js';
import {
  ANNOUNCEMENT_LABELS, ARTICLE_LABELS, EVENT_ICONS, EVENT_TYPE_LABELS, BIS_MONTHS_SHORT,
  eventSpan, eventTime, excerpt, fmtShort, fmtTime12, massKindLabel, parseIso,
} from '../../lib/site.js';

const ANN_TONES = { Parish: 'blue', GKK: 'gray', Ministry: 'gray', 'Schedule change': 'gold' };

export function AnnouncementChip({ a }) {
  if (a.urgent) return <Chip tone="red">Urgent</Chip>;
  return <Chip tone={ANN_TONES[a.category] || 'blue'}>{ANNOUNCEMENT_LABELS[a.category] || a.category}</Chip>;
}

export function ArticleChip({ a }) {
  return <Chip tone="blue">{ARTICLE_LABELS[a.tag] || a.tag}</Chip>;
}

/** Announcement in a list. `full` adds the excerpt on phones; desktop cards always have it. */
export function AnnouncementCard({ a, full = false }) {
  return (
    <Link to={`/pahibalo/${a.id}`} className="block w-full text-left bg-parish-card border border-parish-border rounded-2xl shadow-cardSm p-3.5 lg:p-[18px] lg:rounded-[18px] transition-colors hover:border-[var(--p-blue-border)]">
      <div className="flex gap-2 items-center mb-1.5 lg:mb-2">
        <AnnouncementChip a={a} />
        <span className="text-[13px] lg:text-[13.5px] text-parish-text2">{fmtShort(a.publish_on)}</span>
      </div>
      <div className={`font-serif font-bold leading-[1.2] lg:leading-[1.18] text-parish-navy lg:text-[23px] lg:mb-1.5 ${full ? 'text-[21px] mb-1' : 'text-[20px]'}`}>{a.title}</div>
      {a.body && <div className={`text-[15px] leading-normal text-[#4d4636] ${full ? '' : 'hidden lg:block'}`}>{excerpt(a.body)}</div>}
    </Link>
  );
}

export function eventTone(e) {
  return TONES[EVENT_TONES[e.type] || 'gray'];
}

export function EventTypeLabel({ e, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-[5px] font-bold text-[11.5px] ${className}`} style={{ color: eventTone(e).color }}>
      <Icon name={EVENT_ICONS[e.type] || 'cal'} size={13} />
      {EVENT_TYPE_LABELS[e.type] || e.type}
    </span>
  );
}

/** Compact row with a date block (Home). `tinted` is for rows on a blue-tint box. */
export function EventRow({ e, tinted = false }) {
  const d = parseIso(e.start_date);
  return (
    <Link
      to={`/misa/kalihokan/${e.id}`}
      className={`w-full text-left flex gap-3 lg:gap-3.5 items-center px-3.5 py-3 lg:px-[18px] lg:py-3.5 border-b last:border-b-0 ${tinted ? 'hover:bg-white/60' : 'border-[#f0e8d6] hover:bg-[#fbf7ef]'}`}
      style={tinted ? { borderColor: 'var(--p-blue-border)' } : undefined}
    >
      <div className="w-12 lg:w-[52px] flex-none text-center">
        <div className="font-bold text-[11px] lg:text-[11.5px] tracking-[.1em] uppercase text-parish-text2">{BIS_MONTHS_SHORT[d.getMonth()]}</div>
        <div className="font-serif text-[28px] lg:text-[32px] font-bold leading-none text-parish-blue">{d.getDate()}</div>
      </div>
      <div className="flex-1 min-w-0">
        <EventTypeLabel e={e} className="mb-0.5 lg:text-[12px]" />
        <div className="font-semibold text-[15px] lg:text-[16px] leading-[1.3]">{e.title}</div>
      </div>
    </Link>
  );
}

/** Card in the agenda list, with a span bar for multi-day events. */
export function EventCard({ e, showDate = false }) {
  const tone = eventTone(e);
  const span = eventSpan(e);
  return (
    <Link to={`/misa/kalihokan/${e.id}`} className="w-full text-left flex gap-3 bg-parish-card border border-parish-border rounded-[14px] p-3 shadow-cardSm">
      <div className="w-10 h-10 flex-none rounded-xl flex items-center justify-center" style={{ background: tone.background, color: tone.color }}>
        <Icon name={EVENT_ICONS[e.type] || 'cal'} size={21} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-[11.5px] tracking-[.06em] uppercase" style={{ color: tone.color }}>{EVENT_TYPE_LABELS[e.type] || e.type}</div>
        <div className="font-semibold text-[15.5px] leading-[1.3] mt-px mb-[3px]">{e.title}</div>
        {showDate && <div className="text-[13.5px] font-semibold text-parish-navy">{fmtShort(e.start_date)}{e.end_date && e.end_date !== e.start_date ? ` – ${fmtShort(e.end_date)}` : ''}</div>}
        <div className="text-[13.5px] text-parish-text2">{[eventTime(e), e.location].filter(Boolean).join(' · ')}</div>
        {span && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full opacity-70" style={{ background: tone.color }} />
            <span className="font-bold text-[12px] whitespace-nowrap" style={{ color: tone.color }}>{span}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

/**
 * A schedule row: time, what, where, language. `compact` is the Home card
 * row; the full row stacks on desktop, where it sits in a narrow day column
 * (time and language on top, the rest underneath). In the schedule's
 * sections `heading` replaces the type where the section already says it
 * (the days of a Daily Mass, or the place), and `when` adds the day or date.
 */
export function MassRow({ m, compact = false, heading, when = '' }) {
  const title = heading || massKindLabel(m);
  return (
    <div
      className={compact
        ? 'flex items-center gap-3 lg:gap-4 p-2.5 lg:px-3.5 lg:py-3 rounded-xl lg:rounded-[14px] border-[1.5px]'
        : 'flex items-center gap-3 px-3.5 py-[11px] border-t border-[#f4eddd] lg:grid lg:grid-cols-[1fr_auto] lg:gap-x-2 lg:gap-y-0 lg:px-4'}
      style={m.next ? { background: 'var(--p-blue-tint)', borderColor: compact ? 'var(--p-blue-border)' : undefined } : { borderColor: compact ? 'transparent' : undefined }}
    >
      <div className={`font-serif font-bold text-parish-blue ${compact ? 'text-[24px] min-w-[86px] lg:text-[30px] lg:min-w-[112px]' : 'text-[22px] min-w-[82px] lg:text-[23px] lg:min-w-0'}`}>{fmtTime12(m.start_time)}</div>
      <div className={`flex-1 min-w-0 ${compact ? '' : 'lg:col-span-2 lg:row-start-2'}`}>
        <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap">
          <span className={`font-semibold text-[15px] ${compact ? 'lg:text-[16.5px]' : 'lg:text-[14.5px]'}`}>{title}</span>
          {m.next && <span className="font-bold text-[10.5px] tracking-[.12em] text-white bg-parish-blue rounded-md px-1.5 py-0.5">SUNOD</span>}
        </div>
        {when && <div className="text-[13.5px] font-semibold text-parish-navy">{when}</div>}
        {title !== m.location && <div className={`text-[13.5px] text-parish-text2 ${compact ? 'lg:text-[14.5px]' : ''}`}>{compact ? `${m.location} · ${m.language}` : m.location}</div>}
        {m.notes && m.kind !== 'Other' && <div className="text-[13px] text-parish-text2 italic">{m.notes}</div>}
      </div>
      {!compact && (
        <span className="font-bold text-[11.5px] lg:text-[11px] rounded-md px-[7px] lg:px-1.5 py-[3px] lg:py-0.5 border border-parish-borderSoft text-[#4d4636] bg-parish-bg lg:col-start-2 lg:row-start-1 lg:justify-self-end">{m.language}</span>
      )}
    </div>
  );
}

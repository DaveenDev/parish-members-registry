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

/** Announcement in a list. `full` adds the excerpt. */
export function AnnouncementCard({ a, full = false }) {
  return (
    <Link to={`/pahibalo/${a.id}`} className="block w-full text-left bg-parish-card border border-parish-border rounded-2xl shadow-cardSm p-3.5">
      <div className="flex gap-2 items-center mb-1.5">
        <AnnouncementChip a={a} />
        <span className="text-[13px] text-parish-text2">{fmtShort(a.publish_on)}</span>
      </div>
      <div className={`font-serif font-bold leading-[1.2] text-parish-navy ${full ? 'text-[21px] mb-1' : 'text-[20px]'}`}>{a.title}</div>
      {full && a.body && <div className="text-[15px] leading-normal text-[#4d4636]">{excerpt(a.body)}</div>}
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

/** Compact row with a date block (Home). */
export function EventRow({ e }) {
  const d = parseIso(e.start_date);
  return (
    <Link to={`/misa/kalihokan/${e.id}`} className="w-full text-left flex gap-3 items-center px-3.5 py-3 border-b border-[#f0e8d6] last:border-b-0">
      <div className="w-12 flex-none text-center">
        <div className="font-bold text-[11px] tracking-[.1em] uppercase text-parish-text2">{BIS_MONTHS_SHORT[d.getMonth()]}</div>
        <div className="font-serif text-[28px] font-bold leading-none text-parish-blue">{d.getDate()}</div>
      </div>
      <div className="flex-1 min-w-0">
        <EventTypeLabel e={e} className="mb-0.5" />
        <div className="font-semibold text-[15px] leading-[1.3]">{e.title}</div>
      </div>
    </Link>
  );
}

/** Card in the agenda list, with a span bar for multi-day events. */
export function EventCard({ e }) {
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

/** A schedule row: time, what, where, language. */
export function MassRow({ m, compact = false }) {
  return (
    <div
      className={`flex items-center gap-3 ${compact ? 'p-2.5 rounded-xl border-[1.5px]' : 'px-3.5 py-[11px] border-t border-[#f4eddd]'}`}
      style={m.next ? { background: 'var(--p-blue-tint)', borderColor: compact ? 'var(--p-blue-border)' : undefined } : { borderColor: compact ? 'transparent' : undefined }}
    >
      <div className={`font-serif font-bold text-parish-blue ${compact ? 'text-[24px] min-w-[86px]' : 'text-[22px] min-w-[82px]'}`}>{fmtTime12(m.start_time)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-[15px]">{massKindLabel(m)}</span>
          {m.next && <span className="font-bold text-[10.5px] tracking-[.12em] text-white bg-parish-blue rounded-md px-1.5 py-0.5">SUNOD</span>}
        </div>
        <div className="text-[13.5px] text-parish-text2">{compact ? `${m.location} · ${m.language}` : m.location}</div>
        {m.notes && m.kind !== 'Other' && <div className="text-[13px] text-parish-text2 italic">{m.notes}</div>}
      </div>
      {!compact && (
        <span className="font-bold text-[11.5px] rounded-md px-[7px] py-[3px] border border-parish-borderSoft text-[#4d4636] bg-parish-bg">{m.language}</span>
      )}
    </div>
  );
}

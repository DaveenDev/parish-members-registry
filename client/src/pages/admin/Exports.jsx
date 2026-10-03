import React from 'react';
import { PageHeader, PageBody, Panel } from '../../components/admin.jsx';
import { useCsvExport } from '../../hooks.js';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';

const ICONS = {
  people: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>,
  house: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  group: <><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M2 20c0-3 3-5 6-5s6 2 6 5M10 20c0-3 3-5 6-5s6 2 6 5" /></>,
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};

// Every export: which group it sits in, what it needs (lib/access.js), and its file.
const EXPORTS = [
  { group: 'Registry', path: '/exports/members.csv', file: 'members.csv', icon: 'people', tone: 'blue', title: 'Members', desc: 'Every member record with personal details, sacraments, ministries and census status.' },
  { group: 'Registry', path: '/exports/households.csv', file: 'households.csv', icon: 'house', tone: 'gold', title: 'Households', desc: 'Household directory with address, GKK, grouping, status and the participation survey.' },
  { group: 'Registry', path: '/exports/rosters.csv', file: 'ministry-rosters.csv', icon: 'group', tone: 'green', title: 'Ministry & organization rosters', desc: 'One row per member per ministry or organization, sorted by group.' },
  { group: 'Registry', path: '/exports/blood.csv', file: 'blood-directory.csv', icon: 'drop', tone: 'red', title: 'Blood type directory', desc: 'Current members with a blood type on file, with GKK and contact number.' },
  { group: 'Requests', need: 'requests', path: '/exports/certificates.csv', file: 'certificate-requests.csv', icon: 'doc', tone: 'blue', title: 'Certificate requests', desc: 'Every request with its status, fee and OR number, and when it was released.' },
  { group: 'Requests', need: 'requests', path: '/exports/donors.csv', file: 'blood-donors.csv', icon: 'drop', tone: 'red', title: 'Blood donors', desc: 'People who agreed to be contacted for blood, with their last donation.' },
  { group: 'Records', need: 'activity', path: '/exports/activity.csv', file: 'activity-log.csv', icon: 'clock', tone: 'green', title: 'Activity log', desc: 'Every recorded change to households, members and sacrament verifications.' },
];

const TONES = {
  blue: { bg: 'var(--p-blue-tint)', fg: 'var(--p-blue)', btn: 'var(--p-fill)' },
  gold: { bg: 'var(--p-gold-tint)', fg: 'var(--p-gold-deep)', btn: 'var(--p-gold-deep)' },
  green: { bg: 'rgb(var(--c-ok-bg))', fg: 'rgb(var(--c-ok-text))', btn: '#2f7a52' },
  red: { bg: 'rgb(var(--c-error-bg))', fg: 'rgb(var(--c-error))', btn: '#a13d29' },
};

function ExportCard({ item, busy, disabled, onExport }) {
  const t = TONES[item.tone];
  return (
    <Panel className="p-[22px] flex flex-col">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3.5" style={{ background: t.bg, color: t.fg }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>{ICONS[item.icon]}</svg>
      </div>
      <div className="font-serif text-[20px] font-semibold text-parish-navy mb-1">{item.title}</div>
      <div className="text-[13px] text-parish-muted mb-4 flex-1">{item.desc}</div>
      <button onClick={onExport} disabled={disabled} className="w-full appearance-none border-none cursor-pointer py-2.5 font-semibold text-[14px] text-white rounded-xl disabled:opacity-60" style={{ background: t.btn }}>
        {busy ? 'Exporting…' : 'Export CSV'}
      </button>
    </Panel>
  );
}

export default function Exports() {
  const csvExport = useCsvExport();
  const { user } = useAuth();
  const shown = EXPORTS.filter((e) => !e.need || can(user, e.need));
  const groups = [...new Set(shown.map((e) => e.group))];
  return (
    <>
      <PageHeader title="Exports" subtitle="Download registry data as CSV" />
      <PageBody>
        <div className="max-w-[980px]">
          {groups.map((g) => (
            <section key={g} className="mb-6" aria-label={g}>
              <h2 className="font-bold text-[11.5px] tracking-[.12em] uppercase text-[var(--p-gold-deep)] m-0 mb-2.5">{g}</h2>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(230px,100%),1fr))' }}>
                {shown.filter((e) => e.group === g).map((e) => (
                  <ExportCard key={e.path} item={e} busy={csvExport.busy === e.path} disabled={!!csvExport.busy} onExport={() => csvExport.run(e.path, e.file)} />
                ))}
              </div>
            </section>
          ))}
          <div className="bg-[var(--p-blue-tint)] border border-parish-infoBorder rounded-xl px-[18px] py-4 text-[13.5px] text-parish-info leading-relaxed">
            CSV files open directly in Microsoft Excel and Google Sheets. Filtered lists can be exported from the Households and Members pages
            (Export this view), and census results from Census → Results. Exported data is handled discreetly — share only with authorized parish personnel.
          </div>
        </div>
      </PageBody>
    </>
  );
}

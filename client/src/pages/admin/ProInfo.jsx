import React, { useEffect, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { useToast } from '../../ToastContext.jsx';
import { PageHeader, PageBody, Panel } from '../../components/admin.jsx';
import { Checkbox } from '../../components/ui.jsx';
import ModuleShot from '../../components/promo/ModuleShot.jsx';
import { ALL_TIPS_KEY, HIDE_ALL_DAYS, MODULES, PRO_DEMO_URL, PRO_URL, askMailto, isHidden, missingModules } from '../../lib/proPromo.js';
import { PRO_UPDATES_UNTIL, ownedModules } from '../../lib/proModules.js';
import { PRO_VERSION } from '../../lib/appVersion.js';
import { hideFor, useDismissals } from '../../lib/proStore.js';

const LINK = 'font-bold text-parish-blue hover:underline';
const HOW = [
  'Your registry stays free and keeps every feature. PRO adds to it; it never takes anything away.',
  'PRO is a separate license for each parish.',
  'The parish keeps its own accounts and its own data.',
  'One update adds PRO, with nothing to set up again.',
];

/** The in-app PRO page: what each module does, how PRO works, and how to ask. For a PRO parish, what it has. */
export default function ProInfo() {
  const { user } = useAuth();
  const toast = useToast();
  const { hash } = useLocation();
  const parish = useOutletContext()?.parish;
  const d = useDismissals(user);
  const [ticked, setTicked] = useState([]);
  const isPro = !!PRO_VERSION || ownedModules.length > 0;
  const mine = MODULES.filter((m) => ownedModules.includes(m.id));
  const modules = isPro ? missingModules(ownedModules) : MODULES;
  const tipsOff = isHidden(d.map, ALL_TIPS_KEY, Date.now());

  // A tip card links to its module (/admin/pro#registers).
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  const toggle = (id) => setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  const turnOffTips = () => {
    hideFor(user, ALL_TIPS_KEY, HIDE_ALL_DAYS);
    toast.success('PRO tips are off for your account for 90 days.');
  };

  return (
    <>
      <PageHeader title="PRO modules" subtitle="Optional additions to your registry, made by DaveenDev" />
      <PageBody>
        <div className="max-w-[860px] mx-auto flex flex-col gap-5">
          {isPro && (
            <Panel className="p-5">
              <div className="font-serif text-[20px] font-semibold text-parish-navy">Your PRO license</div>
              <p className="m-0 mt-1 text-[14px] text-parish-text2">
                {PRO_VERSION ? `PRO ${PRO_VERSION}. ` : ''}
                {mine.length ? <>Modules you have: <strong>{mine.map((m) => m.name).join(', ')}</strong>.</> : 'PRO is installed.'}
                {PRO_UPDATES_UNTIL ? <> Updates until <strong>{PRO_UPDATES_UNTIL}</strong>.</> : null}
              </p>
              {modules.length > 0 && <p className="m-0 mt-2 text-[13.5px] text-parish-muted">You could still add {modules.map((m) => m.name).join(', ')}.</p>}
            </Panel>
          )}

          {modules.map((m) => (
            <Panel key={m.id} id={m.id} className="p-5 scroll-mt-24">
              <div className="grid grid-cols-1 sm:grid-cols-[240px_1fr] gap-4 items-start">
                <ModuleShot module={m} />
                <div className="min-w-0">
                  <div className="text-[11px] font-bold tracking-[.12em] uppercase text-parish-muted">Module {m.no}</div>
                  <h2 className="font-serif text-[22px] font-semibold text-parish-navy m-0 leading-tight">{m.name}</h2>
                  <p className="m-0 mt-1.5 text-[14px] text-parish-text2 leading-relaxed">{m.text}</p>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
                    <a href={PRO_DEMO_URL} target="_blank" rel="noopener noreferrer" className={`${LINK} text-[13.5px]`}>Try it on the PRO demo</a>
                    <label className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-parish-text2 cursor-pointer">
                      <Checkbox checked={ticked.includes(m.id)} onChange={() => toggle(m.id)} aria-label={`I am interested in ${m.name}`} />
                      I’m interested
                    </label>
                  </div>
                </div>
              </div>
            </Panel>
          ))}

          <Panel className="p-5">
            <h2 className="font-serif text-[20px] font-semibold text-parish-navy m-0">How it works</h2>
            <ul className="m-0 mt-2 pl-5 text-[14px] text-parish-text2 leading-relaxed">
              {HOW.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </Panel>

          {!isPro && (
            <Panel className="p-5">
              <h2 className="font-serif text-[20px] font-semibold text-parish-navy m-0">Ask about PRO</h2>
              <p className="m-0 mt-1 text-[14px] text-parish-text2 leading-relaxed">
                Tick the modules you’re interested in above, then write to the developer. The email already has your parish’s name and your ticks in it. Prices and the founding offer are on <a className={LINK} href={PRO_URL} target="_blank" rel="noopener noreferrer">daveendev.vercel.app/pro</a>.
              </p>
              <a
                href={askMailto(parish?.name, ticked)}
                className="no-underline inline-flex mt-3 px-4 py-2.5 rounded-xl bg-parish-fill text-white font-bold text-[14px] shadow-btn focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parish-blue"
              >Ask about PRO</a>
            </Panel>
          )}

          <div className="text-[13px] text-parish-muted">
            {tipsOff ? 'PRO tips are off for your account.' : (
              <button type="button" onClick={turnOffTips} className="appearance-none border-none bg-transparent p-0 cursor-pointer font-semibold text-parish-muted underline hover:text-parish-ink">Don’t show PRO tips</button>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}

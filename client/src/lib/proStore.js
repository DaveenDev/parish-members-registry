// What the PRO notes remember, in the browser and (for staff accounts) in
// staff_dismissals (0124), so hiding follows the account to the phone.
//  - Hidden-until times: the database for a signed-in staff account; the
//    browser's localStorage for the shared Demo login (everyone trying the
//    demo shares it) and wherever the database can't be reached or 0124
//    isn't run yet. A save that failed is tried again on the next load.
//  - Shown this session, 3 a day, and when each card last showed: only in
//    this browser. Nothing about them is sent anywhere.
// Every browser-storage call is wrapped: private windows can block it.
import { useEffect, useState } from 'react';
import { api } from '../api.js';

const read = (store, key, fallback) => {
  try { const v = JSON.parse(store.getItem(key)); return v ?? fallback; } catch { return fallback; }
};
const write = (store, key, value) => {
  try { store.setItem(key, JSON.stringify(value)); } catch { /* blocked: this browser forgets it */ }
};
const local = () => { try { return window.localStorage; } catch { return null; } };
const session = () => { try { return window.sessionStorage; } catch { return null; } };
const get = (store, key, fallback) => (store ? read(store, key, fallback) : fallback);
const put = (store, key, value) => { if (store) write(store, key, value); };

const hiddenKey = (who) => `pmr_pro_hidden:${who}`;
const whoOf = (user) => (user?.isDemo ? 'demo' : user?.id || 'anon');

// One load per account, shared by the card and the showcase.
let current = { who: null, map: {}, ready: false, promise: null };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

async function load(user) {
  const who = whoOf(user);
  const mine = get(local(), hiddenKey(who), {});
  current = { who, map: mine, ready: false, promise: null };
  if (user?.isDemo || !user?.id) {
    current = { ...current, ready: true };
    emit();
    return;
  }
  try {
    const db = await api.listDismissals();
    if (current.who !== who) return;
    // What failed to save earlier is saved now; the later time wins.
    const merged = { ...db };
    Object.entries(mine).forEach(([k, until]) => {
      if (until > (db[k] || 0)) {
        merged[k] = until;
        api.saveDismissal(k, until).catch(() => {});
      }
    });
    current = { ...current, map: merged, ready: true };
    put(local(), hiddenKey(who), merged);
  } catch {
    // Offline, or 0124 isn't run: this browser's copy is used.
    if (current.who === who) current = { ...current, ready: true };
  }
  emit();
}

/** Hide `key` for `days` for this account. Updates every card at once; saving happens in the background. */
export function hideFor(user, key, days) {
  const until = Date.now() + days * 86400000;
  const who = whoOf(user);
  if (current.who === who) current = { ...current, map: { ...current.map, [key]: until } };
  put(local(), hiddenKey(who), { ...get(local(), hiddenKey(who), {}), [key]: until });
  emit();
  if (!user?.isDemo && user?.id) api.saveDismissal(key, until).catch(() => { /* retried on the next load */ });
}

/** { map, ready } of this account's hidden-until times. */
export function useDismissals(user) {
  const [, tick] = useState(0);
  const who = whoOf(user);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    if (current.who !== who) load(user);
    return () => { listeners.delete(l); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who]);
  return current.who === who ? { map: current.map, ready: current.ready } : { map: {}, ready: false };
}

// Shown this session / today / last time. Keyed by account so a shared computer keeps them apart.
const day = () => new Date().toISOString().slice(0, 10);

export function readShown(user) {
  const who = whoOf(user);
  const perDay = get(local(), `pmr_pro_day:${who}`, null);
  return {
    shownPages: get(session(), `pmr_pro_pages:${who}`, []),
    shownToday: perDay?.day === day() ? perDay.n : 0,
    lastShown: get(local(), `pmr_pro_last:${who}`, {}),
    showcaseShown: !!get(session(), `pmr_pro_showcase:${who}`, false),
  };
}

export function markTipShown(user, pageKey, tipId) {
  const who = whoOf(user);
  put(session(), `pmr_pro_pages:${who}`, [...new Set([...get(session(), `pmr_pro_pages:${who}`, []), pageKey])]);
  const perDay = get(local(), `pmr_pro_day:${who}`, null);
  put(local(), `pmr_pro_day:${who}`, { day: day(), n: (perDay?.day === day() ? perDay.n : 0) + 1 });
  put(local(), `pmr_pro_last:${who}`, { ...get(local(), `pmr_pro_last:${who}`, {}), [tipId]: Date.now() });
}

/** A page whose card was held back (a dialog was open): it doesn't come back on that page this session. */
export function markPageSkipped(user, pageKey) {
  const who = whoOf(user);
  put(session(), `pmr_pro_pages:${who}`, [...new Set([...get(session(), `pmr_pro_pages:${who}`, []), pageKey])]);
}

export function markShowcaseShown(user) {
  put(session(), `pmr_pro_showcase:${whoOf(user)}`, true);
}

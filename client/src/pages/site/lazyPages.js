import React from 'react';

// The website's pages other than Home, each loaded when it's first opened, so
// a visitor's first page on mobile data comes without the code for all the
// others. SiteLayout shows its header and footer around a blank space while
// one loads, and once Home is up fetches the rest while the phone is idle
// (not with Data Saver on), so going to them is quick.
const loaders = {
  simbahan: () => import('./Simbahan.jsx'),
  pagbasa: () => import('./Pagbasa.jsx'),
  kasaysayan: () => import('./Kasaysayan.jsx'),
  pahibalo: () => import('./Pahibalo.jsx'),
  komunidad: () => import('./Komunidad.jsx'),
  articles: () => import('./Articles.jsx'),
  serbisyo: () => import('./Serbisyo.jsx'),
  checkStatus: () => import('./CheckStatus.jsx'),
  requestForm: () => import('./RequestForm.jsx'),
  downloads: () => import('./Downloads.jsx'),
  details: () => import('./Details.jsx'),
  notFound: () => import('./NotFound.jsx'),
  developer: () => import('./Developer.jsx'),
};

/** A page component from `loader`'s module: its default export, or `name`. */
const page = (loader, name = 'default') => React.lazy(() => loader().then((m) => ({ default: m[name] })));

export const Simbahan = page(loaders.simbahan);
export const Pagbasa = page(loaders.pagbasa);
export const Kasaysayan = page(loaders.kasaysayan);
export const Pahibalo = page(loaders.pahibalo);
export const Komunidad = page(loaders.komunidad);
export const GkkDetail = page(loaders.komunidad, 'GkkDetail');
export const ArticlesArchive = page(loaders.articles, 'ArticlesArchive');
export const Serbisyo = page(loaders.serbisyo);
export const Kontak = page(loaders.serbisyo, 'Kontak');
export const Blood = page(loaders.serbisyo, 'Blood');
export const CheckStatus = page(loaders.checkStatus);
export const RequestForm = page(loaders.requestForm);
export const Downloads = page(loaders.downloads);
export const SongPage = page(loaders.downloads, 'SongPage');
export const EventDetail = page(loaders.details, 'EventDetail');
export const AnnouncementDetail = page(loaders.details, 'AnnouncementDetail');
export const BulletinDetail = page(loaders.details, 'BulletinDetail');
export const ArticleDetail = page(loaders.details, 'ArticleDetail');
export const ArticleRedirect = page(loaders.details, 'ArticleRedirect');
export const SiteNotFound = page(loaders.notFound);
export const Developer = page(loaders.developer);

/** Fetch every page's code ahead, quietly; a failure just loads it when opened. */
export function preloadSitePages() {
  if (typeof navigator !== 'undefined' && navigator.connection?.saveData) return;
  for (const load of Object.values(loaders)) load().catch(() => {});
}

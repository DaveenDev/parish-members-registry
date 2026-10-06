import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { Band, DataState, Eyebrow, PageHeader, Pills, Skeleton, WRAP } from '../../components/site/kit.jsx';
import { ArticleCard, ArticleFeature } from '../../components/site/cards.jsx';
import { ARTICLES_PAGE, articleYears, articlesInYear } from '../../lib/site.js';
import { useSiteTitle } from './SiteLayout.jsx';
import { listState, useArticles } from './data.js';

// Values match the articles_tag_check constraint (0021).
const ARTICLE_TAG_FILTERS = [['all', 'Tanan'], ['History', 'Kasaysayan'], ['Parish', 'Parokya'], ['GKK', 'GKK'], ['Ministry', 'Ministry']];
// Komunidad shows the newest few; the rest are on the articles page.
const LATEST = 4;
const ARCHIVE_STEP = 12;

const MORE_BUTTON = 'w-full lg:w-auto min-h-[46px] px-5 rounded-[12px] border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blueDeep font-bold text-[15px] hover:bg-[var(--p-blue-tint)] inline-flex items-center justify-center gap-1.5';

/**
 * Mga Artikulo on Komunidad, on the page's own cream under its blue header:
 * the newest article wide, then the next three across, and a link to every
 * article on the articles page.
 */
export default function ArticlesSection() {
  const q = listState(useArticles());
  const [first, ...rest] = q.rows;
  const shown = rest.slice(0, LATEST - 1);

  return (
    <section id="artikulo" aria-labelledby="articles-title" className="py-7 lg:py-12">
      <div className={WRAP}>
        <div className="flex items-end justify-between gap-x-6 gap-y-3 flex-wrap mb-4 lg:mb-6">
          <div className="min-w-0">
            <Eyebrow>Mga istorya sa parokya</Eyebrow>
            <h2 id="articles-title" className="m-0 font-serif text-[28px] lg:text-[36px] font-bold text-parish-navy leading-tight">Mga Artikulo</h2>
            <p className="m-0 mt-0.5 text-[15px] lg:text-[16px] leading-normal text-[#4d4636]">Kasaysayan sa parokya ug mga kalihokan nga nahitabo.</p>
          </div>
          {q.rows.length > 0 && (
            <Link to={ARTICLES_PAGE} className="hidden lg:inline-flex items-center gap-1 font-bold text-[15px] text-parish-blue hover:underline">
              Tanang artikulo ({q.rows.length})<Icon name="chev" size={16} />
            </Link>
          )}
        </div>
        <DataState
          state={q}
          skeleton={<><Skeleton h={260} className="rounded-[20px]" /><div className="hidden lg:grid grid-cols-3 gap-4 mt-5">{[0, 1, 2].map((i) => <Skeleton key={i} h={300} alt={i === 1} className="rounded-[18px]" />)}</div></>}
          errorText="Wala ma-load ang mga artikulo."
          empty={q.empty}
          emptyText="Wala pay artikulo nga gi-publish. Balik lang sunod."
        >
          {first && <ArticleFeature a={first} />}
          {shown.length > 0 && (
            <div className="mt-3 lg:mt-5 flex flex-col gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4 sm:items-start">
              {shown.map((a) => <ArticleCard key={a.id} a={a} />)}
            </div>
          )}
          {q.rows.length > 0 && (
            <div className="mt-4 lg:mt-6 flex items-center gap-3 flex-wrap">
              <Link to={ARTICLES_PAGE} className={MORE_BUTTON}>Tan-awa ang tanang artikulo ({q.rows.length})<Icon name="chev" size={16} /></Link>
            </div>
          )}
        </DataState>
      </div>
    </section>
  );
}

/**
 * Every article, newest first, with the years on the right (a row of year
 * buttons on phones), like a blog's archive. ?year= and ?tag= narrow the list.
 */
export function ArticlesArchive() {
  useSiteTitle('Mga Artikulo');
  const q = listState(useArticles());
  const [params, setParams] = useSearchParams();
  const [count, setCount] = useState(ARCHIVE_STEP);
  const years = articleYears(q.rows);
  const year = years.some((y) => y.year === params.get('year')) ? params.get('year') : '';
  const inYear = articlesInYear(q.rows, year);
  const tags = new Set(inYear.map((a) => a.tag));
  const filters = tags.size >= 2 ? ARTICLE_TAG_FILTERS.filter(([v]) => v === 'all' || tags.has(v)) : null;
  const tag = filters && filters.some(([v]) => v === params.get('tag')) ? params.get('tag') : 'all';
  const list = inYear.filter((a) => tag === 'all' || a.tag === tag);
  const shown = list.slice(0, count);

  const go = (next) => {
    const p = { year, tag: tag === 'all' ? '' : tag, ...next };
    setParams(Object.fromEntries(Object.entries(p).filter(([, v]) => v)), { replace: true });
    setCount(ARCHIVE_STEP);
  };

  const yearLink = (y, label, n) => {
    const on = y === year;
    return (
      <button
        key={y || 'all'} type="button" aria-current={on ? 'true' : undefined} onClick={() => go({ year: y, tag: '' })}
        className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left text-[15px] border-none cursor-pointer ${on ? 'bg-parish-fill text-white font-bold' : 'bg-transparent text-parish-ink hover:bg-[var(--p-blue-tint)]'}`}
      >
        <span>{label}</span>
        <span className={`text-[13px] font-semibold ${on ? 'text-white/85' : 'text-parish-text2'}`}>{n}</span>
      </button>
    );
  };

  return (
    <main className="animate-fadeUp">
      <Band as="div">
        <div className={`${WRAP} pt-4 lg:pt-9 flow-root`}>
          <PageHeader eyebrow="Mga istorya sa parokya" title="Mga Artikulo" />
        </div>
      </Band>

      <section className={`${WRAP} py-7 lg:py-12`} aria-label="Tanang artikulo">
        <DataState
          state={q}
          skeleton={<div className="lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-8"><div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={300} alt={i % 2 === 1} className="rounded-[18px]" />)}</div><Skeleton h={220} className="hidden lg:block rounded-[18px]" /></div>}
          errorText="Wala ma-load ang mga artikulo."
          empty={q.empty}
          emptyText="Wala pay artikulo nga gi-publish. Balik lang sunod."
        >
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-8 lg:items-start">
            <div className="min-w-0">
              {/* Phones and tablets: the years as a row of buttons on top. */}
              {years.length > 1 && (
                <Pills
                  scroll className="mb-3 lg:hidden"
                  options={[['', 'Tanan'], ...years.map((y) => [y.year, y.year])]}
                  value={year} onChange={(y) => go({ year: y, tag: '' })}
                />
              )}
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3 lg:mb-4">
                <h2 className="m-0 font-serif text-[24px] lg:text-[30px] font-bold text-parish-navy">
                  {year || 'Tanang tuig'} <span className="font-sans text-[15px] font-semibold text-parish-text2">· {list.length} ka artikulo</span>
                </h2>
                {filters && <Pills scroll options={filters} value={tag} onChange={(v) => go({ tag: v === 'all' ? '' : v })} />}
              </div>
              {!list.length ? (
                <div className="bg-parish-card border border-dashed border-[#d9cdb4] rounded-2xl p-6 text-center text-[15px] text-[#4d4636]">Walay artikulo niini nga pili.</div>
              ) : (
                <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-4 sm:items-start">
                  {shown.map((a) => <ArticleCard key={a.id} a={a} />)}
                </div>
              )}
              {list.length > count && (
                <div className="mt-4 lg:mt-6 flex items-center gap-3 flex-wrap">
                  <button type="button" onClick={() => setCount((c) => c + ARCHIVE_STEP)} className={MORE_BUTTON}>
                    Tan-awa pa ang {Math.min(ARCHIVE_STEP, list.length - count)}
                  </button>
                  <span className="text-[13.5px] text-parish-text2">Gipakita ang {shown.length} sa {list.length}</span>
                </div>
              )}
            </div>

            {/* Desktop: the years down the right, staying in view. */}
            <nav aria-label="Mga tuig" className="hidden lg:block lg:sticky lg:top-24 bg-parish-card border border-parish-border rounded-[18px] shadow-cardSm p-3">
              <div className="px-2 pt-1 pb-2 font-bold text-[11.5px] tracking-[.14em] uppercase text-[var(--p-eyebrow)]">Mga tuig</div>
              {yearLink('', 'Tanan', q.rows.length)}
              {years.map((y) => yearLink(y.year, y.year, y.count))}
            </nav>
          </div>
        </DataState>
      </section>
    </main>
  );
}

import React, { useState } from 'react';
import { DataState, Eyebrow, FOOTER_CREAM, Pills, Skeleton, WRAP } from '../../components/site/kit.jsx';
import { ArticleCard, ArticleFeature } from '../../components/site/cards.jsx';
import { listState, useArticles } from './data.js';

// Values match the articles_tag_check constraint (0021).
const ARTICLE_TAG_FILTERS = [['all', 'Tanan'], ['History', 'Kasaysayan'], ['Parish', 'Parokya'], ['GKK', 'GKK'], ['Ministry', 'Ministry']];
const ARTICLES_STEP = 6;

/**
 * Mga Artikulo, Komunidad's main tab, on a full-width cream band (the footer's color) under the
 * page's blue header: the newest article wide, then the rest three across,
 * six more at a time. Tag filters show once articles use two or more tags.
 */
export default function ArticlesSection() {
  const q = listState(useArticles());
  const [tag, setTag] = useState('all');
  const [count, setCount] = useState(ARTICLES_STEP);

  const tags = new Set(q.rows.map((a) => a.tag));
  const filters = tags.size >= 2 ? ARTICLE_TAG_FILTERS.filter(([v]) => v === 'all' || tags.has(v)) : null;
  const list = q.rows.filter((a) => !filters || tag === 'all' || a.tag === tag);
  const [first, ...rest] = list;
  const shown = rest.slice(0, count);
  const pickTag = (v) => { setTag(v); setCount(ARTICLES_STEP); };

  return (
    <section
      id="artikulo" aria-labelledby="articles-title"
      className="py-7 lg:py-12 border-b"
      style={FOOTER_CREAM}
    >
      <div className={WRAP}>
        <div className="flex items-end justify-between gap-x-6 gap-y-3 flex-wrap mb-4 lg:mb-6">
          <div className="min-w-0">
            <Eyebrow>Mga istorya sa parokya</Eyebrow>
            <h2 id="articles-title" className="m-0 font-serif text-[28px] lg:text-[36px] font-bold text-parish-navy leading-tight">Mga Artikulo</h2>
            <p className="m-0 mt-0.5 text-[15px] lg:text-[16px] leading-normal text-[#4d4636]">Kasaysayan sa parokya ug mga kalihokan nga nahitabo.</p>
          </div>
          {filters && <Pills scroll options={filters} value={tag} onChange={pickTag} />}
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
            <div className="mt-3 lg:mt-5 flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-4 lg:items-start">
              {shown.map((a) => <ArticleCard key={a.id} a={a} />)}
            </div>
          )}
          {rest.length > count && (
            <div className="mt-4 lg:mt-6 flex items-center gap-3 flex-wrap">
              <button type="button" onClick={() => setCount((c) => c + ARTICLES_STEP)} className="w-full lg:w-auto min-h-[46px] px-5 rounded-[12px] border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blueDeep font-bold text-[15px] hover:bg-[var(--p-blue-tint)]">
                Tan-awa pa ang {Math.min(ARTICLES_STEP, rest.length - count)}
              </button>
              <span className="text-[13.5px] text-parish-text2">Gipakita ang {1 + shown.length} sa {list.length}</span>
            </div>
          )}
        </DataState>
      </div>
    </section>
  );
}

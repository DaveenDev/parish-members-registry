import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BAND_PAD, Band, BigButton, Card, DataState, EmptyNote, Eyebrow, InfoRow, PageHeader, Pills, Skeletons, WRAP, INNER } from '../../components/site/kit.jsx';
import { phoneHref } from '../../lib/requests.js';
import { excerpt } from '../../lib/seo.js';
import { PageMeta, useSiteTitle } from './SiteLayout.jsx';
import { listState, useGroups } from './data.js';
import { groupPath, groupInterestPath, groupKindLabel } from '../../lib/groups.js';
import { KAABAG_PAGE, isKaabagGroup } from '../../lib/kaabag.js';

const SMALL = 'Ubos sa 5';

/** Mga Grupo (/komunidad/grupo): the ministries and organizations the parish put on the website. */
export default function Groups() {
  useSiteTitle('Mga Grupo');
  const q = listState(useGroups());
  const [kind, setKind] = useState('ministry');
  const kinds = ['ministry', 'organization'].filter((k) => q.rows.some((g) => g.kind === k));
  const current = kinds.includes(kind) ? kind : kinds[0];
  const shown = q.rows.filter((g) => g.kind === current);

  return (
    <main className="animate-fadeUp">
      <Band as="div">
        <div className={`${WRAP} ${BAND_PAD} flow-root`}>
          <PageHeader eyebrow="Komunidad" title="Mga Ministry ug Organisasyon">
            {kinds.length > 1 && (
              <Pills
                className="mb-4 lg:mb-0"
                options={kinds.map((k) => [k, k === 'ministry' ? 'Mga Ministry' : 'Mga Organisasyon'])}
                value={current}
                onChange={setKind}
              />
            )}
          </PageHeader>
          <p className="m-0 mt-1 max-w-[720px] text-[16px] lg:text-[17px] leading-relaxed text-[#3f3b2f]">
            Gusto ka mag-alagad o moapil? Pili og grupo ug i-tap ang <strong>Interesado ko</strong>. Kontakon ka sa among kawani.
          </p>
        </div>
      </Band>
      <section aria-label="Mga grupo" className={`${WRAP} pt-5 pb-7 lg:pt-9 lg:pb-12`}>
        <DataState
          state={q}
          skeleton={<Skeletons n={3} h={130} />}
          errorText="Wala ma-load ang mga grupo."
          empty={q.empty}
          emptyText="Wala pay grupo nga gipakita. Pangutan-a ang opisina sa parokya."
        >
          {!shown.length ? <EmptyNote>Wala pay grupo nga gipakita.</EmptyNote> : (
            <ul className="list-none m-0 p-0 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
              {shown.map((g) => (
                <li key={`${g.kind}-${g.id}`}>
                  <Card className="h-full flex flex-col p-4 lg:p-5 lg:rounded-[18px]">
                    <h2 className="m-0 font-serif text-[22px] lg:text-[24px] font-bold leading-tight text-parish-navy">
                      <Link to={groupPath(g)} className="hover:underline underline-offset-2">{g.name}</Link>
                    </h2>
                    {g.blurb && <p className="m-0 mt-1.5 text-[15px] leading-relaxed text-[#3f3b2f]">{excerpt(g.blurb, 140)}</p>}
                    <div className="mt-2 text-[13.5px] text-parish-text2">{g.members == null ? `${SMALL} ka miyembro` : `${g.members} ka miyembro`}</div>
                    <div className="mt-auto pt-3.5 flex gap-2 flex-wrap">
                      <BigButton to={groupInterestPath(g)} className="!w-auto flex-1 px-4 min-h-[46px] text-[15px]">Interesado ko</BigButton>
                      <BigButton to={groupPath(g)} variant="secondary" className="!w-auto px-4 min-h-[46px] text-[15px]">Dugang detalye</BigButton>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </section>
    </main>
  );
}

/** One ministry or organization (/komunidad/grupo/:kind/:id): what it does, who can join, when it meets. */
export function GroupDetail() {
  const { kind, id } = useParams();
  const q = listState(useGroups());
  useSiteTitle('Grupo');
  const pad = `${INNER} lg:max-w-[760px]`;
  if (q.loading) return <main className={pad}><Skeletons n={3} h={90} /></main>;
  if (q.error) return <main className={pad}><EmptyNote>Wala ma-load ang grupo.</EmptyNote></main>;
  const g = q.rows.find((x) => x.kind === kind && String(x.id) === String(id));
  if (!g) {
    return (
      <main className={pad}>
        <PageMeta noindex />
        <EmptyNote>Wala na kini nga grupo sa website.</EmptyNote>
        <BigButton variant="secondary" to="/komunidad/grupo">Tan-awa ang tanang grupo</BigButton>
      </main>
    );
  }
  const phone = g.contact?.mobile && phoneHref(g.contact.mobile);
  return (
    <main className={pad}>
      <PageMeta title={g.name} description={excerpt([g.blurb, g.who_can_join && `Kinsa ang makaapil: ${g.who_can_join}`, g.meets && `Tigom: ${g.meets}`].filter(Boolean).join(' · '))} />
      <Eyebrow>{groupKindLabel(g.kind)}</Eyebrow>
      <h1 className="font-serif font-semibold text-[34px] lg:text-[48px] leading-[1.06] mt-1 mb-3 text-parish-navy">{g.name}</h1>
      {g.blurb && <p className="m-0 mb-4 text-[17px] lg:text-[18px] leading-[1.6] text-parish-ink">{g.blurb}</p>}
      <Card className="px-3.5 py-1 mb-4 lg:px-5 lg:rounded-[20px]">
        {g.who_can_join && <InfoRow icon="people" label="Kinsa ang makaapil">{g.who_can_join}</InfoRow>}
        {g.meets && <InfoRow icon="clock" label="Kanus-a ug asa ang tigom">{g.meets}</InfoRow>}
        <InfoRow icon="home" label="Mga miyembro" last={!g.contact}>{g.members == null ? SMALL : g.members}</InfoRow>
        {g.contact && (
          <InfoRow icon="phone" label="Kontak" last>
            {g.contact.name}
            {phone && <> · <a href={`tel:${phone}`} className="text-parish-blue underline underline-offset-2">{g.contact.mobile}</a></>}
          </InfoRow>
        )}
      </Card>
      {g.kind === 'ministry' && isKaabagGroup(g.name) && <BigButton to={KAABAG_PAGE} variant="secondary" className="mb-2.5">Iskedyul sa mga Kaabag</BigButton>}
      <BigButton to={groupInterestPath(g)}><Icon name="heart" size={19} />Interesado ko</BigButton>
      <p className="m-0 mt-2.5 text-[13.5px] text-parish-text2">Isulat ang imong ngalan ug mobile number. Ang kawani sa parokya lang ang makakita, ug kontakon ka nila.</p>
      <Link to="/komunidad/grupo" className="inline-flex items-center min-h-[44px] mt-3 font-bold text-[15px] text-parish-blue">Tanang grupo</Link>
    </main>
  );
}

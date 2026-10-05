import React from 'react';
import { familiesOf, familyHeadName } from '../lib/household.js';

/**
 * Families within a household (0054 migration), for the admin screens. A
 * family is called by its head: "Family of Pedro Dela Cruz".
 */
export function familyTitle(group) {
  const name = familyHeadName(group?.head);
  if (name) return `Family of ${name}`;
  return group?.familyNo === 1 ? 'Household Head’s family' : `Family ${group?.familyNo ?? ''}`.trim();
}

export function FamilyHeading({ group, className = 'mb-2.5', children }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">{familyTitle(group)}</span>
      <span className="flex-1 h-px bg-parish-track" />
      {children}
    </div>
  );
}

/**
 * Members family by family, each under its heading, when the household has
 * more than one family; just the members otherwise. `render(member, index)`
 * draws one, `index` being its position in `members`.
 */
export function ByFamily({ members, render, gap = 'gap-2', groupGap = 'gap-5', heading }) {
  const groups = familiesOf(members);
  if (groups.length < 2) return <div className={`flex flex-col ${gap}`}>{(members || []).map(render)}</div>;
  return (
    <div className={`flex flex-col ${groupGap}`}>
      {groups.map((g) => (
        <section key={g.familyNo}>
          {heading ? heading(g) : <FamilyHeading group={g} />}
          <div className={`flex flex-col ${gap}`}>{g.members.map((m, k) => render(m, g.indexes[k]))}</div>
        </section>
      ))}
    </div>
  );
}

// The 3D object in the gold rays behind Home's hero, chosen in Parish Config
// → Home page 3D object (parish_settings.hero_symbol, 0117). Each parish can
// pick the one that suits its patron or devotion, or turn it off. The scene
// itself is components/site/heroGloryScene.js; this list has no three.js in
// it, so the admin and the activity log can use it cheaply.

export const HERO_SYMBOL_OFF = 'off';
export const DEFAULT_HERO_SYMBOL = 'crucifix';

/** In the order the admin shows them. */
export const HERO_SYMBOLS = [
  { key: 'crucifix', label: 'Crucifix', note: 'Christ on the cross, with the INRI plate.' },
  { key: 'cross', label: 'Cross', note: 'A plain gold cross.' },
  { key: 'chalice', label: 'Chalice & Host', note: 'The Eucharist: the cup with the Host above it.' },
  { key: 'monstrance', label: 'Monstrance', note: 'The Blessed Sacrament in its sunburst, for adoration.' },
  { key: 'sacred-heart', label: 'Sacred Heart', note: 'The heart of Jesus: thorns, flames and a cross.' },
  { key: 'immaculate-heart', label: 'Immaculate Heart', note: 'The heart of Mary: roses, a sword and flames.' },
  { key: 'dove', label: 'Holy Spirit', note: 'The dove with its wings spread.' },
  { key: 'rosary', label: 'Rosary', note: 'Five decades of beads and the crucifix.' },
];

const KEYS = new Set(HERO_SYMBOLS.map((s) => s.key));

/**
 * What the home page shows for a saved value: one of the HERO_SYMBOLS keys,
 * or HERO_SYMBOL_OFF. Nothing saved (or a database before 0117, or a value
 * from a newer version) shows the crucifix, as before there was a choice.
 */
export function heroSymbolOf(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (v === HERO_SYMBOL_OFF) return HERO_SYMBOL_OFF;
  return KEYS.has(v) ? v : DEFAULT_HERO_SYMBOL;
}

/** Its name, for the admin and the activity log ("Off" when turned off). */
export function heroSymbolLabel(value) {
  const key = heroSymbolOf(value);
  if (key === HERO_SYMBOL_OFF) return 'Off';
  return HERO_SYMBOLS.find((s) => s.key === key).label;
}

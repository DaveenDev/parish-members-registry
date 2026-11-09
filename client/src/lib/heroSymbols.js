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
  { key: 'our-lady', label: 'Our Lady, Queen of Heaven', note: 'Mary crowned with twelve stars, on the moon: for Guadalupe, Mediatrix or any title of Our Lady.' },
  { key: 'saint-male', label: 'Male Saint', note: 'A saint in a green tunic and crimson mantle, blessing, with the Gospel book and a halo: for a parish whose patron is a man saint.' },
  { key: 'saint-female', label: 'Female Saint', note: 'A saint in an ivory gown, white veil and brown mantle, holding a lily, with a halo: for a parish whose patron is a woman saint.' },
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

// Where the object sits across the hero on computers (parish_settings
// .hero_position, 0118). On phones it is always centred behind the text.
export const DEFAULT_HERO_POSITION = 'left';

/** In the order the admin shows them. */
export const HERO_POSITIONS = [
  { key: 'left', label: 'Left', note: 'Behind the welcome text.' },
  { key: 'center', label: 'Center', note: 'In the middle of the page.' },
  { key: 'right', label: 'Right', note: 'Beside the text, over the photo.' },
];

const POSITION_KEYS = new Set(HERO_POSITIONS.map((p) => p.key));

/** Nothing saved (or a database before 0118, or a value from a newer version) is left, as before there was a choice. */
export function heroPositionOf(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return POSITION_KEYS.has(v) ? v : DEFAULT_HERO_POSITION;
}

/** Its name, for the admin and the activity log. */
export function heroPositionLabel(value) {
  const key = heroPositionOf(value);
  return HERO_POSITIONS.find((p) => p.key === key).label;
}

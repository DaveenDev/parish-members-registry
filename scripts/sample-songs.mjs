// The songs for the Downloads page's samples (0096, 0097), shared by
// scripts/sample-downloads.mjs (all of them, on the demo site) and
// scripts/seed-live-songs.mjs (the real ones, on the live site).
//
// Public-domain hymns, Latin texts and prayer texts used at Mass are real
// songs anyone may publish. The ones credited to DEMO_COMPOSER were written
// for the demo site only and never go on the live site.

export const DEMO_COMPOSER = 'Sample nga kanta';

/** [title, composer, language, categories, note, lyrics] */
export const SONGS = [
  ['Ginoo, Kaloy-i Kami', null, 'Bisaya', ['Kasaulogan sa GKK', 'Bible Service'], 'Kyrie',
    'Ginoo, kaloy-i kami.\nGinoo, kaloy-i kami.\n\nKristo, kaloy-i kami.\nKristo, kaloy-i kami.\n\nGinoo, kaloy-i kami.\nGinoo, kaloy-i kami.'],
  ['Amahan Namo', null, 'Bisaya', ['Kasaulogan sa GKK', 'Bible Service', 'Kasagarang Kanta'], 'Ang pag-ampo nga gitudlo ni Hesus',
    'Amahan namo, nga anaa sa mga langit,\npagdaygon ang imong ngalan.\nMoabot kanamo ang imong gingharian.\nMatuman ang imong kabubut-on,\ndinhi sa yuta maingon sa langit.\n\nAng kalan-on namo sa matag adlaw\nihatag kanamo karong adlawa.\nUg pasayloa kami sa among mga sala,\nmaingon nga nagapasaylo kami\nsa mga nakasala kanamo.\n\nUg dili mo kami itugyan sa panulay,\nhinonoa luwasa kami sa dautan.'],
  ['Magtigom Kita', 'Sample nga kanta', 'Bisaya', ['Kasaulogan sa GKK'], 'Pagsulod',
    'Magtigom kita, mga igsoon,\nsa balay sa Ginoo nga maloloy-on.\nAng atong kasingkasing ablihan,\nsa iyang pulong kita magpaminaw.\n\nKORO:\nDayegon ta, dayegon ta\nang Dios nga nagtigom kanato.\nDayegon ta, dayegon ta\nsa awit ug sa pag-ampo.\n\nGikan sa matag balay ug dalan,\nmiabot kita nga usa ka panon.\nSa iyang gugma kita gipundok,\nusa ka pamilya sa Ginoo.'],
  ['Dayegon Ta ang Ginoo', 'Sample nga kanta', 'Bisaya', ['Kasaulogan sa GKK', 'Kasagarang Kanta'], 'Gloria / Pagdayeg',
    'Dayegon ta ang Ginoo,\nkay siya maayo.\nAng iyang gugma walay katapusan,\nhangtod sa kahangtoran.\n\nAng langit ug yuta mag-awit,\nang kabukiran ug kadagatan.\nAng tanang buhing binuhat\nmodayeg sa iyang ngalan.\n\nDayegon ta ang Ginoo,\nkay siya maayo.'],
  ['Halad sa Among Kinabuhi', 'Sample nga kanta', 'Bisaya', ['Kasaulogan sa GKK', 'Bible Service'], 'Halad',
    'Kining tinapay ug bino,\nbunga sa yuta ug sa among kamot,\namo karong ihalad kanimo,\nGinoo sa tanan.\n\nDawata, Ginoo, ang among halad,\nang among kapoy ug kalipay.\nDawata, Ginoo, ang among kinabuhi,\nkay imo man kini tanan.'],
  ['Sa Imong Pulong', 'Sample nga kanta', 'Bisaya', ['Bible Service'], 'Sa dili pa ang Ebanghelyo',
    'Sa imong pulong, Ginoo,\nkami magpaminaw.\nIablihi ang among dunggan\nug ang among kasingkasing.\n\nAleluya, aleluya,\nang imong pulong kahayag.\nAleluya, aleluya,\nsa among dalan, Ginoo.'],
  ['Salamat, Ginoo', 'Sample nga kanta', 'Bisaya', ['Kasaulogan sa GKK', 'Kasagarang Kanta'], 'Pagpasalamat',
    'Salamat, Ginoo, sa adlaw nga kini,\nsa pamilya ug sa silingan.\nSalamat sa kalan-on sa lamesa,\nsa kahimsog ug kalinaw.\n\nSalamat, Ginoo, sa imong pagbantay,\nsa among GKK nga nagkahiusa.\nPadayon kami sa imong dalan,\nhangtod sa among pagbalik.'],
  ['Amazing Grace', 'John Newton (1779)', 'English', ['Kasagarang Kanta'], null,
    'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.\n\n’Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.\n\nThrough many dangers, toils and snares,\nI have already come;\n’Tis grace hath brought me safe thus far,\nAnd grace will lead me home.'],
  ['Holy, Holy, Holy', 'Reginald Heber (1826)', 'English', ['Kasagarang Kanta'], 'Pagsulod',
    'Holy, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to thee;\nHoly, holy, holy, merciful and mighty!\nGod in three Persons, blessed Trinity!\n\nHoly, holy, holy! All the saints adore thee,\nCasting down their golden crowns around the glassy sea;\nCherubim and seraphim falling down before thee,\nWhich wert, and art, and evermore shalt be.'],
  ['Silent Night', 'Joseph Mohr (1818), tr. John F. Young', 'English', ['Pasko'], null,
    'Silent night, holy night,\nAll is calm, all is bright\nRound yon virgin mother and child.\nHoly infant so tender and mild,\nSleep in heavenly peace,\nSleep in heavenly peace.\n\nSilent night, holy night,\nShepherds quake at the sight;\nGlories stream from heaven afar,\nHeavenly hosts sing Alleluia!\nChrist the Saviour is born,\nChrist the Saviour is born!'],
  ['O Come, All Ye Faithful', 'tr. Frederick Oakeley (1841)', 'English', ['Pasko'], null,
    'O come, all ye faithful, joyful and triumphant,\nO come ye, O come ye to Bethlehem;\nCome and behold him, born the King of angels:\n\nO come, let us adore him,\nO come, let us adore him,\nO come, let us adore him, Christ the Lord.'],
  ['Salve Regina', null, 'Latin', ['Marian'], 'Pagkahuman sa Misa',
    'Salve, Regina, Mater misericordiae,\nvita, dulcedo, et spes nostra, salve.\nAd te clamamus, exsules filii Hevae,\nad te suspiramus, gementes et flentes\nin hac lacrimarum valle.\n\nEia, ergo, advocata nostra,\nillos tuos misericordes oculos ad nos converte;\net Iesum, benedictum fructum ventris tui,\nnobis post hoc exsilium ostende.\nO clemens, O pia, O dulcis Virgo Maria.'],
  ['Ave Maria', null, 'Latin', ['Marian', 'Kasagarang Kanta'], null,
    'Ave Maria, gratia plena,\nDominus tecum.\nBenedicta tu in mulieribus,\net benedictus fructus ventris tui, Iesus.\n\nSancta Maria, Mater Dei,\nora pro nobis peccatoribus,\nnunc et in hora mortis nostrae.\nAmen.'],
  ['Tantum Ergo', 'St. Thomas Aquinas', 'Latin', ['Kasagarang Kanta'], 'Benediction',
    'Tantum ergo Sacramentum\nveneremur cernui:\net antiquum documentum\nnovo cedat ritui:\npraestet fides supplementum\nsensuum defectui.\n\nGenitori, Genitoque\nlaus et iubilatio,\nsalus, honor, virtus quoque\nsit et benedictio:\nprocedenti ab utroque\ncompar sit laudatio.\nAmen.'],
];

/** True for a song written for the demo, not a real one. */
export const isDemoSong = ([, composer]) => composer === DEMO_COMPOSER;

const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const arr = (xs) => `array[${xs.map(q).join(', ')}]::text[]`;

/** The VALUES rows for `insert into songs (title, composer, language, categories, note, lyrics, published)`. */
export const songValues = (songs, published = true) => songs.map(([title, composer, language, cats, note, lyrics]) => (
  `(${q(title)}, ${q(composer)}, ${q(language)}, ${arr(cats)}, ${q(note)}, $lyrics$${lyrics}$lyrics$, ${published})`
));

/** The songs' titles, quoted for an SQL `in (…)`. */
export const songTitlesSql = (songs) => songs.map(([title]) => q(title)).join(', ');

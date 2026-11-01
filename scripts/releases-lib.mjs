// The releases page (GitHub Pages) from releases/notes/<version>.md: one
// file per release, a few header lines then Markdown. Plain functions, no
// dependencies, so scripts/build-releases.mjs and the tests share them.
//
//   ---
//   version: 1.1.0
//   date: 2026-11-20
//   title: Announcement photos
//   summary: One sentence for the list and the feed.
//   migrations: 0115            the last migration this release includes
//   functions: media-upload     to redeploy, comma-separated, or none
//   ---
//   Markdown: ## headings, - lists (indent two spaces to nest), **bold**,
//   `code`, [links](https://…) and paragraphs.

export const REPO = 'https://github.com/DaveenDev/parish-members-registry';
export const SITE = 'https://daveendev.github.io/parish-members-registry/';

const FIELDS = ['version', 'date', 'title', 'summary', 'migrations', 'functions'];

/** { version, date, title, summary, migrations, functions: [], body } from a notes file, or throws saying what's wrong. */
export function parseNotes(text, file = 'notes') {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${file}: start with the --- header lines (version, date, title, summary, migrations, functions).`);
  const head = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (kv) head[kv[1]] = kv[2].trim();
  }
  const missing = FIELDS.filter((f) => !head[f]);
  if (missing.length) throw new Error(`${file}: missing ${missing.join(', ')} in the header.`);
  if (!/^\d+\.\d+\.\d+$/.test(head.version)) throw new Error(`${file}: version must look like 1.2.0.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(head.date)) throw new Error(`${file}: date must look like 2026-11-20.`);
  if (!/^\d{4,5}$/.test(head.migrations)) throw new Error(`${file}: migrations is the last migration's number, like 0112.`);
  // npm run releases:new leaves <…> for what to write; none may be left.
  const unfinished = [head.title, head.summary, m[2].replace(/<!--[\s\S]*?-->/g, '')].some((s) => /<[A-Z][^>]*>|<a short name|<one sentence/.test(s));
  if (unfinished) throw new Error(`${file}: replace the <…> placeholders before building.`);
  const functions = /^none$/i.test(head.functions) ? [] : head.functions.split(',').map((s) => s.trim()).filter(Boolean);
  return { ...head, functions, body: m[2].trim() };
}

const parts = (v) => v.split('.').map(Number);
/** Newest first. */
export function sortReleases(releases) {
  return [...releases].sort((a, b) => {
    const [x, y] = [parts(a.version), parts(b.version)];
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
  });
}

/** The migrations a release adds, after the release before it: { from, to } (from is null for the first). */
export function migrationRange(release, older) {
  return { from: older ? older.migrations : null, to: release.migrations };
}

export const anchor = (version) => `v${version.replace(/\./g, '-')}`;

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(text) {
  let s = escapeHtml(text);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, label, url) => (/^(https?:|#|mailto:)/.test(url) ? `<a href="${url}">${label}</a>` : label));
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

/** The small Markdown the notes use, as HTML. Headings drop two levels (## → h3) under the release's own title. */
export function markdown(md) {
  const out = [];
  let para = [];
  const lists = []; // indents of open <ul>s
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const closeLists = (to = 0) => {
    while (lists.length > to) {
      out.push('</li></ul>');
      lists.pop();
    }
  };
  for (const raw of md.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    const item = /^(\s*)[-*]\s+(.*)$/.exec(line);
    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      continue;
    }
    if (heading) {
      flushPara();
      closeLists();
      const level = Math.min(heading[1].length + 1, 5);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (item) {
      flushPara();
      const indent = item[1].length;
      if (!lists.length || indent > lists[lists.length - 1]) {
        out.push('<ul><li>');
        lists.push(indent);
      } else {
        while (lists.length > 1 && indent < lists[lists.length - 1]) {
          out.push('</li></ul>');
          lists.pop();
        }
        out.push('</li><li>');
      }
      out.push(inline(item[2]));
    } else if (lists.length && /^\s+\S/.test(line)) {
      out.push(` ${inline(line.trim())}`); // a list item's text running on
    } else {
      closeLists();
      para.push(line.trim());
    }
  }
  flushPara();
  closeLists();
  return out.join('').replace(/<li><\/li>/g, '');
}

const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

function upgradeBox(r, older) {
  const { from, to } = migrationRange(r, older);
  const migrations = from === null
    ? `Every migration up to <code>${to}</code>`
    : from === to ? 'None' : `After <code>${from}</code>, up to <code>${to}</code>`;
  const functions = r.functions.length ? r.functions.map((f) => `<code>${escapeHtml(f)}</code>`).join(', ') : 'None';
  return `<dl class="upgrade"><div><dt>Migrations</dt><dd>${migrations}</dd></div><div><dt>Edge Functions to deploy</dt><dd>${functions}</dd></div></dl>`;
}

function article(r, older, latest) {
  const id = anchor(r.version);
  return `<article class="release" id="${id}">
  <header>
    <div class="meta"><a class="version" href="#${id}">v${escapeHtml(r.version)}</a>${latest ? '<span class="badge">Latest</span>' : ''}<time datetime="${r.date}">${longDate(r.date)}</time></div>
    <h2>${inline(r.title)}</h2>
    <p class="summary">${inline(r.summary)}</p>
  </header>
  ${upgradeBox(r, older)}
  <div class="notes">${markdown(r.body)}</div>
</article>`;
}

/** The whole page. `releases` newest first. */
export function pageHtml(releases, css) {
  const latest = releases[0];
  const nav = releases.map((r) => `<li><a href="#${anchor(r.version)}">v${escapeHtml(r.version)}</a> <span>${r.date}</span></li>`).join('');
  const body = releases.map((r, i) => article(r, releases[i + 1], i === 0)).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Parish Registry Releases</title>
<meta name="description" content="Release notes for the Parish Members Registry & Website: what changed in each version, and what to run to update a parish's copy.">
<link rel="alternate" type="application/atom+xml" title="Parish Registry releases" href="feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap">
<style>${css}</style>
</head>
<body>
<header class="hero">
  <div class="wrap">
    <p class="eyebrow">Parish Members Registry &amp; Website</p>
    <h1>Releases</h1>
    <p class="lede">What changed in each version, and what to run to bring a parish's copy up to date. The latest is <a href="#${anchor(latest.version)}">v${escapeHtml(latest.version)}</a>, ${longDate(latest.date)}.</p>
    <div class="actions">
      <a class="button primary" href="${REPO}/subscription">Watch on GitHub</a>
      <a class="button" href="feed.xml">Subscribe (Atom feed)</a>
      <a class="button" href="${REPO}">The repository</a>
    </div>
    <p class="hint">To get an email for each release: on GitHub, <strong>Watch</strong> → <strong>Custom</strong> → <strong>Releases</strong>. Or add <code>feed.xml</code> to a feed reader.</p>
  </div>
</header>
<div class="wrap layout">
  <aside class="side">
    <nav aria-label="Versions"><h2>Versions</h2><ul>${nav}</ul></nav>
    <section class="howto">
      <h2>Updating your copy</h2>
      <ol>
        <li>Run the release's migrations on your database, then deploy its Edge Functions (<a href="${REPO}/blob/main/deploy/04-releases.md">04-releases.md</a>).</li>
        <li>Carry the code across and push your website (<a href="${REPO}/blob/main/deploy/03-new-parish.md#step-5-keeping-the-copy-up-to-date">03-new-parish.md, step 5</a>).</li>
      </ol>
      <p>Database first, then functions, then website.</p>
    </section>
  </aside>
  <main>
${body}
  </main>
</div>
<footer class="foot"><div class="wrap">Built For Free by <a href="https://daveendev.vercel.app/">DaveenDev</a> · <a href="${REPO}">Source on GitHub</a></div></footer>
</body>
</html>
`;
}

/** An Atom feed of the releases (newest first), each linking to its place on the page. */
export function feedXml(releases) {
  const x = escapeHtml;
  const entries = releases.map((r, i) => {
    const url = `${SITE}#${anchor(r.version)}`;
    const content = `<p>${inline(r.summary)}</p>${upgradeBox(r, releases[i + 1])}${markdown(r.body)}`;
    return `  <entry>
    <title>v${x(r.version)}: ${x(r.title)}</title>
    <id>${url}</id>
    <link href="${url}"/>
    <updated>${r.date}T00:00:00Z</updated>
    <summary>${x(r.summary)}</summary>
    <content type="html">${x(content)}</content>
  </entry>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Parish Members Registry releases</title>
  <id>${SITE}</id>
  <link href="${SITE}"/>
  <link rel="self" href="${SITE}feed.xml"/>
  <updated>${releases[0].date}T00:00:00Z</updated>
  <author><name>DaveenDev</name></author>
${entries}
</feed>
`;
}

// Paragraphs on one line each: GitHub shows a release's line breaks as they are.
function unwrap(md) {
  const lines = md.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const starts = /^\s*([-*]\s|#|$)/.test(line);
    const continues = prev !== undefined && prev.trim() !== '' && !/^#/.test(prev) && !starts;
    if (continues) out[out.length - 1] = `${prev} ${line.trim()}`;
    else out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The GitHub Release's text: the summary, the upgrade lines, the notes and a link to the page. */
export function githubReleaseBody(r, older) {
  const { from, to } = migrationRange(r, older);
  const migrations = from === null ? `every migration up to ${to}` : from === to ? 'none' : `after ${from}, up to ${to}`;
  return `${r.summary}\n\n- **Migrations:** ${migrations}\n- **Edge Functions to deploy:** ${r.functions.length ? r.functions.join(', ') : 'none'}\n\n${unwrap(r.body)}\n\n---\nAll releases: ${SITE}#${anchor(r.version)}\n`;
}

// Keep the list of parishes' Supabase projects, and link this folder to one.
//
// Each parish (and the demo site) is one entry in the root `parishes.json`:
// a short name, a label, the project ref and the database connection string.
// scripts/release-db.mjs runs migrations from the same file. `supabase link`
// decides which project this folder's --linked commands reach (npm run
// db:migrations, a plain `supabase db push`); `link` switches it by name,
// with the password from the file, so you don't type project refs.
//
// Usage:
//   npm run parish                 # the parishes, and which one is linked
//   npm run parish -- add          # record a parish (asks for each detail)
//   npm run parish -- link muaan   # link this folder to that parish's project
//
// See deploy/04-releases.md.
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import {
  checkName, fail, linkedRef, loadParishes, npx, passwordFromDbUrl,
  readParishes, refFromDbUrl, writeParishes,
} from './parishes-file.mjs';

const PLACEHOLDER = '[YOUR-PASSWORD]';

function list() {
  const parishes = readParishes();
  const linked = linkedRef();
  if (parishes.length === 0) {
    console.log('No parishes recorded yet. Add one with: npm run parish -- add');
  } else {
    const width = Math.max(...parishes.map((p) => String(p.name).length));
    parishes.forEach((p, i) => {
      const ref = p.projectRef || refFromDbUrl(p.dbUrl) || '?';
      const notes = [i === 0 && 'tried first', ref === linked && 'linked'].filter(Boolean);
      console.log(`  ${String(p.name).padEnd(width)}  ${ref}  ${p.label || ''}${notes.length ? `  (${notes.join(', ')})` : ''}`);
    });
  }
  if (!linked) {
    console.log('\nThis folder isn\'t linked to any project.');
  } else if (!parishes.some((p) => (p.projectRef || refFromDbUrl(p.dbUrl)) === linked)) {
    console.log(`\nThis folder is linked to ${linked}, which isn't in parishes.json.`);
  }
}

// Questions one line at a time. readline echoes what's typed through
// `output`, which goes quiet for the password. Lines that arrive before
// they're asked for (answers piped in) wait in a queue instead of being lost.
function prompter() {
  let hidden = false;
  let closed = false;
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!hidden) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
  const lines = [];
  const waiting = [];
  rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : lines.push(line)));
  rl.on('close', () => {
    closed = true;
    while (waiting.length) waiting.shift()('');
  });
  const next = () => {
    if (lines.length) return Promise.resolve(lines.shift());
    if (closed) return Promise.resolve('');
    return new Promise((resolve) => waiting.push(resolve));
  };
  return {
    ask(question) {
      process.stdout.write(question);
      return next();
    },
    async askHidden(question) {
      process.stdout.write(question);
      hidden = true;
      try {
        return await next();
      } finally {
        hidden = false;
        process.stdout.write('\n');
      }
    },
    close: () => rl.close(),
  };
}

async function add() {
  const parishes = readParishes();
  const io = prompter();
  try {
    const name = (await io.ask('Short name, used in the commands (e.g. sjmv): ')).trim();
    const nameProblem = checkName(name);
    if (nameProblem) fail(`Use ${nameProblem}.`);
    if (parishes.some((p) => p.name === name)) fail(`"${name}" is already in parishes.json.`);

    const label = (await io.ask(`Label (e.g. SJMV Parish) [${name}]: `)).trim() || name;

    console.log('\nSupabase → the project → Connect → Session pooler. Paste the string as it is, with [YOUR-PASSWORD] in it.');
    let dbUrl = (await io.ask('Connection string: ')).trim();
    const projectRef = refFromDbUrl(dbUrl);
    if (!projectRef) fail('That isn\'t a Session pooler string: it should start postgresql://postgres.<project ref>:');
    const other = parishes.find((p) => (p.projectRef || refFromDbUrl(p.dbUrl)) === projectRef);
    if (other) fail(`Project ${projectRef} is already in parishes.json as "${other.name}".`);
    if (!/:5432\//.test(dbUrl)) console.log('Note: the Session pooler string uses port 5432; this one doesn\'t.');

    if (dbUrl.includes(PLACEHOLDER)) {
      const password = await io.askHidden('Database password (Project Settings → Database), not shown: ');
      if (!password) fail('No password given. Nothing was saved.');
      dbUrl = dbUrl.replace(PLACEHOLDER, encodeURIComponent(password));
    }

    const backupAnswer = (await io.ask('Does it have the weekly backup workflow? (the demo site doesn\'t) [Y/n]: ')).trim().toLowerCase();
    const entry = { name, label, projectRef };
    if (backupAnswer === 'n' || backupAnswer === 'no') entry.backup = false;
    entry.dbUrl = dbUrl;

    writeParishes([...parishes, entry]);
    console.log(`\nSaved ${label} (${name}, project ${projectRef}) to parishes.json.`);
    if (parishes.length === 0) console.log('It is first in the file, so every migration is tried on it first: make the first one the demo site.');
    console.log(`Check the connection: npm run release:db -- status ${name}`);
  } finally {
    io.close();
  }
}

function link(name) {
  const parishes = loadParishes();
  if (!name) fail(`Which parish? npm run parish -- link <name>. Names: ${parishes.map((p) => p.name).join(', ')}.`);
  const parish = parishes.find((p) => p.name === name);
  if (!parish) fail(`No parish named "${name}" in parishes.json. Names: ${parishes.map((p) => p.name).join(', ')}.`);
  if (!parish.projectRef) fail(`${name}: no project ref. Add "projectRef" to it in parishes.json.`);

  console.log(`Linking this folder to ${parish.label} (${parish.projectRef})...`);
  const result = npx(['supabase', 'link', '--project-ref', parish.projectRef], {
    stdio: 'inherit',
    env: { ...process.env, SUPABASE_DB_PASSWORD: passwordFromDbUrl(parish.dbUrl) || '' },
  });
  if (result.status !== 0) {
    fail(`Couldn't link to ${parish.label}. Run \`npx supabase login\` with an account that is a member of that project's Supabase organization, then try again.`);
  }
  if (linkedRef() !== parish.projectRef) fail(`supabase link finished, but the folder isn't linked to ${parish.projectRef}.`);
  console.log(`\nThis folder is now linked to ${parish.label}. --linked commands (npm run db:migrations, supabase db push) reach its database.`);
}

const [command, arg] = process.argv.slice(2);
if (!command || command === 'list') list();
else if (command === 'add') await add();
else if (command === 'link') link(arg);
else fail('Usage: npm run parish   |   npm run parish -- add   |   npm run parish -- link <name>');

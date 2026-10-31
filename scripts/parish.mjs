// Keep the list of parishes' Supabase projects, and link this folder to one.
//
// Each parish (and the demo site) is one entry in the root `parishes.json`:
// a short name, a label, the project ref, the database connection string
// and, for a project on another Supabase account, an access token for that
// account. scripts/release-db.mjs runs migrations from the same file, and
// scripts/release-functions.mjs deploys the Edge Functions. `supabase link`
// decides which project this folder's --linked commands reach (npm run
// db:migrations, a plain `supabase db push`); `link` switches it by name,
// with the password from the file, so you don't type project refs.
//
// Usage:
//   npm run parish                 # the parishes, and which one is linked
//   npm run parish -- add          # record a parish (asks for each detail)
//   npm run parish -- link muaan   # link this folder to that parish's project
//   npm run parish -- token sjmv   # set or change its Edge Function deploy token
//
// See deploy/04-releases.md.
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import {
  ACCESS_TOKEN, checkName, fail, linkedRef, loadParishes, npx, passwordFromDbUrl,
  readParishes, refFromDbUrl, writeParishes,
} from './parishes-file.mjs';

const PLACEHOLDER = '[YOUR-PASSWORD]';
const TOKEN_HELP = 'Edge Functions are deployed with a Supabase access token for the account that owns the project:\n'
  + 'sign in to supabase.com as that account → Account (top right) → Access Tokens → Generate new token.\n'
  + 'Leave it blank to use this computer\'s own `npx supabase login` (fine when that account is a member of the project).';

// An access token from the prompt: '' for none, or fails on one that isn't a token.
async function askToken(io) {
  const token = (await io.askHidden('Access token (sbp_…), not shown, blank for none: ')).trim();
  if (token && !ACCESS_TOKEN.test(token)) fail('That isn\'t a Supabase access token: it starts with sbp_. Nothing was saved.');
  return token;
}

function list() {
  const parishes = readParishes();
  const linked = linkedRef();
  if (parishes.length === 0) {
    console.log('No parishes recorded yet. Add one with: npm run parish -- add');
  } else {
    const width = Math.max(...parishes.map((p) => String(p.name).length));
    parishes.forEach((p, i) => {
      const ref = p.projectRef || refFromDbUrl(p.dbUrl) || '?';
      const notes = [i === 0 && 'tried first', ref === linked && 'linked', p.accessToken && 'deploy token'].filter(Boolean);
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
    console.log(`\n${TOKEN_HELP}`);
    const accessToken = await askToken(io);

    const entry = { name, label, projectRef };
    if (backupAnswer === 'n' || backupAnswer === 'no') entry.backup = false;
    entry.dbUrl = dbUrl;
    if (accessToken) entry.accessToken = accessToken;

    writeParishes([...parishes, entry]);
    console.log(`\nSaved ${label} (${name}, project ${projectRef}) to parishes.json.`);
    if (parishes.length === 0) console.log('It is first in the file, so every migration and function is tried on it first: make the first one the demo site.');
    console.log(`Check the connection: npm run release:db -- status ${name}`);
    console.log(`Check the functions:  npm run release:functions -- status ${name}`);
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

// Set, change or clear a parish's access token, for one recorded before
// tokens were asked for, or when a token is renewed.
async function token(name) {
  const parishes = readParishes();
  if (!name) fail(`Which parish? npm run parish -- token <name>. Names: ${parishes.map((p) => p.name).join(', ')}.`);
  const parish = parishes.find((p) => p.name === name);
  if (!parish) fail(`No parish named "${name}" in parishes.json. Names: ${parishes.map((p) => p.name).join(', ')}.`);
  const io = prompter();
  try {
    console.log(`${parish.label || name}${parish.accessToken ? ' has a token now; a new one replaces it, blank removes it' : ' has no token now'}.\n\n${TOKEN_HELP}`);
    const accessToken = await askToken(io);
    if (accessToken) parish.accessToken = accessToken;
    else delete parish.accessToken;
    writeParishes(parishes);
    console.log(accessToken ? `\nSaved. Check it: npm run release:functions -- status ${name}` : `\n${parish.label || name} has no token: deploys use this computer's \`npx supabase login\`.`);
  } finally {
    io.close();
  }
}

const [command, arg] = process.argv.slice(2);
if (!command || command === 'list') list();
else if (command === 'add') await add();
else if (command === 'link') link(arg);
else if (command === 'token') await token(arg);
else fail('Usage: npm run parish   |   npm run parish -- add   |   npm run parish -- link <name>   |   npm run parish -- token <name>');

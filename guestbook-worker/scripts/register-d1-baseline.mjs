#!/usr/bin/env node
/**
 * One-time, fail-closed Cloudflare D1 baseline registration.
 * Cloudflare Workers Builds Build command (temporary):
 *   node scripts/register-d1-baseline.mjs --register-existing-baseline
 * Keep Deploy command at npx wrangler deploy; restore Build command to None.
 *
 * Requires a Cloudflare Build API token with D1 Editor on this database.
 * Uses Wrangler to record history; no manual writes to d1_migrations.
 * Does not edit guestbook messages, sessions, config or the public flag.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const DB_NAME='color-matcher-guestbook';
const DB_ID='e136a183-92b3-437c-a823-3f548db341c1';
const MIGRATIONS=['0001_init.sql','0002_github_sessions.sql'];
const SCHEMA_OBJECTS=[
  'messages','admin_sessions','idx_messages_status_created',
  'idx_messages_fingerprint_created','idx_admin_sessions_expiry'
];
const args=process.argv.slice(2);
function stop(message){throw Error('[D1 BASELINE BLOCKED] '+message);}
function normalized(sql){
  return String(sql||'').replace(/--[^\n]*/g,'')
    .replace(/\bIF\s+NOT\s+EXISTS\b/gi,'')
    .replace(/[;"\s]/g,'').toLowerCase();
}
function migrationStatements(file){
  return readFileSync(path.join(ROOT,'migrations',file),'utf8').split('\n')
    .filter(line=>!line.trimStart().startsWith('--')).join('\n')
    .split(';').map(s=>s.trim()).filter(Boolean);
}
function expectedDDL(){
  const entries=new Map();
  for(const file of MIGRATIONS){
    for(const statement of migrationStatements(file)){
      const m=statement.match(/^CREATE\s+(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\s+([a-z_]\w*)\b/i);
      if(!m||entries.has(m[1]))stop('Unexpected statement in '+file);
      entries.set(m[1],normalized(statement));
    }
  }
  if([...entries.keys()].sort().join(',')!==[...SCHEMA_OBJECTS].sort().join(','))
    stop('Unexpected baseline migration SQL');
  return entries;
}
function verifyCatalog(rows){
  if(!Array.isArray(rows))stop('Missing D1 schema catalog');
  const expected=expectedDDL(),actual=new Map(rows.map(r=>[r.name,r]));
  if(actual.size!==rows.length)stop('Duplicate D1 catalog names');
  for(const [name,sql] of expected){
    const item=actual.get(name);
    if(!item||item.type!==(name.startsWith('idx_')?'index':'table')||
       normalized(item.sql)!==sql)
      stop('Schema mismatch for '+name+'. No migrations applied.');
  }
  for(const name of actual.keys())
    if(name!=='d1_migrations'&&!expected.has(name))
      stop('Unexpected D1 object '+name);
  if(actual.has('d1_migrations')&&actual.get('d1_migrations').type!=='table')
    stop('Migration registry is not a table');
  return actual.has('d1_migrations');
}
function verifyConfig(requireClosed=true){
  const c=JSON.parse(readFileSync(path.join(ROOT,'wrangler.jsonc'),'utf8'));
  const db=c.d1_databases;
  if(c.name!=='color-matcher-guestbook-api'||
      (requireClosed && c.vars?.PUBLIC_ENABLED!=='false')||
      !Array.isArray(db)||db.length!==1||
      db[0].binding!=='DB'||db[0].database_name!==DB_NAME||
      db[0].database_id!==DB_ID||db[0].migrations_dir!=='migrations')
    stop('Production closed flag or intended Worker/D1 UUID mismatch');
  const files=readdirSync(path.join(ROOT,'migrations'))
    .filter(x=>x.endsWith('.sql')).sort();
  if(files.join(',')!==MIGRATIONS.join(','))
    stop('Migration files are not exactly the two frozen baseline versions');
  expectedDDL();
}
function wrangler(args,json=false){
  try{
    const stdout=execFileSync('npx',['--yes','wrangler',...args],{
      cwd:ROOT,encoding:'utf8',maxBuffer:4*1024*1024,timeout:170000,
      env:{...process.env,CI:'true'},stdio:['ignore','pipe','pipe']
    }).trim();
    if(!json)return stdout;
    try{return JSON.parse(stdout);}
    catch{stop('Expected JSON from Wrangler --json (head): '+stdout.slice(0,140));}
  }catch(e){
    if(e.message?.includes('[D1 BASELINE BLOCKED]'))throw e;
    stop('Wrangler command '+args.slice(0,3).join(' ')+
      ' failed. Check D1 Editor token permissions. '+String(e.stderr||e.message).slice(-750));
  }
}
function extractRows(response){
  let v=response;
  if(Array.isArray(v)){if(v.length!==1)stop('Expected one D1 query result');v=v[0];}
  if(v?.success===false)stop('Wrangler D1 returned failure');
  const r=v?.results??v?.result?.results??v?.result?.[0]?.results;
  if(Array.isArray(r))return r;
  if(r&&Array.isArray(r.rows)&&Array.isArray(r.columns))
    return r.rows.map(row=>Object.fromEntries(r.columns.map((key,i)=>[key,row[i]])));
  stop('Unexpected Wrangler D1 response structure');
}
function query(sql){
  return extractRows(wrangler([
    'd1','execute',DB_NAME,'--remote','--json','--command',sql
  ],true));
}
function catalog(){
  return query("SELECT name,type,sql FROM sqlite_master WHERE name IN ("+
    "'messages','admin_sessions','d1_migrations',"+
    "'idx_messages_status_created','idx_messages_fingerprint_created',"+
    "'idx_admin_sessions_expiry') ORDER BY name");
}
function counts(){
  const rows=query("SELECT "+
    "(SELECT COUNT(*) FROM messages) AS message_count,"+
    "(SELECT COUNT(*) FROM admin_sessions) AS session_count");
  if(rows.length!==1)stop('Bad count query result');
  const m=Number(rows[0].message_count),s=Number(rows[0].session_count);
  if(!Number.isSafeInteger(m)||m<0||!Number.isSafeInteger(s)||s<0)
    stop('Malformed D1 counts');
  return {messages:m,sessions:s};
}
function verifyHistory(){
  const names=query('SELECT name FROM d1_migrations ORDER BY name').map(r=>r.name);
  if(names.join(',')!==MIGRATIONS.join(','))
    stop('Unexpected D1 migration history: '+names.join(','));
}
function bookmark(){
  const value=wrangler(['d1','time-travel','info',DB_NAME,'--json'],true);
  function find(v,seen=new Set()){
    if(!v||typeof v!=='object'||seen.has(v))return null;
    seen.add(v);
    if(typeof v.bookmark==='string'&&v.bookmark.length>=12)return v.bookmark;
    for(const x of Object.values(v)){const b=find(x,seen);if(b)return b;}
    return null;
  }
  const result=find(value);
  if(!result)stop('Cannot retrieve a Time Travel bookmark BEFORE migration');
  return result;
}
async function main(){
  if(args.length!==1||!['--self-test','--register-existing-baseline'].includes(args[0]))
    stop('Need exactly one of --self-test or --register-existing-baseline');
  verifyConfig(args[0]!=='--self-test');
  if(args[0]==='--self-test'){
    const examples=[];
    for(const file of MIGRATIONS)for(const sql of migrationStatements(file)){
      const m=sql.match(/^CREATE\s+(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\s+(\w+)/i);
      examples.push({name:m[2],type:m[1].toLowerCase(),
        sql:sql.replace(/\bIF\s+NOT\s+EXISTS\b/i,'')});
    }
    assert.equal(verifyCatalog(examples),false);
    assert.equal(verifyCatalog([...examples,{
      name:'d1_migrations',type:'table',
      sql:'CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT)'
    }]),true);
    assert.throws(()=>verifyCatalog(examples.filter(x=>x.name!=='messages')));
    assert.throws(()=>verifyCatalog(examples.map(x=>x.name==='messages'
      ?{...x,sql:x.sql.replace('published','unpublished')}:x)));
    console.log('PASS one-time registrar: config/schema/drift/idempotency guards');
    return;
  }
  console.log('Target D1:',DB_NAME,DB_ID);
  console.log('PUBLIC_ENABLED stays false; migration files are fixed.');
  const already=verifyCatalog(catalog());
  const before=counts();
  console.log('Existing D1 counts (no content):',before);
  if(already){
    verifyHistory();
    console.log('PASS: two baseline migrations were already recorded; no changes.');
    return;
  }
  console.log('Original manual DDL matches the frozen baseline; history is missing.');
  const checkpoint=bookmark();
  console.log('Pre-migration D1 Time Travel bookmark:',checkpoint);
  console.log('Applying two existing baseline migrations via Wrangler...');
  console.log(wrangler(['d1','migrations','apply',DB_NAME,'--remote']).slice(-3500));
  if(!verifyCatalog(catalog()))
    stop('Migration metadata table was not created.');
  verifyHistory();
  const after=counts();
  if(after.messages<before.messages)
    stop('Message count declined during migration; investigate before release');
  console.log('PASS: both migrations registered; schema unchanged; messages preserved.');
  console.log('Message count before/after:',before.messages,'/',after.messages);
  console.log('Session count before/after:',before.sessions,'/',after.sessions);
  console.log('NEXT: reset temporary Cloudflare Build command to None.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

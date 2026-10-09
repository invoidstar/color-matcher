import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {
  HttpError, validateMessage, parsePagination, publicReady, fingerprint, requireAdmin
} from '../src/security.js';
import { ADMIN_HTML, ADMIN_CSS, ADMIN_JS } from '../src/admin-ui.js';

const API = 'https://color-matcher-guestbook-api.3518925535.workers.dev';
const ORIGIN = 'https://invoidstar.github.io';

class FakeD1 {
  constructor() { this.rows = []; }
  prepare(query) {
    const db = this;
    const sql = query.replace(/\s+/g, ' ').trim();
    return {
      bind(...values) {
        return {
          async first() {
            if (sql.startsWith('SELECT COUNT(*) AS count FROM messages WHERE fingerprint')) {
              return {count:db.rows.filter(r=>r.fingerprint===values[0]&&r.created_at>=values[1]).length};
            }
            if (sql.startsWith('SELECT id FROM messages WHERE fingerprint')) {
              return db.rows.find(r=>r.fingerprint===values[0]&&r.content===values[1]&&r.created_at>=values[2]) || null;
            }
            throw new Error('Unexpected first SQL: ' + sql);
          },
          async all() {
            let list = db.rows;
            const onlyPublic = sql.includes("WHERE status = 'published'");
            const filtered = sql.includes('WHERE status = ?');
            if (onlyPublic) list = list.filter(r=>r.status==='published');
            if (filtered) list = list.filter(r=>r.status===values[0]);
            const args = filtered ? values.slice(1) : values;
            const count = args[0], offset = args[1];
            const results = list.slice().sort((a,b)=>
              b.created_at-a.created_at || b.id.localeCompare(a.id))
              .slice(offset,offset+count).map(r=>{
                const item = {...r};
                delete item.fingerprint;
                if (onlyPublic) { delete item.status; delete item.updated_at; }
                return item;
              });
            return {results};
          },
          async run() {
            if (sql.startsWith('INSERT INTO messages')) {
              const [id,nickname,category,content,fp,created,updated] = values;
              db.rows.push({id,nickname,category,content,fingerprint:fp,created_at:created,
                updated_at:updated,status:'published',admin_reply:null,replied_at:null});
              return {meta:{changes:1}};
            }
            if (sql.startsWith("UPDATE messages SET status = 'hidden'")) {
              const row=db.rows.find(r=>r.id===values[1]);
              if (!row) return {meta:{changes:0}};
              row.status='hidden';row.updated_at=values[0];return {meta:{changes:1}};
            }
            if (sql.startsWith("UPDATE messages SET status = 'published'")) {
              const row=db.rows.find(r=>r.id===values[1]);
              if (!row) return {meta:{changes:0}};
              row.status='published';row.updated_at=values[0];return {meta:{changes:1}};
            }
            if (sql.startsWith('UPDATE messages SET admin_reply')) {
              const row=db.rows.find(r=>r.id===values[3]);
              if (!row) return {meta:{changes:0}};
              row.admin_reply=values[0];row.replied_at=values[1];row.updated_at=values[2];
              return {meta:{changes:1}};
            }
            if (sql.startsWith('DELETE FROM messages')) {
              const initial=db.rows.length;
              db.rows=db.rows.filter(r=>r.id!==values[0]);
              return {meta:{changes:initial-db.rows.length}};
            }
            throw new Error('Unexpected run SQL: ' + sql);
          }
        };
      }
    };
  }
}
function env(db=new FakeD1()) {
  return {
    DB:db,PUBLIC_ENABLED:'true',ALLOWED_ORIGIN:ORIGIN,
    TURNSTILE_HOSTNAME:'invoidstar.github.io',TURNSTILE_SITE_KEY:'testing-site-key',
    TURNSTILE_SECRET:'testing-secret',RATE_LIMIT_SALT:'local-test-salt-must-be-long',
    CF_ACCESS_TEAM_DOMAIN:'cm-test.cloudflareaccess.com',
    CF_ACCESS_AUD:'expected-access-aud', ADMIN_EMAIL:'site-owner@example.test'
  };
}
function request(path,method='GET',body=null,headers={}) {
  const h = {'Origin':ORIGIN,...headers};
  if(body!==null)h['content-type']='application/json';
  return new Request(API + path,{method,headers:h,
    ...(body!==null?{body:JSON.stringify(body)}:{})});
}
const postBody=(content,token='turnstile-fixture-token')=>({
  nickname:'访客 A',category:'feature',content,turnstileToken:token
});
async function result(path,method='GET',body=null,envData=env(),headers={}) {
  const response=await worker.fetch(request(path,method,body,headers),envData);
  const data=await response.json();
  return {response,data};
}

const {publicKey,privateKey} = await crypto.subtle.generateKey({
  name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'
},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',publicKey);
jwk.kid='test-access-key';jwk.alg='RS256';
function mockNetwork(mode='valid') {
  const realFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    const value=String(url);
    if(value.includes('/cdn-cgi/access/certs'))return Response.json({keys:[jwk]});
    if(value.includes('/turnstile/v0/siteverify')) {
      return Response.json({
        success:mode==='valid',
        hostname:mode==='wrong-host'?'evil.example':'invoidstar.github.io',
        action:'guestbook_post'
      });
    }
    throw new Error('Unexpected external request: '+value);
  };
  return ()=>{globalThis.fetch=realFetch;};
}
const now=()=>Math.floor(Date.now()/1000);
async function accessJwt(overrides={}) {
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({
    iss:'https://cm-test.cloudflareaccess.com',
    aud:['expected-access-aud'],
    email:'site-owner@example.test',iat:now()-10,exp:now()+300,...overrides
  })).toString('base64url');
  const data=header+'.'+payload;
  const signature=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,
    new TextEncoder().encode(data))).toString('base64url');
  return data+'.'+signature;
}

test('submission normalization, length limits and category whitelist',()=>{
  assert.deepEqual(validateMessage({nickname:'  啊   哇  ',category:'bug',content:'  需要\n\n修复  '}),
    {nickname:'啊 哇',category:'bug',content:'需要\n\n修复'});
  assert.throws(()=>validateMessage({nickname:'',category:'bug',content:'abc'}),HttpError);
  assert.throws(()=>validateMessage({nickname:'x',category:'not-exist',content:'abc'}),HttpError);
  assert.throws(()=>validateMessage({nickname:'x',category:'bug',content:'a'.repeat(501)}),HttpError);
  assert.throws(()=>validateMessage({nickname:'x',category:'bug',content:'a\u0000b'}),HttpError);
  assert.deepEqual(parsePagination(new URL(API+'/api/messages?page=2&limit=10')),
    {page:2,limit:10,offset:10});
  assert.throws(()=>parsePagination(new URL(API+'/api/messages?page=0')),HttpError);
});
test('public mode is off by default and admin rejects unconfigured identity',async()=>{
  const disabled=env();
  disabled.PUBLIC_ENABLED='false';
  const config=await result('/api/config','GET',null,disabled);
  assert.equal(config.response.status,200);
  assert.equal(config.data.enabled,false);
  assert.equal(config.data.siteKey,null);
  const denied=await result('/api/messages','POST',postBody('hi'),disabled);
  assert.equal(denied.response.status,503);
  assert.equal(disabled.DB.rows.length,0);
  const admin=env();delete admin.CF_ACCESS_AUD;
  const response=await worker.fetch(request('/admin/'),admin);
  assert.equal(response.status,503);
});
test('public config requires all secrets; never returns Turnstile secret',async()=>{
  const instance=env();
  assert.equal(publicReady(instance),true);
  const config=await result('/api/config','GET',null,instance);
  assert.equal(config.data.enabled,true);
  assert.equal(config.data.siteKey,'testing-site-key');
  assert.equal(JSON.stringify(config.data).includes('testing-secret'),false);
  delete instance.RATE_LIMIT_SALT;
  assert.equal(publicReady(instance),false);
});
test('invalid Origin, invalid captcha and incorrect siteverify hostname fail closed',async()=>{
  const instance=env();
  const foreign=await result('/api/messages','POST',postBody('test'),instance,{
    Origin:'https://example.org','CF-Connecting-IP':'192.0.2.2'
  });
  assert.equal(foreign.response.status,403);
  const restore=mockNetwork('invalid');
  try {
    const invalid=await result('/api/messages','POST',postBody('test'),instance,{
      'CF-Connecting-IP':'192.0.2.2'
    });
    assert.equal(invalid.response.status,403);
  } finally {restore();}
  const restore2=mockNetwork('wrong-host');
  try {
    const invalid=await result('/api/messages','POST',postBody('test'),instance,{
      'CF-Connecting-IP':'192.0.2.2'
    });
    assert.equal(invalid.response.status,403);
  } finally {restore2();}
  assert.equal(instance.DB.rows.length,0);
});
test('accepted anonymous post is immediately visible and never exposes fingerprints',async()=>{
  const instance=env(),restore=mockNetwork();
  try {
    const posted=await result('/api/messages','POST',
      postBody('<img src=x onerror=alert(1)>'),instance,{'CF-Connecting-IP':'198.51.100.10'});
    assert.equal(posted.response.status,201);
    assert.equal(posted.data.item.content,'<img src=x onerror=alert(1)>');
    assert.equal(posted.response.headers.get('access-control-allow-origin'),ORIGIN);
    const listing=await result('/api/messages','GET',null,instance);
    assert.equal(listing.data.items.length,1);
    assert.equal(listing.data.items[0].content,posted.data.item.content);
    assert.equal(listing.response.headers.get('cache-control'),'no-store, max-age=0');
    assert.equal(JSON.stringify(listing.data).includes('fingerprint'),false);
    assert.equal(JSON.stringify(listing.data).includes('198.51.100.10'),false);
  } finally {restore();}
});
test('duplicates and per-fingerprint rate limits reject rapid submissions',async()=>{
  const instance=env(),restore=mockNetwork();
  const headers={'CF-Connecting-IP':'203.0.113.4'};
  try {
    assert.equal((await result('/api/messages','POST',postBody('first'),instance,headers)).response.status,201);
    assert.equal((await result('/api/messages','POST',postBody('first'),instance,headers)).response.status,409);
    assert.equal((await result('/api/messages','POST',postBody('second'),instance,headers)).response.status,201);
    assert.equal((await result('/api/messages','POST',postBody('third'),instance,headers)).response.status,429);
    assert.equal(instance.DB.rows.length,2);
  } finally {restore();}
});
test('admin pages and data reject missing or invalid Access JWT',async()=>{
  const instance=env();
  const noToken=await worker.fetch(request('/admin/'),instance);
  assert.equal(noToken.status,401);
  const forgery=await worker.fetch(request('/admin/api/messages','GET',null,{
    'Cf-Access-Jwt-Assertion':'fake.invalid.jwt'
  }),instance);
  assert.equal(forgery.status,401);
  const jwt=await accessJwt({email:'intruder@example.org'});
  const bad=await worker.fetch(request('/admin/api/messages','GET',null,{
    'Cf-Access-Jwt-Assertion':jwt
  }),instance);
  assert.equal(bad.status,403);
});
test('valid Access token permits hide, restore, reply and permanent delete',async()=>{
  const instance=env();
  const restore=mockNetwork();
  try {
    const posted=await result('/api/messages','POST',postBody('important feedback'),
      instance,{'CF-Connecting-IP':'203.0.113.111'});
    const id=posted.data.item.id;
    const jwt=await accessJwt();
    const auth={'Cf-Access-Jwt-Assertion':jwt};
    const page=await worker.fetch(request('/admin/','GET',null,auth),instance);
    assert.equal(page.status,200);
    assert.match(await page.text(),/留言管理/);
    assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
    const adminList=await result('/admin/api/messages','GET',null,instance,auth);
    assert.equal(adminList.data.items.length,1);
    let changed=await result('/admin/api/messages/'+id,'PATCH',{action:'hide'},instance,auth);
    assert.equal(changed.response.status,200);
    assert.equal((await result('/api/messages','GET',null,instance)).data.items.length,0);
    changed=await result('/admin/api/messages/'+id,'PATCH',{action:'restore'},instance,auth);
    assert.equal(changed.response.status,200);
    assert.equal((await result('/api/messages','GET',null,instance)).data.items.length,1);
    changed=await result('/admin/api/messages/'+id,'PATCH',
      {action:'reply',reply:'谢谢反馈，我们会修复。'},instance,auth);
    assert.equal(changed.response.status,200);
    assert.match((await result('/api/messages','GET',null,instance)).data.items[0].admin_reply,/谢谢/);
    const removed=await result('/admin/api/messages/'+id,'DELETE',null,instance,auth);
    assert.equal(removed.response.status,200);
    assert.equal((await result('/api/messages','GET',null,instance)).data.items.length,0);
    assert.equal(instance.DB.rows.length,0);
  } finally {restore();}
});
test('tampering with a signed token is rejected',async()=>{
  const instance=env(), restore=mockNetwork();
  try {
    const jwt=await accessJwt();
    const segments=jwt.split('.');
    segments[2]=(segments[2][0]==='A'?'B':'A')+segments[2].slice(1);
    const response=await worker.fetch(request('/admin/api/messages','GET',null,{
      'Cf-Access-Jwt-Assertion':segments.join('.')
    }),instance);
    assert.equal(response.status,401);
  } finally {restore();}
});
test('admin assets parse as JavaScript and no hidden HTML scripting exists',()=>{
  assert.match(ADMIN_HTML,/\/admin\/app.js/);
  assert.match(ADMIN_CSS,/min-height:42px/);
  assert.doesNotThrow(()=>new Function(ADMIN_JS));
  assert.equal(ADMIN_HTML.includes('<script>'),false);
});

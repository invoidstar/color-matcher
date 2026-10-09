import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {
  HttpError, validateMessage, parsePagination, publicReady, fingerprint
} from '../src/security.js';
import { ADMIN_HTML, ADMIN_CSS, ADMIN_JS } from '../src/admin-ui.js';

const API = 'https://color-matcher-guestbook-api.3518925535.workers.dev';
const ORIGIN = 'https://invoidstar.github.io';

class FakeD1 {
  constructor() { this.rows = []; this.sessions = []; }
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
            if (sql.startsWith('SELECT session_hash,csrf_token')) {
              return db.sessions.find(r=>r.session_hash===values[0]) || null;
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
            if (sql.startsWith('INSERT INTO admin_sessions')) {
              const [session_hash,csrf_token,github_user_id,created_at,expires_at]=values;
              db.sessions.push({session_hash,csrf_token,github_user_id,created_at,expires_at});
              return {meta:{changes:1}};
            }
            if (sql.startsWith('DELETE FROM admin_sessions')) {
              const length=db.sessions.length;
              db.sessions=db.sessions.filter(row=>row.session_hash!==values[0]);
              return {meta:{changes:length-db.sessions.length}};
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
    GITHUB_CLIENT_ID:'Iv1.testClientId12345',
    GITHUB_CLIENT_SECRET:'fixture-github-client-secret-do-not-use',
    GITHUB_ADMIN_USER_ID:'12345',
    GITHUB_REDIRECT_URI: API+'/auth/github/callback'
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

function mockNetwork(mode='valid') {
  const realFetch=globalThis.fetch;
  globalThis.fetch=async (url,options)=>{
    const target=String(url);
    if (target.includes('turnstile/v0/siteverify')) {
      return Response.json({
        success:mode!=='invalid',
        hostname:mode==='wrong-host'?'evil.example':'invoidstar.github.io',
        action:'guestbook_post'
      });
    }
    if (target.includes('github.com/login/oauth/access_token')) {
      assert.equal(options.method,'POST');
      assert.equal(JSON.parse(options.body).client_id,'Iv1.testClientId12345');
      return Response.json({access_token:'oauth-fixture-token',token_type:'bearer'});
    }
    if (target.includes('api.github.com/user')) {
      assert.match(options.headers.authorization,/Bearer /);
      return Response.json({
        id:mode==='wrong-user'?98765:12345,
        login:mode==='wrong-user'?'intruder':'site-owner'
      });
    }
    throw new Error('Unexpected network request: '+target);
  };
  return ()=>{globalThis.fetch=realFetch;};
}
async function login(instance) {
  const start=await worker.fetch(request('/auth/github/start','GET',null,{Origin:API}),instance);
  assert.equal(start.status,303);
  const authorize=new URL(start.headers.get('location'));
  assert.equal(authorize.hostname,'github.com');
  assert.equal(authorize.searchParams.get('client_id'),'Iv1.testClientId12345');
  assert.equal(authorize.searchParams.get('redirect_uri'),API+'/auth/github/callback');
  const state=authorize.searchParams.get('state');
  assert.ok(state&&state.length===43);
  const stateCookie=start.headers.get('set-cookie').split(';')[0];
  const cb=await worker.fetch(request(
    '/auth/github/callback?state='+encodeURIComponent(state)+'&code=fixtureCode12345678',
    'GET',null,{Origin:API,Cookie:stateCookie}
  ),instance);
  assert.equal(cb.status,303);
  assert.equal(cb.headers.get('location'),'/admin/');
  const cookies=cb.headers.getSetCookie?.() || [cb.headers.get('set-cookie')];
  const sessionSetCookie=cookies.find(c=>c&&c.startsWith('__Host-cmgb_session='));
  assert.ok(sessionSetCookie);
  assert.match(sessionSetCookie,/HttpOnly/);
  assert.match(sessionSetCookie,/SameSite=Lax/);
  const sessionCookie=sessionSetCookie.split(';')[0];
  const status=await result('/admin/api/session','GET',null,instance,{Cookie:sessionCookie,Origin:API});
  assert.equal(status.response.status,200);
  assert.ok(status.data.csrfToken);
  return {cookie:sessionCookie,headers:{
    Cookie:sessionCookie,Origin:API,'x-cm-csrf':status.data.csrfToken
  }};
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
  const admin=env();delete admin.GITHUB_CLIENT_SECRET;
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
test('missing session redirects browser and rejects admin API',async()=>{
  const instance=env();
  const loginPage=await worker.fetch(request('/admin/login','GET',null,{Origin:API}),instance);
  assert.equal(loginPage.status,200);
  assert.match(await loginPage.text(),/使用 GitHub 登录/);
  const redirected=await worker.fetch(request('/admin/','GET',null,{Origin:API}),instance);
  assert.equal(redirected.status,303);
  assert.equal(redirected.headers.get('location'),'/admin/login');
  const missing=await result('/admin/api/messages','GET',null,instance,{Origin:API});
  assert.equal(missing.response.status,401);
  const forged=await result('/admin/api/messages','GET',null,instance,{
    Origin:API,Cookie:'__Host-cmgb_session='+('x'.repeat(43))
  });
  assert.equal(forged.response.status,401);
});

test('OAuth state mismatch, wrong origin, and non-admin GitHub ID are rejected',async()=>{
  const instance=env();
  const state=await result('/auth/github/callback?state=wrong&code=fixtureCode12345678',
    'GET',null,instance,{Origin:API});
  assert.equal(state.response.status,403);
  const startFromWrongHost=await result('/auth/github/start','GET',null,instance,{Origin:API});
  assert.equal(startFromWrongHost.response.status,303);
  const restore=mockNetwork('wrong-user');
  try{
    const start=await worker.fetch(request('/auth/github/start','GET',null,{Origin:API}),instance);
    const authorize=new URL(start.headers.get('location'));
    const stateCookie=start.headers.get('set-cookie').split(';')[0];
    const response=await worker.fetch(request(
      '/auth/github/callback?state='+authorize.searchParams.get('state')+
      '&code=fixtureCode12345678','GET',null,{Origin:API,Cookie:stateCookie}
    ),instance);
    assert.equal(response.status,403);
    assert.equal(instance.DB.sessions.length,0);
  }finally{restore();}
});

test('GitHub login creates opaque revocable session and requires CSRF',async()=>{
  const instance=env(), restore=mockNetwork();
  try {
    const admin=await login(instance);
    assert.equal(instance.DB.sessions.length,1);
    assert.ok(!JSON.stringify(instance.DB.sessions).includes('oauth-fixture-token'));
    assert.ok(!JSON.stringify(instance.DB.sessions).includes(admin.cookie.slice(19)));
    const session=await result('/admin/api/session','GET',null,instance,admin.headers);
    assert.equal(session.data.userId,'12345');
    const denied=await result('/admin/api/messages/00000000-0000-4000-8000-000000000000',
      'DELETE',null,instance,{Origin:API,Cookie:admin.cookie});
    assert.equal(denied.response.status,403);
    const wrongOrigin=await result('/admin/api/messages/00000000-0000-4000-8000-000000000000',
      'DELETE',null,instance,{...admin.headers,Origin:'https://evil.example'});
    assert.equal(wrongOrigin.response.status,403);
  }finally{restore();}
});

test('authorized GitHub owner can hide, restore, reply and delete',async()=>{
  const instance=env(),restore=mockNetwork();
  try{
    const posted=await result('/api/messages','POST',postBody('important feedback'),
      instance,{'CF-Connecting-IP':'203.0.113.111'});
    const id=posted.data.item.id;
    const admin=await login(instance);
    const page=await worker.fetch(request('/admin/','GET',null,admin.headers),instance);
    assert.equal(page.status,200);
    assert.match(await page.text(),/留言管理/);
    assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
    const list=await result('/admin/api/messages','GET',null,instance,admin.headers);
    assert.equal(list.data.items.length,1);
    let changed=await result('/admin/api/messages/'+id,'PATCH',{action:'hide'},instance,admin.headers);
    assert.equal(changed.response.status,200);
    assert.equal((await result('/api/messages','GET',null,instance)).data.items.length,0);
    changed=await result('/admin/api/messages/'+id,'PATCH',{action:'restore'},instance,admin.headers);
    assert.equal(changed.response.status,200);
    assert.equal((await result('/api/messages','GET',null,instance)).data.items.length,1);
    changed=await result('/admin/api/messages/'+id,'PATCH',
      {action:'reply',reply:'谢谢反馈，我们会修复。'},instance,admin.headers);
    assert.equal(changed.response.status,200);
    assert.match((await result('/api/messages','GET',null,instance)).data.items[0].admin_reply,/谢谢/);
    const removed=await result('/admin/api/messages/'+id,'DELETE',null,instance,admin.headers);
    assert.equal(removed.response.status,200);
    assert.equal((await result('/api/messages','GET',null,instance)).data.items.length,0);
    assert.equal(instance.DB.rows.length,0);
    const logout=await result('/admin/api/logout','POST',null,instance,admin.headers);
    assert.equal(logout.response.status,200);
    assert.equal(instance.DB.sessions.length,0);
    assert.match(logout.response.headers.get('set-cookie'),/Max-Age=0/);
    const after=await result('/admin/api/messages','GET',null,instance,admin.headers);
    assert.equal(after.response.status,401);
  }finally{restore();}
});

test('admin assets parse as JavaScript and no hidden HTML scripting exists',()=>{
  assert.match(ADMIN_HTML,/\/admin\/app.js/);
  assert.match(ADMIN_CSS,/min-height:42px/);
  assert.doesNotThrow(()=>new Function(ADMIN_JS));
  assert.equal(ADMIN_HTML.includes('<script>'),false);
});

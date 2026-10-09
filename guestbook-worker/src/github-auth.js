// GitHub OAuth for one Color Matcher administrator. No Zero Trust / Access.
// Opaque sessions are stored as SHA-256 hashes in D1; login uses single-use state.
// All unsafe admin operations require same-origin and a session CSRF token.
import { HttpError } from './security.js';

const SESSION_COOKIE='__Host-cmgb_session';
const STATE_COOKIE='__Host-cmgb_oauth_state';
const SESSION_TTL=8*60*60, STATE_TTL=10*60;

function configuration(env){
  const clientId=String(env.GITHUB_CLIENT_ID||'').trim();
  const clientSecret=String(env.GITHUB_CLIENT_SECRET||'');
  const adminId=String(env.GITHUB_ADMIN_USER_ID||'').trim();
  const redirectUri=String(env.GITHUB_REDIRECT_URI||'').trim();
  if(!/^[A-Za-z0-9_.-]{6,128}$/.test(clientId) || clientSecret.length<16 ||
     !/^[1-9]\d{0,18}$/.test(adminId) ||
     !/^https:\/\/[^/?#]+\/auth\/github\/callback$/.test(redirectUri)){
    throw new HttpError(503,'github_auth_unconfigured','GitHub 管理员登录尚未配置');
  }
  return {clientId,clientSecret,adminId,redirectUri};
}
function database(env){
  if(!env.DB||typeof env.DB.prepare!=='function')
    throw new HttpError(503,'database_unavailable','数据库尚未配置');
  return env.DB;
}
function checkHost(request,config){
  if(new URL(request.url).origin!==new URL(config.redirectUri).origin)
    throw new HttpError(403,'wrong_auth_host','请通过配置的 Worker 地址登录');
}
function randomToken(size=32){
  const bytes=crypto.getRandomValues(new Uint8Array(size));
  const binary=Array.from(bytes,byte=>String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function sha256(value){
  const buffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
}
function cookie(request,name){
  const raw=request.headers.get('cookie')||'';
  for(const part of raw.split(';')){
    const item=part.trim();
    if(item.startsWith(name+'='))return item.slice(name.length+1);
  }
  return '';
}
function equal(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let result=0;
  for(let i=0;i<a.length;i++)result|=a.charCodeAt(i)^b.charCodeAt(i);
  return result===0;
}
function setCookie(name,value,age){
  return name+'='+value+'; Path=/; Max-Age='+age+'; Secure; HttpOnly; SameSite=Lax';
}
function redirect(location,cookieHeader){
  const headers=new Headers({
    location,'cache-control':'no-store','referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff'
  });
  if(cookieHeader)headers.append('set-cookie',cookieHeader);
  return new Response(null,{status:303,headers});
}
export function loginHtml(){
  const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="robots" content="noindex,nofollow">'+
    '<title>站长登录 · Color Matcher</title>'+
    '<link rel="stylesheet" href="/auth/login.css"></head><body><main>'+
    '<span class="mark" aria-hidden="true">✿</span>'+
    '<p class="eyebrow">COLOR MATCHER · ADMIN</p>'+
    '<h1>站长管理后台</h1><p>使用你的 GitHub 账号安全登录，管理留言、回复、隐藏及删除。</p>'+
    '<a class="login" href="/auth/github/start">使用 GitHub 登录 →</a>'+
    '<a class="back" href="https://invoidstar.github.io/color-matcher/">返回配色工作台</a>'+
    '<p class="footnote">仅预先指定的 GitHub 用户 ID 可以访问管理后台。访客无需登录。</p>'+
    '</main></body></html>';
  return new Response(html,{headers:{
    'content-type':'text/html; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
    'content-security-policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'; style-src 'self'"
  }});
}
export async function beginGitHubLogin(request,env){
  const cfg=configuration(env);database(env);checkHost(request,cfg);
  const state=randomToken(32);
  const url=new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id',cfg.clientId);
  url.searchParams.set('redirect_uri',cfg.redirectUri);
  url.searchParams.set('state',state);
  // No repository or email scopes; only GitHub /user numeric ID is needed.
  return redirect(url.toString(),setCookie(STATE_COOKIE,state,STATE_TTL));
}
async function exchangeCode(code,cfg){
  let payload;
  try{
    const response=await fetch('https://github.com/login/oauth/access_token',{
      method:'POST',
      headers:{'content-type':'application/json',accept:'application/json'},
      body:JSON.stringify({client_id:cfg.clientId,client_secret:cfg.clientSecret,
        code,redirect_uri:cfg.redirectUri}),
      signal:AbortSignal.timeout(7000)
    });
    if(!response.ok)throw new Error('oauth_http');
    payload=await response.json();
  }catch{
    throw new HttpError(502,'github_token_unavailable','GitHub 授权暂时失败，请重试');
  }
  if(!payload||payload.error||typeof payload.access_token!=='string'||
      !payload.access_token||payload.access_token.length>2048||
      String(payload.token_type||'').toLowerCase()!=='bearer'){
    throw new HttpError(403,'github_token_denied','GitHub 未完成授权');
  }
  return payload.access_token;
}
async function githubUserId(token){
  let data;
  try{
    const response=await fetch('https://api.github.com/user',{
      headers:{authorization:'Bearer '+token,
        accept:'application/vnd.github+json',
        'user-agent':'ColorMatcherGuestbook/1.0',
        'x-github-api-version':'2022-11-28'},
      signal:AbortSignal.timeout(7000)
    });
    if(!response.ok)throw new Error('github_profile_http');
    data=await response.json();
  }catch{
    throw new HttpError(502,'github_identity_unavailable','GitHub 身份查询失败');
  }
  if(!data||!Number.isSafeInteger(data.id)||data.id<=0){
    throw new HttpError(403,'github_identity_invalid','无效的 GitHub 用户身份');
  }
  return String(data.id);
}
export async function finishGitHubLogin(request,env,url){
  const cfg=configuration(env),db=database(env);checkHost(request,cfg);
  const state=url.searchParams.get('state')||'';
  const expected=cookie(request,STATE_COOKIE);
  const code=url.searchParams.get('code')||'';
  if(!/^[A-Za-z0-9_-]{43}$/.test(state) || !equal(state,expected) ||
     !/^[A-Za-z0-9_-]{8,512}$/.test(code) || url.searchParams.has('error')){
    throw new HttpError(403,'github_oauth_state','授权状态无效或已过期，请重新登录');
  }
  const token=await exchangeCode(code,cfg);
  const userId=await githubUserId(token);
  if(userId!==cfg.adminId)
    throw new HttpError(403,'github_admin_forbidden','此 GitHub 账号没有管理权限');
  const now=Math.floor(Date.now()/1000);
  const opaque=randomToken(32),csrf=randomToken(32);
  await db.prepare('INSERT INTO admin_sessions '+
    '(session_hash,csrf_token,github_user_id,created_at,expires_at) VALUES (?,?,?,?,?)')
    .bind(await sha256(opaque),csrf,userId,now,now+SESSION_TTL).run();
  const response=redirect('/admin/',setCookie(SESSION_COOKIE,opaque,SESSION_TTL));
  response.headers.append('set-cookie',setCookie(STATE_COOKIE,'',0));
  return response;
}
export async function requireAdmin(request,env,unsafe=false){
  const cfg=configuration(env),db=database(env);checkHost(request,cfg);
  const token=cookie(request,SESSION_COOKIE);
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new HttpError(401,'admin_login_required','请使用 GitHub 登录管理员后台');
  const sessionHash=await sha256(token);
  const row=await db.prepare('SELECT session_hash,csrf_token,github_user_id,expires_at '+
    'FROM admin_sessions WHERE session_hash = ? LIMIT 1')
    .bind(sessionHash).first();
  if(!row||String(row.github_user_id)!==cfg.adminId||
      !Number.isFinite(Number(row.expires_at))||Number(row.expires_at)<=Math.floor(Date.now()/1000)){
    throw new HttpError(401,'admin_session_expired','管理员会话已经过期，请重新登录');
  }
  if(unsafe){
    const origin=request.headers.get('origin')||'';
    const csrf=request.headers.get('x-cm-csrf')||'';
    if(origin!==new URL(cfg.redirectUri).origin||!equal(csrf,row.csrf_token)){
      throw new HttpError(403,'csrf_failed','管理员操作安全校验失败，请刷新页面');
    }
  }
  return {userId:cfg.adminId,csrfToken:row.csrf_token,sessionHash};
}
export async function logoutAdmin(session,env){
  await database(env).prepare('DELETE FROM admin_sessions WHERE session_hash = ?')
    .bind(session.sessionHash).run();
  return new Response(JSON.stringify({ok:true}),{headers:{
    'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'set-cookie':setCookie(SESSION_COOKIE,'',0)
  }});
}

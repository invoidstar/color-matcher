import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { Miniflare, createFetchMock } from 'miniflare';

// Real Chromium + the official Turnstile dummy widget; no production writes.
// The dummy token is checked against the REAL Cloudflare Siteverify service.
// Only test-key metadata (hostname/action), omitted by dummy responses, is
// adapted inside this isolated test harness. Production validation is unchanged.
const API='https://guestbook-acceptance.invalid';
const MESSAGE='隔离浏览器验收：提交成功并完成清理';
const SITEKEY='1x00000000000000000000AA';
const DUMMY_SECRET='1x0000000000000000000000000000000AA';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const HERE=fileURLToPath(new URL('../',import.meta.url));

test('Chromium visitor publish and isolated D1 cleanup', {timeout:150000}, async()=>{
  const output=path.join(HERE,'test-results');
  await mkdir(output,{recursive:true});
  const paths={
    '/guestbook.html':'guestbook.html',
    '/css/guestbook.css':'css/guestbook.css',
    '/js/guestbook.js':'js/guestbook.js'
  };
  const server=createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    if(pathname==='/js/guestbook-config.js'){
      res.writeHead(200,{'content-type':'text/javascript'});
      res.end('window.COLOR_MATCHER_GUESTBOOK_API='+JSON.stringify(API)+';');
      return;
    }
    if(!Object.hasOwn(paths,pathname)){res.writeHead(404);res.end('Not found');return;}
    const filename=paths[pathname];
    const mime=filename.endsWith('css')?'text/css':filename.endsWith('js')?'text/javascript':'text/html';
    res.writeHead(200,{'content-type':mime});
    res.end(await readFile(path.join(ROOT,filename)));
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  const fetchMock=createFetchMock();
  fetchMock.disableNetConnect();
  let actualSiteverifyCalls=0;
  fetchMock.get('https://challenges.cloudflare.com').intercept({
    method:'POST',path:'/turnstile/v0/siteverify'
  }).reply(async request=>{
    const requestBody=JSON.parse(request.body);
    assert.equal(requestBody.secret,'1x0000000000000000000000000000000AA');
    assert.equal(requestBody.response,'XXXX.DUMMY.TOKEN.XXXX');
    const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify(requestBody),signal:AbortSignal.timeout(10000)
    });
    assert.equal(response.status,200);
    const actual=await response.json();
    assert.equal(actual.success,true);
    actualSiteverifyCalls++;
    console.log('PASS real Cloudflare dummy Siteverify',JSON.stringify({
      success:actual.success,hostname:actual.hostname,action:actual.action??null
    }));
    // Official dummy Siteverify returns example.com and no action, even
    // for a real widget rendered on localhost. Strict production
    // hostname/action validation is retained; ONLY test response adapts.
    return {statusCode:200,data:JSON.stringify({
      ...actual,hostname:'127.0.0.1',action:'guestbook_post'
    })};
  });
  const mf=new Miniflare({
    modules:true,
    scriptPath:fileURLToPath(new URL('../src/index.js',import.meta.url)),
    modulesRules:[{type:'ESModule',include:['**/*.js'],fallthrough:true}],
    compatibilityDate:'2026-08-06',
    d1Databases:{DB:'00000000-0000-4000-8000-000000000004'},
    bindings:{
      PUBLIC_ENABLED:'true',ALLOWED_ORIGIN:origin,
      TURNSTILE_SITE_KEY:SITEKEY,TURNSTILE_SECRET:DUMMY_SECRET,
      TURNSTILE_HOSTNAME:'127.0.0.1',
      RATE_LIMIT_SALT:'isolated-browser-test-salt-with-required-length',
      GITHUB_CLIENT_ID:'Ov23ctbZCJlcKuhDQjU3',
      GITHUB_CLIENT_SECRET:'isolated-only-github-app-test-placeholder',
      GITHUB_ADMIN_USER_ID:'63053541',
      GITHUB_REDIRECT_URI:'https://color-matcher-guestbook-api.3518925535.workers.dev/auth/github/callback'
    },fetchMock
  });
  let browser;
  try{
    const db=await mf.getD1Database('DB');
    for(const filename of ['0001_init.sql','0002_github_sessions.sql']){
      const source=await readFile(path.join(HERE,'migrations',filename),'utf8');
      const sql=source.split('\n').filter(s=>!s.trimStart().startsWith('--')).join('\n');
      for(const stmt of sql.split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(stmt).run();
    }
    browser=await chromium.launch({headless:true,args:['--no-sandbox']});
    const context=await browser.newContext({viewport:{width:1150,height:850},serviceWorkers:'block'});
    await context.route(API+'/**',async route=>{
      const req=route.request(),headers=await req.allHeaders();
      delete headers.host;delete headers['content-length'];
      headers['cf-connecting-ip']='198.51.100.120';
      const args={method:req.method(),headers,redirect:'manual'};
      if(req.postData()!==null)args.body=req.postData();
      const result=await mf.dispatchFetch(req.url(),args);
      const responseHeaders=Object.fromEntries(result.headers);
      delete responseHeaders['content-length'];
      await route.fulfill({status:result.status,headers:responseHeaders,body:Buffer.from(await result.arrayBuffer())});
    });
    const page=await context.newPage();
    page.on('pageerror',e=>console.log('Browser JS error:',e.message));
    await page.goto(origin+'/guestbook.html',{waitUntil:'domcontentloaded'});
    await page.getByText('留言板已开放',{exact:false}).waitFor({timeout:20000});
    await page.locator('#nickname').fill('隔离测试');
    await page.locator('#content').fill(MESSAGE);
    await page.screenshot({path:path.join(output,'01-turnstile.png'),fullPage:true});
    await page.waitForFunction(()=>document.querySelector('#submitBtn')?.disabled===false,null,{timeout:60000});
    await page.locator('#submitBtn').click();
    await page.getByText('留言发布成功',{exact:false}).waitFor({timeout:20000});
    await page.locator('.message-list').getByText(MESSAGE).waitFor({timeout:20000});
    await page.screenshot({path:path.join(output,'02-published.png'),fullPage:true});
    assert.equal(actualSiteverifyCalls,1);
    const msg=await db.prepare('SELECT id FROM messages WHERE content=?').bind(MESSAGE).first();
    assert.ok(msg?.id);
    console.log('PASS real Chromium Turnstile test widget, submission, isolated D1 and public listing');
    await db.prepare('DELETE FROM messages WHERE id=?').bind(msg.id).run();
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM messages').first()).n,0);
    await page.reload();
    await page.locator('#emptyMessages:visible').waitFor({timeout:20000});
    await page.screenshot({path:path.join(output,'03-cleaned.png'),fullPage:true});
    console.log('PASS cleanup and empty listing; production untouched');
    await context.close();
  }finally{
    if(browser)await browser.close();
    await mf.dispose();
    await new Promise(resolve=>server.close(resolve));
  }
});

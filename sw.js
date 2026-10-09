const CACHE='plush-color-matcher-v4.1-guestbook';
const ASSETS=[
  './','./index.html','./palette.html','./manifest.webmanifest','./icon.svg',
  './css/base.css','./css/theme.css','./css/features.css','./css/palette.css','./css/announcement.css','./css/traffic.css',
  './js/core/color.js','./js/app.js','./js/palette-gallery.js','./js/announcements.js',
  './data/announcements.js','./data/qqtq-480.js','./data/hanter-620.js','./data/alice-1680.js','./guide.html','./css/guide.css','./css/ui-v4.css','./js/ui-v4.js'
];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
// Leave network APIs and guestbook resources uncached: messages, challenges and
// sign-in responses must never be served from the offline PWA asset cache.
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||e.request.cache==='no-store')return;
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin||url.pathname.includes('guestbook'))return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
    if(res.ok&&res.type==='basic'){
      const copy=res.clone();
      e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));
    }
    return res;
  }).catch(()=>e.request.mode==='navigate'?caches.match('./index.html'):undefined)));
});

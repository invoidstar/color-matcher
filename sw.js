const CACHE='plush-color-matcher-v3.1';
const ASSETS=[
  './','./index.html','./manifest.webmanifest','./icon.svg',
  './css/base.css','./css/theme.css','./css/features.css',
  './js/core/color.js','./js/app.js',
  './data/qqtq-480.js','./data/natural-720.js'
];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res;}).catch(()=>e.request.mode==='navigate'?caches.match('./index.html'):undefined)));});

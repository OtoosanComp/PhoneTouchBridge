const CACHE='tcg-op-shell-v102';
const ASSETS=[
  './','./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./assets/tcg-icons.svg','./assets/tsuki-chibi.webp','./assets/yami-chibi.webp','./assets/twins-banner.webp',
  './src/card-intelligence/core.js','./src/card-intelligence/catalog.js','./src/card-intelligence/catalog-normalizers.js','./src/card-intelligence/catalog-sync.js','./src/card-intelligence/catalog-admin.js','./src/card-intelligence/database.js','./src/card-intelligence/fair-market.js','./src/card-intelligence/learning.js','./src/card-intelligence/agents.js','./src/card-intelligence/price-ui.js',
  './src/card-intelligence/ocr.js','./src/card-intelligence/cloud.js',
  './src/card-intelligence/engine.js','./src/card-intelligence/cloud-policy.mjs','./src/card-intelligence/ui.js','./src/card-intelligence/ai-status.js','./src/card-intelligence/image-prep.js','./src/card-intelligence/yugioh-provider.js',
  './src/card-intelligence/codes.js','./src/card-intelligence/text-match.js','./src/card-intelligence/card-crop.js','./src/card-intelligence/catalog-index.js','./src/card-intelligence/aliases.js','./src/card-intelligence/price-modifiers.js','./src/card-intelligence/price-settings.js',
  './catalogs/riftbound.json','./catalogs/yugioh.json','./catalogs/yugioh-es-aliases.json'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(()=>event.request.mode==='navigate'?caches.match('./index.html'):Response.error())));
});

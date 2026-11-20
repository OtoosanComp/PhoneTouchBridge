const CACHE='tcg-op-shell-v110';
const ASSETS=[
  './','./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./assets/tcg-icons.svg','./assets/tsuki-chibi.webp','./assets/yami-chibi.webp','./assets/twins-banner.webp',
  './vendor/qrcode/qrcode.min.js',
  './src/card-intelligence/core.js','./src/card-intelligence/catalog.js','./src/card-intelligence/catalog-normalizers.js','./src/card-intelligence/catalog-sync.js','./src/card-intelligence/catalog-admin.js','./src/card-intelligence/database.js','./src/card-intelligence/fair-market.js','./src/card-intelligence/learning.js','./src/card-intelligence/agents.js','./src/card-intelligence/price-ui.js',
  './src/card-intelligence/ocr.js','./src/card-intelligence/cloud.js','./src/card-intelligence/gemini-shared.mjs','./src/card-intelligence/vision-parse.mjs',
  './src/card-intelligence/engine.js','./src/card-intelligence/cloud-policy.mjs','./src/card-intelligence/ui.js','./src/card-intelligence/ai-status.js','./src/card-intelligence/image-prep.js','./src/card-intelligence/yugioh-provider.js',
  './src/card-intelligence/codes.js','./src/card-intelligence/text-match.js','./src/card-intelligence/card-crop.js','./src/card-intelligence/catalog-index.js','./src/card-intelligence/aliases.js','./src/card-intelligence/price-modifiers.js','./src/card-intelligence/price-settings.js',
  './catalogs/riftbound.json','./catalogs/yugioh.json','./catalogs/yugioh-es-aliases.json'
];
// El motor OCR (vendor/tesseract, ~13 MB) no se precarga: se guarda en caché la primera vez que se usa.
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
const store=(request,response)=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy))}return response};
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin||url.pathname.startsWith('/.netlify/'))return;
  // Páginas: primero la red (para recibir actualizaciones al momento) y la caché si no hay conexión.
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(r=>store(event.request,r)).catch(()=>caches.match(event.request).then(c=>c||caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(r=>store(event.request,r)).catch(()=>Response.error())));
});

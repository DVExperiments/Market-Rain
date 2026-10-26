/* Scope-relative cache so this works under /RepoName/ on GitHub Pages. */
const CACHE = 'market-rain-v1.1.0';
const CORE = ['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./config/stocks.json','./data/quotes.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{
    try{
      const network=await fetch(request);
      const stableRequest=new Request(request.url.split('?')[0]);
      if(network.ok){const cache=await caches.open(CACHE);cache.put(stableRequest,network.clone()).catch(()=>{});}
      return network;
    }catch{
      const cache=await caches.open(CACHE);
      const match=await cache.match(new Request(request.url.split('?')[0]));
      if(match)return match;
      if(request.mode==='navigate')return cache.match('./index.html');
      return Response.error();
    }
  })());
});

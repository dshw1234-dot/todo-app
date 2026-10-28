// 앱 껍데기만 캐시한다(데이터는 IndexedDB). 새 버전은 다음 실행 때 반영.
const CACHE = 'todo-shell-83d21ba'; // 빌드 때 vite.config.js 가 판 번호로 바꾼다. 판이 바뀌면 옛 캐시를 버린다
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // 원격 통로 동의 화면(oauth/consent/)은 캐시하지 않는다: 오프라인 대체로 앱 화면이 뜨면 안 되고, 어차피 서버가 있어야 쓴다
  if (new URL(req.url).pathname.includes('/oauth/')) return;
  // 화면(index.html)은 HTTP 캐시를 거치지 않고 서버에 확인한다: GitHub Pages 가 max-age=600 을 보내
  // 배포 뒤 10분 동안은 앱을 다시 열어도 옛 판이 떴다(2026-10-24). 해시가 붙은 js·css 는 그대로.
  e.respondWith(
    fetch(req, req.mode === 'navigate' ? { cache: 'no-cache' } : undefined).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match(self.registration.scope)))
  );
});

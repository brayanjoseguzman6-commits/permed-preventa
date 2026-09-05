/* Service worker: guarda la app en el teléfono para que abra sin señal.
   Al publicar una versión nueva, cambie el número de CACHE. */
const CACHE = "preventa-v2";
const BASICOS = [
  "./", "./index.html", "./manifest.json", "./firebase-config.js", "./empresa.js",
  "./qrcode.js", "./leaflet.js", "./leaflet.css",
  "./images/marker-icon.png", "./images/marker-icon-2x.png", "./images/marker-shadow.png"
  /* 🪤 Los logos y los iconos NO van en esta lista mientras no existan.
     `addAll` es todo-o-nada: un solo archivo que devuelva 404 tumba la
     instalacion entera del service worker, y entonces la app deja de
     funcionar sin senal SIN DECIR NADA. Cuando la empresa ponga sus
     imagenes, se agregan aqui:
       "./logo.png", "./logo-oscuro.png", "./icon-192.png",
       "./icon-512.png", "./icon-maskable-512.png"  */
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Firestore y Auth siempre van a la red
  if (url.hostname.endsWith("googleapis.com") && !url.hostname.startsWith("www.gstatic")) return;

  /* Librerias de otros servidores (Leaflet, Firebase, Excel).
     ANTES: se guardaba la primera copia que llegara y despues SIEMPRE se
     servia esa. Si un dia bajaba a medias por mala senal, quedaba una
     copia rota guardada para siempre y el mapa no volvia a armarse nunca.
     AHORA: primero la red, y lo guardado solo sirve de respaldo cuando no
     hay senal. Ademas solo se guarda lo que llego completo. */
  if (url.origin !== location.origin){
    e.respondWith(
      fetch(e.request).then(resp => {
        const sirve = resp && (resp.ok || resp.type === "opaque") && resp.status !== 404;
        if (sirve){
          const copia = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Archivos de la app: primero red, y si no hay señal, lo guardado
  e.respondWith(
    fetch(e.request).then(resp => {
      const copia = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copia));
      return resp;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});

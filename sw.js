/* Service worker: guarda la app en el teléfono para que abra sin señal.
   Al publicar una versión nueva, cambie el número de CACHE. */
const CACHE = "preventa-v62";
/* El mapa va en su propia caja, que NO se borra al publicar (13-09-2026:
   «un mapa fijo, que nomás entre y ya esté ahí»). Antes cada versión nueva
   tiraba las calles guardadas y el teléfono las volvía a pedir con la
   señal de la calle. */
const CACHE_MAPA = "mapa-1";
const TOPE_MAPA = 2000, QUEDAN_MAPA = 1600;
const BASICOS = [
  "./", "./index.html", "./manifest.json", "./supa-config.js",
  "./supa-red.js", "./supa-consulta.js", "./supa-db.js", "./empresa.js",
  "./qrcode.js", "./leaflet.js", "./leaflet.css", "./maplibre-gl.js", "./maplibre-gl.css", "./estilo-nitido.js",
  "./images/marker-icon.png", "./images/marker-icon-2x.png", "./images/marker-shadow.png",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./badge-96.png"
  /* 🪤 Los DOS LOGOS de la empresa siguen fuera de esta lista porque
     todavia no existen: `logo.png` y `logo-oscuro.png` los pone la empresa
     (ver MARCA.md). `addAll` es todo-o-nada: un solo archivo que
     devuelva 404 tumba la instalacion entera del service worker, y
     entonces la app deja de funcionar sin senal SIN DECIR NADA. Cuando
     lleguen, se agregan aqui:
       "./logo.png", "./logo-oscuro.png"
     Los tres iconos de arriba SI estan puestos (05-09-2026): son del
     programa, no de la empresa, y sin ellos Chrome no ofrece instalar
     la app. */
];

/* La ficha de la empresa también le sirve al service worker: de ahí sale
   la dirección del chat y el nombre que lleva el aviso. `empresa.js` se
   escribe para la página (`window.EMPRESA`); aquí no hay `window`, así que
   se le presta `self`. Si no carga, el chat con la app cerrada no avisa,
   pero la app abre igual. */
try { self.window = self.window || self; importScripts("./empresa.js"); } catch(e){}
const EMP = self.EMPRESA || {};

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== CACHE_MAPA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Servidores de mapa: mosaicos, letras y dibujitos
function esDeMapa(url){
  const h = url.hostname;
  return h.endsWith("openfreemap.org") || h.endsWith("tile.openstreetmap.org") || h.endsWith("arcgisonline.com");
}
/* Lo que no cambia nunca: los mosaicos de OpenFreeMap llevan la fecha en la
   dirección (/planet/20260906_.../14/x/y.pbf), igual que las letras y los
   dibujitos. Lo único que cambia es el índice /planet, que dice cuál es la
   fecha vigente. */
function esFijo(url){
  return /\.(pbf|png|jpe?g|webp|json)$/i.test(url.pathname) && url.pathname !== "/planet"
    || /\/tile\//.test(url.pathname) || /\/sprites\//.test(url.pathname) || /\/fonts\//.test(url.pathname);
}

let guardadosMapa = 0;
function guardarMapa(req, resp){
  // Solo lo que llegó completo y legible. Una respuesta opaca pesa en la
  // cuota del teléfono como si fueran megas y llenaría la caja.
  if (!resp || !resp.ok) return;
  const copia = resp.clone(), medir = resp.clone();
  /* Ni lo que llegó vacío (Brayan, 13-09-2026: al alejar y acercar, el
     mapa quedaba gris). OpenFreeMap a veces contesta 200 sin nada adentro;
     guardado, ese cuadro quedaba gris para siempre en ese teléfono, porque
     lo guardado ya no se vuelve a pedir. */
  medir.arrayBuffer().then(b => {
    if (!b || !b.byteLength) return;
    return caches.open(CACHE_MAPA).then(c => c.put(req, copia).then(() => {
      if (++guardadosMapa % 100) return;
      return c.keys().then(ks => {
        if (ks.length <= TOPE_MAPA) return;
        // Se van los más viejos: keys() los da en el orden en que se guardaron
        return Promise.all(ks.slice(0, ks.length - QUEDAN_MAPA).map(k => c.delete(k)));
      });
    }));
  }).catch(() => {});
}

/* Lo guardado vacío (de antes de este arreglo) se bota y se vuelve a pedir:
   así se curan solos los teléfonos que ya tienen cuadros grises. */
function guardadoSano(req){
  return caches.match(req).then(g => !g ? null : g.clone().arrayBuffer().then(b => {
    if (b && b.byteLength) return g;
    return caches.open(CACHE_MAPA).then(c => c.delete(req)).then(() => null);
  }, () => g));
}

function delMapa(e, url){
  if (esFijo(url)){
    // Primero lo guardado; a la red solo lo que nunca se ha visto
    e.respondWith(guardadoSano(e.request).then(g => g || fetch(e.request).then(resp => {
      guardarMapa(e.request, resp);
      return resp;
    })));
    return;
  }
  // El índice: se usa el guardado de un solo y se refresca por detrás
  const guardado = caches.match(e.request);
  const red = guardado.then(() => fetch(e.request)).then(resp => { guardarMapa(e.request, resp); return resp; });
  e.waitUntil(red.catch(() => {}));
  e.respondWith(guardado.then(g => g || red));
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Firestore y Auth siempre van a la red
  if (url.hostname.endsWith("googleapis.com") && !url.hostname.startsWith("www.gstatic")) return;
  // El chat del equipo tampoco: los audios son privados y ya vienen con su dueño
  if (CHAT_SERVIDOR && url.origin === new URL(CHAT_SERVIDOR).origin) return;

  if (esDeMapa(url)) return delMapa(e, url);

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

  /* Archivos fijos de la app (maplibre-gl.js pesa 800 KB): primero lo
     guardado. Cada versión nueva cambia CACHE y los vuelve a bajar enteros
     al instalarse, así que nunca queda uno viejo. */
  const pagina = url.pathname.endsWith("/") || url.pathname.endsWith(".html");
  if (!pagina && /\.(js|css|png|jpe?g|svg|webp|json|woff2?|mp3)$/i.test(url.pathname)){
    e.respondWith(caches.match(e.request).then(g => g || fetch(e.request).then(resp => {
      if (resp.ok){
        const copia = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
      }
      return resp;
    })));
    return;
  }

  // La página: primero red, y si no hay señal, lo guardado
  e.respondWith(
    fetch(e.request).then(resp => {
      const copia = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copia));
      return resp;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});

/* ===== El chat con la app cerrada (Brayan, 13-09-2026) =====
   «que caigan notificaciones como de WhatsApp, e iguales llamadas». El
   servidor del chat manda el aviso (Web Push) solo si la app no está a la
   vista; aquí se enseña. Una llamada repica: el servidor vuelve a mandar
   el mismo aviso cada 15 s mientras suena (antes cada 5 s: mandar un push
   de alta prioridad tan seguido sin que hubiera nada nuevo que enseñar
   parece bajarle la prioridad a los siguientes en Android/FCM, y el
   teléfono dejaba de recibirlos tras varias llamadas seguidas), y con
   renotify vuelve a sonar y vibrar. Si nadie contesta, el último la
   cambia por «Llamada perdida».
   En la app de Android (TWA) el tono y la vibración de la llamada ya no
   salen de este aviso: ServicioAvisos lo enseña silencioso y
   ServicioLlamada lo hace sonar en bucle en primer plano hasta que se
   contesta, se rechaza o se cierra (ver preventa-android, 13-09-2026). En
   Chrome de escritorio o si la app no está instalada, sigue sonando el
   aviso normal del navegador. La dirección sale de empresa.js (`chatUrl`). */
const CHAT_SERVIDOR = EMP.chatUrl || "";

function cerrarAvisos(tag){
  if (!tag) return Promise.resolve();
  return self.registration.getNotifications({ tag }).then(ns => ns.forEach(n => n.close()));
}

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch(x){}
  /* El ícono chiquito de la barra de arriba tiene que ser una silueta blanca
     sin fondo: con el ícono de colores, Android pintaba un cuadro blanco. */
  const op = { icon: "./icon-192.png", badge: "./badge-96.png", lang: "es", data: d, body: d.cuerpo || "" };
  let titulo = d.titulo || EMP.app || EMP.nombre || "Preventa", antes = null;
  if (d.tipo === "llamada"){
    titulo = "\ud83d\udcde " + titulo;
    Object.assign(op, { tag: "ll-" + d.llamada, renotify: true, requireInteraction: true,
      vibrate: [900, 400, 900, 400, 900],
      actions: [{ action: "contestar", title: "Contestar" }, { action: "rechazar", title: "Rechazar" }] });
  } else if (d.tipo === "perdida"){
    antes = "ll-" + d.llamada;
    titulo = "\ud83d\udcde " + titulo;
    Object.assign(op, { tag: "perdida-" + d.chat, renotify: true, vibrate: [200] });
  } else {
    Object.assign(op, { tag: d.chat ? "chat-" + d.chat : "chat", renotify: true, vibrate: [200, 100, 200] });
  }
  let listo = cerrarAvisos(antes).then(() => self.registration.showNotification(titulo, op));
  /* El teléfono acusa cuándo le cayó el timbre (Brayan, 13-09-2026: «me
     cayó la notificación hasta que ya había cortado»): así se sabe si el
     atraso es del servidor o del teléfono. Si ya no suena, se quita. */
  if (d.tipo === "llamada" && d.firma && CHAT_SERVIDOR){
    listo = listo.then(() => fetch(CHAT_SERVIDOR + "/chat/llego", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llamada: d.llamada, uid: d.uid, firma: d.firma, enviado: d.enviado })
    })).then(r => r.json()).then(r => {
      if (r.sonando === false) return cerrarAvisos("ll-" + d.llamada);
    }).catch(() => {});
  }
  e.waitUntil(listo);
});

self.addEventListener("notificationclick", e => {
  const d = (e.notification && e.notification.data) || {};
  e.notification.close();
  if (e.action === "rechazar" && d.llamada && CHAT_SERVIDOR){
    e.waitUntil(fetch(CHAT_SERVIDOR + "/chat/rechazar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llamada: d.llamada, uid: d.uid, firma: d.firma })
    }).catch(() => {}));
    return;
  }
  const abrir = { chat: d.chat || null, contestar: d.tipo === "llamada" ? d.llamada : null };
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => new URL(x.url).origin === location.origin);
    if (c){ c.postMessage({ chatAbrir: abrir }); return c.focus(); }
    const q = new URLSearchParams();
    if (abrir.chat) q.set("chat", abrir.chat);
    if (abrir.contestar) q.set("contestar", abrir.contestar);
    return self.clients.openWindow("./?" + q.toString());
  }));
});

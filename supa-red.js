/* supa-red.js — el camino a Supabase: sesión, llamadas, copia local y bandeja
   de salida. Aquí NO hay nada de Firestore; eso vive en supa-db.js.

   Por qué está partido en dos: esta mitad es la que se puede probar sin
   navegador (habla HTTP y IndexedDB) y la otra es la que imita la forma de
   Firebase. Mezclarlas hacía un archivo imposible de leer.

   Tres cosas viven aquí:
     - La sesión: entrar, renovar el token antes de que venza, salir.
     - La copia local en IndexedDB: todo lo leído queda guardado, así la app
       abre y trabaja sin señal.
     - La bandeja de salida: cada escritura se guarda ANTES de mandarse. Si
       el teléfono se apaga con el pedido a medio mandar, al abrir sale solo.
       Cada lote lleva su id: mandarlo dos veces no escribe dos veces
       (lotes_hechos, del lado de la base).
*/
(function (raiz) {
  "use strict";

  var BASE = "dpreventa";       // nombre de la base local
  var VERSION_BASE = 1;
  var MARGEN_TOKEN = 60000;     // se renueva un minuto antes de vencer

  /* --------------------------------------------------------------- estado */
  var cfg = { url: "", clave: "" };
  var sesion = null;            // {access_token, refresh_token, vence, usuario}
  var renovando = null;         // promesa en curso, para no renovar dos veces
  var bd = null;                // IndexedDB abierta, o null si no se pudo

  /* ------------------------------------------------------------ IndexedDB */
  /* Tres almacenes:
       docs   clave "coleccion/id"  -> {col, id, datos, v, b}
       marcas clave coleccion       -> hasta cuándo se pidió lo cambiado
       salida clave lote_id         -> el lote pendiente de mandar
     Si el navegador no deja abrir IndexedDB (incógnito, almacenamiento
     bloqueado) la app sigue: se queda sin copia local, no sin app. */
  function abrirBase() {
    if (bd) return Promise.resolve(bd);
    return new Promise(function (listo) {
      var pet;
      try { pet = indexedDB.open(BASE, VERSION_BASE); } catch (e) { return listo(null); }
      pet.onupgradeneeded = function () {
        var d = pet.result;
        if (!d.objectStoreNames.contains("docs")) d.createObjectStore("docs");
        if (!d.objectStoreNames.contains("marcas")) d.createObjectStore("marcas");
        if (!d.objectStoreNames.contains("salida")) d.createObjectStore("salida");
      };
      pet.onsuccess = function () { bd = pet.result; listo(bd); };
      pet.onerror = function () { listo(null); };
      pet.onblocked = function () { listo(null); };
    });
  }

  function esPeticion(r) {
    return !!r && typeof raiz.IDBRequest === "function" && r instanceof raiz.IDBRequest;
  }

  function conAlmacen(nombre, modo, trabajo) {
    return abrirBase().then(function (d) {
      if (!d) return null;
      return new Promise(function (listo) {
        var tx = d.transaction(nombre, modo);
        var r = trabajo(tx.objectStore(nombre));
        /* Una petición vacía (al.get de algo que no está) trae result
           `undefined`: hay que devolver eso, NO la petición. Devolverla
           guardaba un IDBRequest como si fuera la marca de la colección y
           la copia local se rompía al siguiente guardado. */
        tx.oncomplete = function () { listo(esPeticion(r) ? r.result : r); };
        tx.onerror = function () { listo(null); };
        tx.onabort = function () { listo(null); };
      });
    });
  }

  function guardarDocs(filas) {
    if (!filas.length) return Promise.resolve();
    return conAlmacen("docs", "readwrite", function (al) {
      filas.forEach(function (f) {
        if (f.b) al.delete(f.col + "/" + f.id);      // borrado: fuera de la copia
        else al.put({ col: f.col, id: f.id, datos: f.datos, v: f.v }, f.col + "/" + f.id);
      });
    });
  }

  function leerColeccion(col) {
    return conAlmacen("docs", "readonly", function (al) {
      return new Promise(function (listo) {
        var salida = [];
        var cur = al.openCursor();
        cur.onsuccess = function () {
          var c = cur.result;
          if (!c) return listo(salida);
          if (c.value && c.value.col === col) salida.push(c.value);
          c.continue();
        };
        cur.onerror = function () { listo(salida); };
      });
    }).then(function (r) { return r || []; });
  }

  function leerDoc(col, id) {
    return conAlmacen("docs", "readonly", function (al) { return al.get(col + "/" + id); });
  }

  function marca(col) {
    return conAlmacen("marcas", "readonly", function (al) { return al.get(col); });
  }
  function ponerMarca(col, v) {
    return conAlmacen("marcas", "readwrite", function (al) { al.put(v, col); });
  }

  function ponerSalida(lote) {
    return conAlmacen("salida", "readwrite", function (al) { al.put(lote, lote.id); });
  }
  function quitarSalida(id) {
    return conAlmacen("salida", "readwrite", function (al) { al.delete(id); });
  }
  /* En orden de llegada: un pedido que se crea y después se cambia tiene que
     salir en ese orden o el cambio se pierde. */
  function verSalida() {
    return conAlmacen("salida", "readonly", function (al) {
      return new Promise(function (listo) {
        var salida = [];
        var cur = al.openCursor();
        cur.onsuccess = function () {
          var c = cur.result;
          if (!c) {
            salida.sort(function (a, b) { return a.cuando - b.cuando; });
            return listo(salida);
          }
          salida.push(c.value);
          c.continue();
        };
        cur.onerror = function () { listo(salida); };
      });
    }).then(function (r) { return r || []; });
  }

  function vaciarTodo() {
    return Promise.all(["docs", "marcas", "salida"].map(function (n) {
      return conAlmacen(n, "readwrite", function (al) { al.clear(); });
    }));
  }

  /* ----------------------------------------------------------- la sesión */
  /* El uid de siempre (el de Firebase) viaja en app_metadata.uid del token.
     Lo pone el servidor, así que el teléfono no lo puede inventar. */
  function leerToken(t) {
    try {
      var cuerpo = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(decodeURIComponent(escape(atob(cuerpo))));
    } catch (e) { return {}; }
  }

  function guardarSesion(s) {
    sesion = s;
    try {
      if (s) localStorage.setItem("dp_sesion", JSON.stringify(s));
      else localStorage.removeItem("dp_sesion");
    } catch (e) { /* sin localStorage la sesión dura lo que la pestaña */ }
  }

  function recuperarSesion() {
    try {
      var s = JSON.parse(localStorage.getItem("dp_sesion") || "null");
      if (s && s.access_token) sesion = s;
    } catch (e) { sesion = null; }
    return sesion;
  }

  function armarSesion(r) {
    var reclamos = leerToken(r.access_token);
    return {
      access_token: r.access_token,
      refresh_token: r.refresh_token,
      vence: Date.now() + (r.expires_in || 3600) * 1000,
      reclamos: reclamos,
      usuario: {
        uid: (reclamos.app_metadata && reclamos.app_metadata.uid) || r.user.id,
        id: r.user.id,
        email: r.user.email
      }
    };
  }

  function pedirAuth(ruta, cuerpo) {
    return fetch(cfg.url + "/auth/v1/" + ruta, {
      method: "POST",
      headers: { apikey: cfg.clave, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw fallo(j.error_code || j.error || "auth/error", j.msg || j.error_description || j.message || "no entró");
        return j;
      });
    });
  }

  function entrar(email, clave) {
    return pedirAuth("token?grant_type=password", { email: email, password: clave })
      .then(function (r) { guardarSesion(armarSesion(r)); return sesion.usuario; });
  }

  function salir() {
    var s = sesion;
    guardarSesion(null);
    if (!s) return Promise.resolve();
    return fetch(cfg.url + "/auth/v1/logout", {
      method: "POST",
      headers: { apikey: cfg.clave, Authorization: "Bearer " + s.access_token }
    }).catch(function () { /* salir nunca falla para quien lo pide */ });
  }

  function renovar() {
    if (renovando) return renovando;
    if (!sesion || !sesion.refresh_token) return Promise.reject(fallo("auth/sin-sesion", "sin sesión"));
    renovando = pedirAuth("token?grant_type=refresh_token", { refresh_token: sesion.refresh_token })
      .then(function (r) { guardarSesion(armarSesion(r)); renovando = null; return sesion; })
      .catch(function (e) {
        renovando = null;
        /* Sin señal NO se borra la sesión: el token viejo sigue sirviendo para
           leer de la copia local, y el día se salva. Solo se borra si el
           servidor dice que ya no vale. */
        if (e && /invalid|expired|not_found/i.test(String(e.code || ""))) guardarSesion(null);
        throw e;
      });
    return renovando;
  }

  function token() {
    if (!sesion) return Promise.resolve(null);
    if (Date.now() < sesion.vence - MARGEN_TOKEN) return Promise.resolve(sesion.access_token);
    return renovar().then(function (s) { return s.access_token; })
      .catch(function () { return sesion ? sesion.access_token : null; });
  }

  /* ------------------------------------------------------------- llamadas */
  function fallo(codigo, mensaje) {
    var e = new Error(mensaje || codigo);
    e.code = codigo;
    return e;
  }

  /* Una función de la base. Todo pasa por aquí: leer, escribir y ponerse al
     día. Si el token venció se renueva UNA vez y se repite la llamada. */
  function rpc(nombre, args, reintento) {
    return token().then(function (t) {
      return fetch(cfg.url + "/rest/v1/rpc/" + nombre, {
        method: "POST",
        headers: {
          apikey: cfg.clave,
          Authorization: "Bearer " + (t || cfg.clave),
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(args || {})
      });
    }).then(function (r) {
      return r.text().then(function (txt) {
        var j = null;
        try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
        if (r.ok) return j;
        if (r.status === 401 && !reintento && sesion) {
          return renovar().then(function () { return rpc(nombre, args, true); });
        }
        var det = (j && (j.message || j.hint || j.details)) || txt || ("HTTP " + r.status);
        throw fallo((j && j.code) || ("http/" + r.status), det);
      });
    });
  }

  function hayRed() {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }

  raiz.SupaRed = {
    configurar: function (c) { cfg = { url: String(c.url || "").replace(/\/+$/, ""), clave: c.clave || "" }; },
    config: function () { return cfg; },
    // sesión
    entrar: entrar, salir: salir, token: token, renovar: renovar,
    sesion: function () { return sesion; },
    recuperarSesion: recuperarSesion,
    leerToken: leerToken,
    // llamadas
    rpc: rpc, hayRed: hayRed, fallo: fallo,
    // copia local
    guardarDocs: guardarDocs, leerColeccion: leerColeccion, leerDoc: leerDoc,
    marca: marca, ponerMarca: ponerMarca,
    ponerSalida: ponerSalida, quitarSalida: quitarSalida, verSalida: verSalida,
    vaciarTodo: vaciarTodo
  };
})(typeof window !== "undefined" ? window : globalThis);

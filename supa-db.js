/* supa-db.js — la app cree que habla con Firebase; por dentro es Supabase.

   Por qué existe: el index.html tiene unas 250 llamadas a
   firebase.firestore() y firebase.auth(). Reescribirlas una por una era
   semanas de trabajo y un defecto por cada descuido. Esta pieza tiene la
   MISMA forma que la de Firebase, así que la app no cambia: cambia con quién
   habla.

   Cómo funciona:
     - Leer: dp_consultar() trae la colección; queda guardada en la copia
       local (IndexedDB, supa-red.js). Sin señal se contesta desde ahí.
     - En vivo: no hay escucha abierta. Cada pocos segundos dp_cambios() trae
       lo cambiado desde la última vez (una sola llamada para todas las
       colecciones que alguien esté mirando) y las listas se vuelven a pintar
       solas. Supabase no cobra por lectura, así que preguntar sale gratis.
     - Escribir: SOLO dp_lote(). La escritura se pinta al instante en la copia
       local y se manda por la bandeja de salida. Con el id del lote, mandarlo
       dos veces no escribe dos veces.

   Lo que NO imita, a propósito: subcolecciones (la app no usa ninguna) y
   arrayRemove (tampoco).
*/
(function (raiz) {
  "use strict";

  var SC = raiz.SupaConsulta;
  var red = raiz.SupaRed;
  var CADA = 6000;              // cada cuánto se pregunta por lo cambiado

  /* ------------------------------------------------- los tipos de Firebase */
  function Marca(ms) { this.__esMarca = true; this._ms = ms; }
  Marca.prototype.toMillis = function () { return this._ms; };
  Marca.prototype.toDate = function () { return new Date(this._ms); };
  Marca.prototype.valueOf = function () { return this._ms; };
  Object.defineProperty(Marca.prototype, "seconds", {
    get: function () { return Math.floor(this._ms / 1000); }
  });
  Object.defineProperty(Marca.prototype, "nanoseconds", {
    get: function () { return (this._ms % 1000) * 1e6; }
  });
  Marca.fromMillis = function (ms) { return new Marca(ms); };
  Marca.fromDate = function (d) { return new Marca(d.getTime()); };
  Marca.now = function () { return new Marca(Date.now()); };

  function Punto(lat, lng) { this.__esPunto = true; this.latitude = lat; this.longitude = lng; }

  function Orden(o) { this.__orden = o; }
  var CampoValor = {
    serverTimestamp: function () { return new Orden({ __ahora: true }); },
    increment: function (n) { return new Orden({ __inc: n }); },
    arrayUnion: function () { return new Orden({ __union: Array.prototype.slice.call(arguments).map(SC.empacar) }); },
    delete: function () { return new Orden({ __borrar: true }); }
  };

  var TIPOS = {
    marca: function (ms) { return new Marca(ms); },
    punto: function (a, b) { return new Punto(a, b); },
    ref: function (camino) { return db.doc(camino); }
  };

  /* --------------------------------------------------------- la copia viva */
  /* En memoria, para no ir a IndexedDB a cada pintada. IndexedDB es el
     respaldo que sobrevive a cerrar la app. */
  var vivo = {};                // col -> Map(id -> {id, datos, v})
  var completa = {};            // col -> ya se bajó entera alguna vez
  var hasta = {};               // col -> hasta cuándo se preguntó por cambios
  var oyentes = [];             // las listas en vivo
  var reloj = null;

  function mapa(col) {
    if (!vivo[col]) vivo[col] = new Map();
    return vivo[col];
  }

  function guardar(col, filas) {
    var m = mapa(col);
    filas.forEach(function (f) {
      if (f.b) m.delete(f.id);
      else m.set(f.id, { id: f.id, datos: f.datos, v: f.v });
      if (f.v && (!hasta[col] || f.v > hasta[col])) hasta[col] = f.v;
    });
    red.guardarDocs(filas.map(function (f) {
      return { col: col, id: f.id, datos: f.datos, v: f.v, b: f.b };
    }));
    if (hasta[col]) red.ponerMarca(col, hasta[col]);
  }

  /* La copia local de IndexedDB, una sola vez por colección. Sin ella la app
     arrancaría en blanco cada vez que se abre sin señal. */
  var cargando = {};
  function desdeDisco(col) {
    if (cargando[col]) return cargando[col];
    cargando[col] = red.leerColeccion(col).then(function (filas) {
      var m = mapa(col);
      filas.forEach(function (f) { if (!m.has(f.id)) m.set(f.id, { id: f.id, datos: f.datos, v: f.v }); });
      return red.marca(col).then(function (v) { if (v && !hasta[col]) hasta[col] = v; });
    });
    return cargando[col];
  }

  function filas(col) {
    return Array.from(mapa(col).values());
  }

  /* ------------------------------------------------------------- las fotos */
  function fotoDoc(col, fila, id, deCache) {
    var existe = !!fila;
    return {
      id: fila ? fila.id : id,
      exists: existe,
      ref: db.collection(col).doc(fila ? fila.id : id),
      data: function () { return existe ? SC.revivir(fila.datos, TIPOS) : undefined; },
      get: function (campo) { return SC.campoDe(fila || { datos: {} }, campo); },
      metadata: { fromCache: !!deCache, hasPendingWrites: false }
    };
  }

  function fotoLista(col, lista, deCache, antes) {
    var docs = lista.map(function (f) { return fotoDoc(col, f, f.id, deCache); });
    var previos = antes || [];
    return {
      docs: docs,
      size: docs.length,
      empty: !docs.length,
      metadata: { fromCache: !!deCache, hasPendingWrites: false },
      forEach: function (f) { docs.forEach(f); },
      docChanges: function () {
        var viejos = {};
        previos.forEach(function (f) { viejos[f.id] = f; });
        var cambios = [];
        lista.forEach(function (f, i) {
          if (!viejos[f.id]) cambios.push({ type: "added", doc: docs[i], newIndex: i, oldIndex: -1 });
          else if (viejos[f.id].v !== f.v) cambios.push({ type: "modified", doc: docs[i], newIndex: i, oldIndex: i });
          delete viejos[f.id];
        });
        Object.keys(viejos).forEach(function (id) {
          cambios.push({ type: "removed", doc: fotoDoc(col, viejos[id], id, deCache), newIndex: -1, oldIndex: 0 });
        });
        return cambios;
      }
    };
  }

  /* ---------------------------------------------------------- leer del día */
  function traer(col, plan) {
    return red.rpc("dp_consultar", {
      col: col,
      filtros: (plan.filtros || []).map(function (f) { return [f[0], f[1], SC.empacar(f[2])]; }),
      orden: plan.orden || [],
      limite: plan.limite == null ? null : plan.limite
    }).then(function (filas) {
      filas = filas || [];
      /* Lo que el servidor NO mandó y aquí sí está, sobra: se borró, se ocultó
         por las reglas, o es una escritura que quedó pintada y fue rechazada.
         Solo se puede concluir eso cuando se pidió todo (o un id suelto). */
      var completo = !plan.filtros.length && plan.limite == null;
      var unId = plan.filtros.length === 1 && plan.filtros[0][0] === "__id" && plan.filtros[0][1] === "==";
      if (completo || unId) {
        var vinieron = {};
        filas.forEach(function (f) { vinieron[f.id] = true; });
        var m = mapa(col);
        (completo ? Array.from(m.keys()) : [plan.filtros[0][2]]).forEach(function (id) {
          if (!vinieron[id] && m.has(id)) { m.delete(id); red.guardarDocs([{ col: col, id: id, b: true }]); }
        });
      }
      guardar(col, filas);
      if (completo) completa[col] = true;
      return filas;
    });
  }

  /* Lo cambiado desde la última vez, de todas las colecciones que alguien
     está mirando, en UNA sola llamada. */
  function alDia() {
    var cols = {};
    oyentes.forEach(function (o) { if (completa[o.col]) cols[o.col] = hasta[o.col] || "-infinity"; });
    if (!Object.keys(cols).length) return Promise.resolve(false);
    return red.rpc("dp_cambios", { desde: cols }).then(function (filas) {
      if (!filas || !filas.length) return false;
      var porCol = {};
      filas.forEach(function (f) { (porCol[f.c] = porCol[f.c] || []).push(f); });
      Object.keys(porCol).forEach(function (col) { guardar(col, porCol[col]); });
      avisar(Object.keys(porCol));
      return true;
    }).catch(function () { return false; });   // sin señal se sigue con la copia
  }

  function latir() {
    if (reloj || typeof setInterval !== "function") return;
    reloj = setInterval(function () {
      if (!oyentes.length || !red.hayRed()) return;
      alDia();
      vaciarSalida();
    }, CADA);
  }

  function avisar(cols) {
    oyentes.forEach(function (o) {
      if (cols && cols.indexOf(o.col) < 0) return;
      emitir(o, true);
    });
  }

  function emitir(o, deCache) {
    var lista = SC.consultar(filas(o.col), o.plan);
    var sello = lista.map(function (f) { return f.id + ":" + f.v; }).join("|");
    if (sello === o.sello) return;
    var antes = o.ultima || [];
    o.sello = sello;
    o.ultima = lista;
    try { o.alVer(fotoLista(o.col, lista, deCache, antes)); }
    catch (e) { if (o.alFallar) o.alFallar(e); }
  }

  /* ------------------------------------------------------------- escribir */
  /* Lo mismo que hace el servidor, para pintarlo al instante. La verdad sigue
     siendo la del servidor: cuando llega por dp_cambios, esto se reemplaza. */
  function resolver(v, previo) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (v.__ahora) return { __ts: Date.now() };
      if (v.__inc !== undefined) return (typeof previo === "number" ? previo : 0) + v.__inc;
      if (v.__union) {
        var base = Array.isArray(previo) ? previo.slice() : [];
        v.__union.forEach(function (x) {
          if (!base.some(function (y) { return JSON.stringify(y) === JSON.stringify(x); })) base.push(x);
        });
        return base;
      }
      if (v.__borrar) return undefined;
      var o = {};
      Object.keys(v).forEach(function (k) {
        var r = resolver(v[k], previo && typeof previo === "object" ? previo[k] : undefined);
        if (r !== undefined) o[k] = r;
      });
      return o;
    }
    return v;
  }

  function fundir(base, cambios) {
    var o = Object.assign({}, base || {});
    Object.keys(cambios).forEach(function (k) {
      var v = cambios[k];
      if (v && typeof v === "object" && v.__borrar) { delete o[k]; return; }
      var r = resolver(v, o[k]);
      if (r === undefined) delete o[k];
      else if (r && typeof r === "object" && !Array.isArray(r) && o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) && !(v.__ts || v.__geo || v.__ref)) o[k] = fundir(o[k], v);
      else o[k] = r;
    });
    return o;
  }

  /* update(): "entrega.hora" cambia solo ese campo de adentro. */
  function juntar(base, cambios) {
    var o = Object.assign({}, base || {});
    Object.keys(cambios).forEach(function (clave) {
      var partes = clave.split(".");
      var nodo = o;
      for (var i = 0; i < partes.length - 1; i++) {
        nodo[partes[i]] = Object.assign({}, nodo[partes[i]] || {});
        nodo = nodo[partes[i]];
      }
      var ultima = partes[partes.length - 1];
      var r = resolver(cambios[clave], nodo[ultima]);
      if (r === undefined) delete nodo[ultima];
      else nodo[ultima] = r;
    });
    return o;
  }

  function pintarLocal(op) {
    var m = mapa(op.col);
    var previo = m.get(op.id);
    var antes = previo ? previo.datos : null;
    var nuevo;
    if (op.op === "anular") { m.delete(op.id); avisar([op.col]); return; }
    if (op.op === "poner") nuevo = resolver(op.datos, null);
    else if (op.op === "mezclar") nuevo = fundir(antes, op.datos);
    else nuevo = juntar(antes, op.datos);
    m.set(op.id, { id: op.id, datos: nuevo, v: previo ? previo.v : "0" });
    avisar([op.col]);
  }

  /* Lo que el servidor RECHAZA hay que despintarlo, o en la pantalla queda un
     pedido que no existe y el preventa lo da por hecho. (Firestore hace lo
     mismo: la escritura negada se deshace sola en el teléfono.) */
  function fotoPrevia(ops) {
    return ops.map(function (op) {
      var f = mapa(op.col).get(op.id);
      return { col: op.col, id: op.id, antes: f ? { id: f.id, datos: f.datos, v: f.v } : null };
    });
  }

  function despintar(previas) {
    var cols = {};
    previas.forEach(function (p) {
      if (p.antes) mapa(p.col).set(p.id, p.antes);
      else mapa(p.col).delete(p.id);
      cols[p.col] = true;
    });
    avisar(Object.keys(cols));
  }

  var enviando = false;
  function vaciarSalida() {
    if (enviando || !red.hayRed()) return Promise.resolve();
    enviando = true;
    return red.verSalida().then(function (lotes) {
      return lotes.reduce(function (cadena, lote) {
        return cadena.then(function () {
          return red.rpc("dp_lote", { ops: lote.ops, lote_id: lote.id })
            .then(function () { return red.quitarSalida(lote.id); })
            .catch(function (e) {
              /* Un lote que el servidor RECHAZA (reglas, datos malos) no se
                 puede reintentar para siempre: taparía la cola entera. Se
                 saca y queda anotado. Lo que es falta de señal sí se repite. */
              if (e && /^http\/(4\d\d)$/.test(String(e.code)) && e.code !== "http/401") {
                return red.quitarSalida(lote.id).then(function () {
                  anotarRechazo(lote, e);
                  /* El lote ya estaba pintado aquí (se pintó al mandarlo, quizá
                     en otra sesión). Como se rechazó, hay que volver a preguntar
                     por esos documentos: traer() borra de la copia local lo que
                     el servidor ya no devuelve. */
                  return refrescar(lote.ops);
                });
              }
              throw e;
            });
        });
      }, Promise.resolve());
    }).then(function () { enviando = false; }, function () { enviando = false; });
  }

  /* Vuelve a preguntar por los documentos que tocaba un lote, uno por uno. */
  function refrescar(ops) {
    var vistos = {};
    return ops.reduce(function (cadena, op) {
      var clave = op.col + "/" + op.id;
      if (vistos[clave]) return cadena;
      vistos[clave] = true;
      return cadena.then(function () {
        return traer(op.col, { filtros: [["__id", "==", op.id]], orden: [], limite: 1 })
          .catch(function () { /* sin señal: queda como está */ });
      });
    }, Promise.resolve());
  }

  var rechazos = [];
  function anotarRechazo(lote, e) {
    rechazos.push({ cuando: Date.now(), lote: lote, por: String(e && (e.message || e.code)) });
    if (raiz.console) raiz.console.error("lote rechazado", lote.id, e);
  }

  /* Manda las ops. Se resuelve cuando el servidor contesta, igual que
     Firestore: sin señal la promesa espera, y la app ya está hecha para eso
     (lo que se ve en pantalla sale de la copia local, no de la promesa). */
  function mandar(ops) {
    var previas = fotoPrevia(ops);
    ops.forEach(pintarLocal);
    var lote = { id: nuevoId(20), cuando: Date.now(), ops: ops };
    return red.ponerSalida(lote).then(function () {
      if (!red.hayRed()) return new Promise(function () { /* espera a la señal */ });
      return red.rpc("dp_lote", { ops: ops, lote_id: lote.id })
        .then(function (r) {
          red.quitarSalida(lote.id);
          if (r && r.v) Object.keys(r.v).forEach(function (clave) {
            var p = clave.split("/"), m = vivo[p[0]], f = m && m.get(p[1]);
            if (f) f.v = r.v[clave];
          });
          return r;
        })
        .catch(function (e) {
          if (e && /^http\/4/.test(String(e.code)) && e.code !== "http/401") {
            return red.quitarSalida(lote.id).then(function () { despintar(previas); throw e; });
          }
          throw e;   // sin señal: queda en la bandeja y sale solo
        });
    });
  }

  var ABC = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  function nuevoId(n) {
    var s = "";
    for (var i = 0; i < (n || 20); i++) s += ABC[Math.floor(Math.random() * ABC.length)];
    return s;
  }

  /* ------------------------------------------------------- la cara de la db */
  function Consulta(col, plan) {
    this.col = col;
    this.plan = plan || { filtros: [], orden: [], limite: null };
  }
  Consulta.prototype._con = function (cambio) {
    var p = { filtros: this.plan.filtros.slice(), orden: this.plan.orden.slice(), limite: this.plan.limite };
    cambio(p);
    return new Consulta(this.col, p);
  };
  Consulta.prototype.where = function (campo, oper, valor) {
    return this._con(function (p) { p.filtros.push([campo, oper, valor]); });
  };
  Consulta.prototype.orderBy = function (campo, dir) {
    return this._con(function (p) { p.orden.push([campo, dir || "asc"]); });
  };
  Consulta.prototype.limit = function (n) {
    return this._con(function (p) { p.limite = n; });
  };
  Consulta.prototype.get = function () {
    var yo = this;
    return desdeDisco(yo.col).then(function () {
      if (!red.hayRed()) return SC.consultar(filas(yo.col), yo.plan);
      return traer(yo.col, yo.plan).then(function (r) { return r; },
        function () { return SC.consultar(filas(yo.col), yo.plan); });
    }).then(function (lista) {
      var deCache = !red.hayRed();
      return fotoLista(yo.col, lista.map(function (f) { return { id: f.id, datos: f.datos, v: f.v }; }), deCache);
    });
  };
  Consulta.prototype.onSnapshot = function (a, b) {
    var yo = this;
    var opciones = (a && typeof a === "object" && !a.next) ? null : null;
    var alVer = typeof a === "function" ? a : (a && a.next);
    var alFallar = typeof b === "function" ? b : (a && a.error);
    var o = { col: yo.col, plan: yo.plan, alVer: alVer, alFallar: alFallar, sello: null, ultima: [] };
    oyentes.push(o);
    latir();
    desdeDisco(yo.col).then(function () {
      emitir(o, true);                                  // lo que ya se tenía, al instante
      if (!red.hayRed()) return;
      // la lista en vivo necesita la colección entera: los cambios llegan por colección
      return traer(yo.col, { filtros: [], orden: [], limite: null })
        .then(function () { emitir(o, false); })
        .catch(function (e) { if (alFallar) alFallar(e); });
    });
    return function () {
      var i = oyentes.indexOf(o);
      if (i >= 0) oyentes.splice(i, 1);
    };
  };
  Consulta.prototype.doc = function (id) { return new Referencia(this.col, id || nuevoId()); };
  Consulta.prototype.add = function (datos) {
    var r = this.doc(nuevoId());
    return r.set(datos).then(function () { return r; });
  };

  function Referencia(col, id) {
    this.__esRef = true;
    this.id = id;
    this.col = col;
    this.camino = col + "/" + id;
    this.path = this.camino;
    this.parent = { id: col };
  }
  Referencia.prototype.set = function (datos, opciones) {
    return mandar([{ col: this.col, id: this.id, op: (opciones && opciones.merge) ? "mezclar" : "poner", datos: SC.empacar(datos) }]);
  };
  Referencia.prototype.update = function (datos) {
    return mandar([{ col: this.col, id: this.id, op: "juntar", datos: SC.empacar(datos) }]);
  };
  Referencia.prototype.delete = function () {
    return mandar([{ col: this.col, id: this.id, op: "anular" }]);
  };
  Referencia.prototype.get = function () {
    var yo = this;
    return desdeDisco(yo.col).then(function () {
      if (!red.hayRed()) return null;
      return traer(yo.col, { filtros: [["__id", "==", yo.id]], orden: [], limite: 1 }).catch(function () { return null; });
    }).then(function () {
      return fotoDoc(yo.col, mapa(yo.col).get(yo.id), yo.id, !red.hayRed());
    });
  };
  Referencia.prototype.onSnapshot = function (a, b) {
    var alVer = typeof a === "function" ? a : (a && a.next);
    var yo = this;
    return new Consulta(this.col, { filtros: [["__id", "==", this.id]], orden: [], limite: 1 })
      .onSnapshot(function (foto) { alVer(foto.docs[0] || fotoDoc(yo.col, null, yo.id, foto.metadata.fromCache)); },
                  typeof b === "function" ? b : (a && a.error));
  };

  /* ---------------------------------------------------------- lote y trato */
  function Lote() { this.ops = []; }
  Lote.prototype.set = function (ref, datos, opciones) {
    this.ops.push({ col: ref.col, id: ref.id, op: (opciones && opciones.merge) ? "mezclar" : "poner", datos: SC.empacar(datos) });
    return this;
  };
  Lote.prototype.update = function (ref, datos) {
    this.ops.push({ col: ref.col, id: ref.id, op: "juntar", datos: SC.empacar(datos) });
    return this;
  };
  Lote.prototype.delete = function (ref) {
    this.ops.push({ col: ref.col, id: ref.id, op: "anular" });
    return this;
  };
  Lote.prototype.commit = function () { return mandar(this.ops); };

  /* runTransaction: se lee anotando la versión y al guardar se exige que siga
     igual. Si alguien la cambió mientras tanto, la base falla y se repite,
     como hace Firestore. */
  function enTrato(trabajo, vuelta) {
    var leidas = {};
    var ops = [];
    var t = {
      get: function (ref) {
        return ref.get().then(function (foto) {
          var f = mapa(ref.col).get(ref.id);
          leidas[ref.camino] = f ? f.v : "nuevo";
          return foto;
        });
      },
      set: function (ref, datos, opciones) {
        ops.push({ col: ref.col, id: ref.id, op: (opciones && opciones.merge) ? "mezclar" : "poner",
                   datos: SC.empacar(datos), si_version: leidas[ref.camino] });
        return t;
      },
      update: function (ref, datos) {
        ops.push({ col: ref.col, id: ref.id, op: "juntar", datos: SC.empacar(datos), si_version: leidas[ref.camino] });
        return t;
      },
      delete: function (ref) {
        ops.push({ col: ref.col, id: ref.id, op: "anular", si_version: leidas[ref.camino] });
        return t;
      }
    };
    return Promise.resolve(trabajo(t)).then(function (r) {
      if (!ops.length) return r;
      return red.rpc("dp_lote", { ops: ops, lote_id: nuevoId(20) }).then(function () {
        ops.forEach(pintarLocal);
        return r;
      }).catch(function (e) {
        if ((vuelta || 0) < 5 && /40001|serial/i.test(String(e.code) + String(e.message))) {
          return enTrato(trabajo, (vuelta || 0) + 1);
        }
        throw e;
      });
    });
  }

  var db = {
    collection: function (col) { return new Consulta(col, { filtros: [], orden: [], limite: null }); },
    doc: function (camino) {
      var p = String(camino).split("/");
      return new Referencia(p[0], p[1]);
    },
    batch: function () { return new Lote(); },
    runTransaction: function (f) { return enTrato(f, 0); },
    enablePersistence: function () { return Promise.resolve(); },   // siempre encendida
    settings: function () { },
    waitForPendingWrites: function () { return vaciarSalida(); },
    terminate: function () { if (reloj) clearInterval(reloj); reloj = null; return Promise.resolve(); },
    clearPersistence: function () { return red.vaciarTodo(); },
    /* Para el Diagnóstico: qué hay sin mandar y qué se rechazó. */
    _pendientes: function () { return red.verSalida(); },
    _rechazos: function () { return rechazos.slice(); }
  };

  /* --------------------------------------------------------------- entrar */
  var oyentesSesion = [];
  var usuario = null;

  function armarUsuario(u) {
    if (!u) return null;
    return {
      uid: u.uid,
      email: u.email,
      getIdToken: function () { return red.token(); },
      getIdTokenResult: function () {
        return red.token().then(function (t) {
          var r = red.leerToken(t || "");
          return { token: t, claims: Object.assign({ uid: u.uid }, r.app_metadata || {}, r.user_metadata || {}) };
        });
      },
      updatePassword: function (clave) { return cambiarClave(clave); },
      reauthenticateWithCredential: function (cred) { return red.entrar(cred.email, cred.password); }
    };
  }

  function avisarSesion() {
    oyentesSesion.forEach(function (f) { try { f(usuario); } catch (e) { } });
  }

  function cambiarClave(clave) {
    return red.token().then(function (t) {
      return fetch(red.config().url + "/auth/v1/user", {
        method: "PUT",
        headers: { apikey: red.config().clave, Authorization: "Bearer " + t, "Content-Type": "application/json" },
        body: JSON.stringify({ password: clave })
      }).then(function (r) { if (!r.ok) throw red.fallo("auth/clave", "no se pudo cambiar la clave"); });
    });
  }

  var auth = {
    get currentUser() { return usuario; },
    onAuthStateChanged: function (f) {
      oyentesSesion.push(f);
      Promise.resolve().then(function () { f(usuario); });
      return function () {
        var i = oyentesSesion.indexOf(f);
        if (i >= 0) oyentesSesion.splice(i, 1);
      };
    },
    signInWithEmailAndPassword: function (email, clave) {
      return red.entrar(email, clave).then(function (u) {
        usuario = armarUsuario(u);
        avisarSesion();
        return { user: usuario };
      });
    },
    signOut: function () {
      return red.salir().then(function () {
        usuario = null;
        vivo = {}; completa = {}; hasta = {}; cargando = {};
        avisarSesion();
        return red.vaciarTodo();
      });
    },
    sendPasswordResetEmail: function (email) {
      return fetch(red.config().url + "/auth/v1/recover", {
        method: "POST",
        headers: { apikey: red.config().clave, "Content-Type": "application/json" },
        body: JSON.stringify({ email: email })
      }).then(function () { });
    },
    createUserWithEmailAndPassword: function (email, clave) {
      /* Crear cuentas exige la llave de servicio, y esa llave NUNCA puede
         estar en el teléfono. Lo hace una función del servidor de Supabase
         (supabase/functions/alta), que antes comprueba con la base que quien
         llama sea de oficina. */
      return red.token().then(function (t) {
        return fetch(red.config().url + "/functions/v1/alta", {
          method: "POST",
          headers: { apikey: red.config().clave, Authorization: "Bearer " + t,
                     "Content-Type": "application/json" },
          body: JSON.stringify({ correo: email, clave: clave })
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) {
            if (!r.ok) throw red.fallo("auth/alta", (d && d.message) || ("no se pudo dar de alta (" + r.status + ")"));
            return { user: { uid: d.uid, email: email } };
          });
        });
      });
    },
    setPersistence: function () { return Promise.resolve(); },
    updateCurrentUser: function () { return Promise.resolve(); }
  };

  /* Al abrir: si había sesión guardada, la app entra sin pedir clave. */
  function arrancar() {
    var s = red.recuperarSesion();
    if (s && s.usuario) usuario = armarUsuario(s.usuario);
    avisarSesion();
    vaciarSalida();
    if (typeof raiz.addEventListener === "function") {
      raiz.addEventListener("online", function () { vaciarSalida(); alDia(); });
    }
  }

  /* --------------------------------------------- la cara de firebase global */
  function instalar(cfg) {
    red.configurar({ url: cfg.url || cfg.supabaseUrl, clave: cfg.clave || cfg.supabaseKey });
    arrancar();
    var firestore = function () { return db; };
    firestore.FieldValue = CampoValor;
    firestore.Timestamp = Marca;
    firestore.GeoPoint = Punto;
    var autenticar = function () { return auth; };
    autenticar.Auth = { Persistence: { LOCAL: "local", SESSION: "session", NONE: "none" } };
    autenticar.EmailAuthProvider = {
      credential: function (email, clave) { return { email: email, password: clave }; }
    };
    /* La app de «alta» (crear cuentas) es una SEGUNDA conexión a propósito:
       así el administrador no pierde su sesión al dar de alta a alguien. Aquí
       se le da una cara aparte cuyo signOut NO toca la sesión de verdad; si
       usara la misma, la oficina se saldría sola en cada alta. */
    var aparte = function () {
      return {
        get currentUser() { return null; },
        setPersistence: function () { return Promise.resolve(); },
        signOut: function () { return Promise.resolve(); },
        createUserWithEmailAndPassword: auth.createUserWithEmailAndPassword
      };
    };
    raiz.firebase = {
      initializeApp: function (_cfg, nombre) {
        var a = nombre && nombre !== "[DEFAULT]" ? aparte : autenticar;
        return { name: nombre || "[DEFAULT]", auth: a, firestore: firestore };
      },
      auth: autenticar,
      firestore: firestore,
      apps: [{ name: "[DEFAULT]" }]
    };
    return { db: db, auth: auth };
  }

  raiz.SupaDb = {
    instalar: instalar, db: db, auth: auth,
    Marca: Marca, Punto: Punto, CampoValor: CampoValor,
    alDia: alDia, vaciarSalida: vaciarSalida,
    _interno: { resolver: resolver, fundir: fundir, juntar: juntar, mapa: mapa, guardar: guardar }
  };
})(typeof window !== "undefined" ? window : globalThis);

/* supa-consulta.js — las mismas reglas de Firestore, pero en el teléfono.

   Dos trabajos:
     1. Traducir los datos. En la base cada documento se guarda entero en
        jsonb, y lo que JSON no sabe escribir va marcado: {"__ts": ms} una
        fecha, {"__geo": [lat, lng]} un punto, {"__ref": "col/id"} una
        referencia. Es la MISMA marca que ya usaba el espejo, así que la app
        no nota el cambio.
     2. Filtrar y ordenar aquí mismo. Hace falta para dos cosas: contestar sin
        señal desde la copia local, y volver a pintar una lista en vivo cuando
        llega un cambio, sin preguntarle otra vez a la base.

   Lo que se filtra aquí tiene que dar EXACTAMENTE lo mismo que dp_condicion()
   de la base; si no, la lista parpadea al llegar la respuesta del servidor.
   Por eso: el campo que no está no cumple ninguna condición, y orderBy deja
   fuera al que no tiene el campo.
*/
(function (raiz) {
  "use strict";

  /* ------------------------------------------------------- las marcas */
  function esMarca(v, clave) {
    return v && typeof v === "object" && !Array.isArray(v) &&
           Object.keys(v).length === 1 && v[clave] !== undefined;
  }

  /* De la base a la app. `tipos` trae las clases que la app espera
     (Marca = Timestamp, Punto = GeoPoint, refDe = db.doc). */
  function revivir(v, tipos) {
    if (Array.isArray(v)) return v.map(function (x) { return revivir(x, tipos); });
    if (v && typeof v === "object") {
      if (esMarca(v, "__ts") && typeof v.__ts === "number") return tipos.marca(v.__ts);
      if (esMarca(v, "__geo") && Array.isArray(v.__geo)) return tipos.punto(v.__geo[0], v.__geo[1]);
      if (esMarca(v, "__ref") && typeof v.__ref === "string") return tipos.ref(v.__ref);
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = revivir(v[k], tipos); });
      return o;
    }
    return v;
  }

  /* De la app a la base. Las órdenes de FieldValue (ahora, sumar, agregar,
     borrar) pasan tal cual: las resuelve el servidor, no el teléfono, o dos
     personas sin reloj sincronizado se pisarían. */
  function empacar(v) {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (v instanceof Date) return { __ts: v.getTime() };
    if (typeof v === "object") {
      if (typeof v.toMillis === "function" && v.__esMarca) return { __ts: v.toMillis() };
      if (v.__esPunto) return { __geo: [v.latitude, v.longitude] };
      if (v.__esRef) return { __ref: v.camino };
      if (v.__orden) return v.__orden;                 // {__ahora}/{__inc}/{__union}/{__borrar}
      if (Array.isArray(v)) return v.map(empacar);
      var o = {};
      Object.keys(v).forEach(function (k) {
        var x = empacar(v[k]);
        if (x !== undefined) o[k] = x;
      });
      return o;
    }
    return v;
  }

  /* --------------------------------------------------- filtrar y ordenar */
  /* El valor de un campo, con puntos: "entrega.hora". '__id' es el id. */
  function campoDe(fila, campo) {
    if (campo === "__id") return fila.id;
    var v = fila.datos;
    var partes = campo.split(".");
    for (var i = 0; i < partes.length; i++) {
      if (v === null || typeof v !== "object") return undefined;
      v = v[partes[i]];
    }
    return v;
  }

  /* Un valor de la base (ya empacado) a algo comparable. Las fechas se
     comparan por milisegundos, como en SQL. */
  function llano(v) {
    if (esMarca(v, "__ts")) return v.__ts;
    if (v instanceof Date) return v.getTime();
    if (v && typeof v === "object" && v.__esMarca) return v.toMillis();
    return v;
  }

  function igual(a, b) {
    a = llano(a); b = llano(b);
    if (a === b) return true;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function cumple(fila, f) {
    var campo = f[0], oper = f[1], val = llano(f[2]);
    var v = campoDe(fila, campo);
    if (v === undefined) return false;          // el campo que no está no cumple nada
    v = llano(v);
    switch (oper) {
      case "==": return igual(v, val);
      case "!=": return !igual(v, val);
      case "<": return v < val;
      case "<=": return v <= val;
      case ">": return v > val;
      case ">=": return v >= val;
      case "in": return Array.isArray(val) && val.some(function (x) { return igual(v, llano(x)); });
      case "not-in": return Array.isArray(val) && !val.some(function (x) { return igual(v, llano(x)); });
      case "array-contains":
        return Array.isArray(v) && v.some(function (x) { return igual(llano(x), val); });
      case "array-contains-any":
        return Array.isArray(v) && Array.isArray(val) &&
               v.some(function (x) { return val.some(function (y) { return igual(llano(x), llano(y)); }); });
      default: return false;
    }
  }

  /* Orden estable y con el mismo criterio que la base: números entre sí,
     textos entre sí, y el id de último para desempatar. */
  function comparar(a, b) {
    if (a === b) return 0;
    if (a === undefined || a === null) return -1;
    if (b === undefined || b === null) return 1;
    var ta = typeof a, tb = typeof b;
    if (ta === "number" && tb === "number") return a < b ? -1 : 1;
    if (ta === "boolean" && tb === "boolean") return a === b ? 0 : (a ? 1 : -1);
    if (ta === "number") return -1;
    if (tb === "number") return 1;
    var sa = String(a), sb = String(b);
    return sa < sb ? -1 : (sa > sb ? 1 : 0);
  }

  function consultar(filas, plan) {
    var filtros = plan.filtros || [];
    var orden = plan.orden || [];
    var salida = filas.filter(function (fila) {
      for (var i = 0; i < filtros.length; i++) if (!cumple(fila, filtros[i])) return false;
      // orderBy deja fuera al que no tiene el campo, igual que Firestore
      for (var j = 0; j < orden.length; j++) {
        if (orden[j][0] !== "__id" && campoDe(fila, orden[j][0]) === undefined) return false;
      }
      return true;
    });
    salida.sort(function (x, y) {
      for (var i = 0; i < orden.length; i++) {
        var campo = orden[i][0], dir = (orden[i][1] || "asc") === "desc" ? -1 : 1;
        var c = comparar(llano(campoDe(x, campo)), llano(campoDe(y, campo)));
        if (c) return c * dir;
      }
      return x.id < y.id ? -1 : (x.id > y.id ? 1 : 0);
    });
    if (plan.limite != null) salida = salida.slice(0, Math.max(0, plan.limite));
    return salida;
  }

  raiz.SupaConsulta = {
    revivir: revivir, empacar: empacar, consultar: consultar,
    campoDe: campoDe, cumple: cumple, comparar: comparar, llano: llano
  };
})(typeof window !== "undefined" ? window : globalThis);

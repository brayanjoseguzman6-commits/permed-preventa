/* Que nada apunte al vacío.
   ==========================

   Estas pruebas no miran cuentas: miran que el archivo esté sano. Son las
   más baratas de correr y las que más veces han salvado la publicación,
   porque un botón que llama a una función borrada no se nota hasta que
   alguien lo toca --y el que lo toca es un vendedor parado en una tienda--.
*/
"use strict";
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { grupo, prueba, igual, cierto, falso, contiene } = require("./decir");
const { fuente, bloques, sacar, valorDeConst } = require("./leer");

grupo("La estructura del archivo");

const TXT = fuente();
const NOMBRES = [...new Set(
  [...TXT.matchAll(/(?:^|[\n;}])\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
    .map(m => m[1]))];

prueba("cada bloque de código es JavaScript válido", () => {
  const bs = bloques();
  cierto(bs.length >= 1, "tiene que haber al menos un <script> propio");
  bs.forEach((b, i) => new vm.Script(b, { filename: "bloque" + i }));
});

prueba("no quedaron marcas de un git a medio resolver", () => {
  falso(/^<<<<<<< |^>>>>>>> /m.test(TXT),
        "hay marcas de conflicto (<<<<<<< o >>>>>>>) adentro del archivo");
});

prueba("todas las funciones se pueden recortar y son válidas por sí solas", () => {
  const malas = [];
  for (const n of NOMBRES) {
    try { new vm.Script("(" + sacar(n) + ")"); }
    catch (e) { malas.push(n + " (" + String(e.message).slice(0, 60) + ")"); }
  }
  igual(malas, [], "estas funciones no se pudieron recortar");
});

prueba("ninguna función se llama dos veces con nombres distintos de cuerpo", () => {
  const repes = NOMBRES.filter((n, i) => NOMBRES.indexOf(n) !== i);
  igual(repes, [], "funciones declaradas más de una vez");
});

/* ---------------- Administrar: que cada puerta lleve a algún lado --------- */

grupo("Administrar: las puertas y las pestañas");

const GRUPOS = eval("(" + valorDeConst("GRUPOS") + ")");
const GUIA = eval("(" + valorDeConst("GUIA") + ")");
const despacho = sacar("pintarGrupo");
const definidas = new Set(NOMBRES);

// La última línea de `pintarGrupo` es el destino por defecto: la pestaña
// que no tiene su propio `if` cae ahí.
const PORDEFECTO = (/return\s+([A-Za-z_$][\w$]*)\(m\);\s*}\s*$/.exec(despacho) || [])[1];

prueba("cada pestaña despacha a una función que existe", () => {
  const sinDestino = [];
  for (const g of GRUPOS) {
    for (const [clave] of g.tabs) {
      const re = new RegExp('pestanaActual === "' + clave + '"\\s*\\) return ([A-Za-z_$][\\w$]*)');
      const m = re.exec(despacho);
      const destino = m ? m[1] : PORDEFECTO;
      if (!destino) { sinDestino.push(clave + " (no está en pintarGrupo)"); continue; }
      if (!definidas.has(destino)) sinDestino.push(clave + " → " + destino + " (no existe)");
    }
  }
  igual(sinDestino, [], "pestañas que no llevan a ningún lado");
});

prueba("el despachador tiene un destino por defecto", () => {
  cierto(PORDEFECTO && definidas.has(PORDEFECTO),
         "pintarGrupo tiene que terminar en un `return algo(m);` que exista");
});

prueba("cada pestaña tiene su línea que explica de qué se trata", () => {
  const sinGuia = [];
  for (const g of GRUPOS) {
    for (const [clave] of g.tabs) if (!GUIA[clave]) sinGuia.push(clave);
  }
  igual(sinGuia, [], "pestañas sin explicación en GUIA");
});

prueba("no hay explicaciones huérfanas de pestañas que ya no existen", () => {
  const vivas = new Set(GRUPOS.flatMap(g => g.tabs.map(t => t[0])));
  const huerfanas = Object.keys(GUIA).filter(k => !vivas.has(k));
  igual(huerfanas, [], "GUIA nombra pestañas que ya no están en GRUPOS");
});

prueba("las fichas de la portada llevan a pestañas que existen", () => {
  const vivas = new Set(GRUPOS.flatMap(g => g.tabs.map(t => t[0])));
  const destinos = [...TXT.matchAll(/data-ir="([a-zA-Z]+)"/g)].map(m => m[1]);
  const rotas = [...new Set(destinos)].filter(d => !vivas.has(d));
  igual(rotas, [], "fichas que llevan a una pestaña que no existe");
});

/* ---------------- El service worker --------------------------------------- */

grupo("El service worker");

const SW = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");

prueba("el service worker es JavaScript válido", () => {
  new vm.Script(SW, { filename: "sw.js" });
});

prueba("el CACHE tiene número de versión", () => {
  /* El nombre del CACHE lo elige cada instalación; lo que no puede
     faltar es el número de versión al final, porque de ahí lo lee
     el Diagnóstico y de ahí depende que el teléfono se actualice. */
  const m = /const CACHE = "[^"]*-v(\d+)"/.exec(SW);
  cierto(m, "el CACHE del sw.js tiene que terminar en -vN");
  cierto(Number(m[1]) > 0, "el número de versión tiene que ser mayor que cero");
});

prueba("todo lo que el service worker guarda existe en el repositorio", () => {
  const lista = /const BASICOS = \[([\s\S]*?)\]/.exec(SW);
  cierto(lista, "no se encontró la lista BASICOS");
  /* Los comentarios de adentro NO cuentan: ahí se anota qué archivos hay
     que agregar cuando la empresa ponga sus imágenes, y esos todavía no
     existen a propósito. Antes la prueba los leía como si estuvieran en
     la lista de verdad y se ponía roja sin que nada estuviera mal. */
  const soloCodigo = lista[1].replace(/\/\*[\s\S]*?\*\//g, "")
                             .replace(/\/\/[^\n]*/g, "");
  const faltan = [];
  for (const m of soloCodigo.matchAll(/"\.\/([^"]+)"/g)) {
    const archivo = path.join(__dirname, "..", m[1]);
    if (!fs.existsSync(archivo)) faltan.push(m[1]);
  }
  igual(faltan, [], "el service worker guarda archivos que no están en el repositorio");
});

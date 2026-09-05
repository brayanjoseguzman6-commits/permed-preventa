#!/usr/bin/env node
/* Corre todas las pruebas de D'Preventa.
   ======================================

       node pruebas/correr.js

   No hay que instalar nada. Tarda unos segundos.

   Cada archivo `pruebas/*.prueba.js` es un grupo. Para agregar pruebas se
   escribe un archivo nuevo con ese nombre y ya: este corredor lo encuentra
   solo.

   Sale con código 1 si algo falla, para que GitHub lo marque en rojo antes
   de publicar.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { resultados } = require("./decir");

const AQUI = __dirname;
const soloEste = process.argv[2];   // node pruebas/correr.js dinero

const archivos = fs.readdirSync(AQUI)
  .filter(f => f.endsWith(".prueba.js"))
  .filter(f => !soloEste || f.includes(soloEste))
  .sort();

if (!archivos.length) {
  console.error("No hay pruebas que correr" + (soloEste ? " para «" + soloEste + "»" : "") + ".");
  process.exit(1);
}

const arranque = Date.now();
for (const f of archivos) {
  try {
    require(path.join(AQUI, f));
  } catch (e) {
    resultados.push({ grupo: f, nombre: "(el archivo ni siquiera cargó)",
                      bien: false, porque: e && e.stack ? e.stack.split("\n").slice(0, 4).join("\n") : String(e) });
  }
}

/* ---- el reporte ---- */
const color = process.stdout.isTTY;
const verde = t => (color ? "\x1b[32m" + t + "\x1b[0m" : t);
const rojo  = t => (color ? "\x1b[31m" + t + "\x1b[0m" : t);
const gris  = t => (color ? "\x1b[90m" + t + "\x1b[0m" : t);

let ultimo = null;
for (const r of resultados) {
  if (r.grupo !== ultimo) { console.log("\n" + gris(r.grupo)); ultimo = r.grupo; }
  if (r.bien) console.log("  " + verde("ok") + "  " + r.nombre);
  else {
    console.log("  " + rojo("MAL") + " " + r.nombre);
    console.log("      " + rojo(String(r.porque).split("\n").join("\n      ")));
  }
}

const bien = resultados.filter(r => r.bien).length;
const mal = resultados.length - bien;
const seg = ((Date.now() - arranque) / 1000).toFixed(1);
console.log("\n" + "-".repeat(52));
if (mal) {
  console.log(rojo(mal + " FALLARON") + " · " + bien + " pasaron · " + seg + " s");
  console.log(rojo("No se publica con pruebas en rojo."));
} else {
  console.log(verde(bien + " pruebas pasaron") + " · " + seg + " s");
}
process.exit(mal ? 1 : 0);

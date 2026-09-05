/* Lo que se usa para escribir una prueba. Nada más que esto.
   ==========================================================

   Sin librerías, sin instalar nada: Node trae todo lo que hace falta. Una
   prueba es una frase que dice qué tiene que pasar, y adentro una
   comprobación. Si la frase no se entiende leyéndola sola, está mal
   escrita.

       prueba("dos decimales redondean hacia arriba en el medio", () => {
         igual(dosDec(1.005), 1.01);
       });
*/
"use strict";

const resultados = [];
let grupoActual = "";

/** El título del archivo de pruebas que se está corriendo. */
function grupo(nombre) { grupoActual = nombre; }

/** Una prueba. `fn` revienta si algo no cuadra. */
function prueba(nombre, fn) {
  try {
    fn();
    resultados.push({ grupo: grupoActual, nombre, bien: true });
  } catch (e) {
    resultados.push({ grupo: grupoActual, nombre, bien: false,
                      porque: e && e.message ? e.message : String(e) });
  }
}

function _texto(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (v instanceof Set) return "Set{" + [...v].join(", ") + "}";
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

/** Dos cosas iguales. Compara hondo, para poder comparar listas y objetos. */
function igual(dio, esperaba, que) {
  const a = _texto(dio), b = _texto(esperaba);
  if (a !== b) {
    throw new Error((que ? que + ": " : "") + "esperaba " + b + " y dio " + a);
  }
}

/** Algo que tiene que ser cierto. */
function cierto(v, que) {
  if (!v) throw new Error(que || "esperaba que fuera cierto y dio " + _texto(v));
}

/** Algo que tiene que ser falso. */
function falso(v, que) {
  if (v) throw new Error(que || "esperaba que fuera falso y dio " + _texto(v));
}

/** Un texto que tiene que contener a otro. */
function contiene(donde, que, aclara) {
  if (String(donde).indexOf(que) < 0) {
    throw new Error((aclara ? aclara + ": " : "") + "esperaba encontrar " +
                    _texto(que) + " adentro de " + _texto(String(donde).slice(0, 160)));
  }
}

/** Algo que tiene que reventar. Devuelve el error, para poder mirarlo. */
function revienta(fn, que) {
  try { fn(); } catch (e) { return e; }
  throw new Error(que || "esperaba que reventara y no reventó");
}

/** Cerca, para los números con coma. */
function cerca(dio, esperaba, holgura = 0.005, que) {
  if (Math.abs(dio - esperaba) > holgura) {
    throw new Error((que ? que + ": " : "") + "esperaba cerca de " + esperaba +
                    " y dio " + dio);
  }
}

module.exports = { grupo, prueba, igual, cierto, falso, contiene, revienta,
                   cerca, resultados };

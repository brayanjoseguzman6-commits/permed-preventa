/* anotarMovimiento(): un error de red no puede borrar existencia real.
   =======================================================================

   Bug real, encontrado en revisión (05-09-2026): si el .update() de la
   existencia fallaba por CUALQUIER motivo -no solo "la ficha no existe"-,
   el código caía siempre en el mismo camino: un .set({disponible: ...})
   con el valor de ESTE movimiento solo, como si fuera absoluto. Si la
   ficha ya tenía 400 unidades acumuladas y el update fallaba por, por
   ejemplo, una desconexión a medio camino, el disponible quedaba en 50
   (lo de este movimiento nada más) y las otras 350 desaparecían sin aviso.

   El arreglo: SOLO "not-found" abre la ficha con un valor absoluto (ahí no
   hay nada que sumarle todavía). Cualquier otro error deja la existencia
   como estaba y anota el movimiento como pendiente, igual que ya hacía
   aplicarExistencias() para las entregas -este era el único camino que no
   seguía esa misma regla.

   anotarMovimiento() habla con Firestore de principio a fin -como
   cerrarEntrega()-, así que se prueba igual que las guardas del puente en
   puente.prueba.js: leyendo el código, no ejecutándolo.
*/
"use strict";
const { grupo, prueba, cierto } = require("./decir");
const { sacar } = require("./leer");

grupo("Bodega: anotarMovimiento no inventa la existencia al fallar");

const ANOTAR = sacar("anotarMovimiento");

prueba("solo 'not-found' abre la ficha con un valor absoluto", () => {
  cierto(ANOTAR.includes('e.code === "not-found"'),
    "sin esta revisión, cualquier error cae en el mismo camino que 'la ficha no existe'");
});

prueba("cualquier otro error NO pisa la existencia con un .set() -- queda pendiente", () => {
  const desdeElIf = ANOTAR.slice(ANOTAR.indexOf('e.code === "not-found"'));
  const bloqueElse = desdeElIf.slice(desdeElIf.indexOf("} else {"), desdeElIf.indexOf("}\n  }\n  return doc;"));
  cierto(bloqueElse.includes("anotarExistenciaPendiente"),
    "un error que no sea 'la ficha no existe' tiene que anotarse como pendiente, no reemplazar el disponible");
  cierto(!bloqueElse.includes("ref.set"),
    "el camino de 'cualquier otro error' no puede terminar en un .set() que pisa lo que ya había");
});

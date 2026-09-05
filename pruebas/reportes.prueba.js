/* Los reportes de oficina: una respuesta vieja no puede pisar la nueva.
   =======================================================================

   Bugs reales, encontrados en revisión (05-09-2026): dos pantallas de
   oficina disparan una consulta a Firestore por cada clic (cambiar de día,
   cambiar de rango, cambiar el "desde"/"hasta" de una ficha) SIN esperar a
   que la anterior termine. Si dos clics seguidos disparan dos consultas y
   la más vieja contesta DESPUÉS de la más nueva, sus números pisan los que
   de verdad corresponden a lo que está en pantalla -sin ningún aviso de
   que no cuadran con la fecha/rango que se ve arriba.

   adminSupervisores() ya tenía el candado correcto (compara la fecha
   guardada contra la que arrancó la consulta); adminTablero() no lo tenía
   -ni para fecha ni para rango-, y adminFicha() solo comparaba la persona,
   no el rango de fechas.

   Las tres funciones hablan con Firestore de principio a fin, así que se
   prueban leyendo el código, como las guardas del puente.
*/
"use strict";
const { grupo, prueba, cierto } = require("./decir");
const { sacar } = require("./leer");

grupo("Reportes: una respuesta vieja no puede pisar la que está en pantalla");

prueba("adminTablero() descarta la respuesta si la fecha O el rango ya cambiaron", () => {
  const TABLERO = sacar("adminTablero");
  cierto(TABLERO.includes("const rg = tableroRango"),
    "tiene que guardar con qué rango arrancó la consulta, no solo con qué fecha");
  cierto(TABLERO.includes("tableroFecha !== f || tableroRango !== rg"),
    "sin comparar los dos, un clic rápido en ‹/› o en un chip de rango puede pintar el rango equivocado");
});

prueba("adminFicha() descarta la respuesta si el rango de fechas ya cambió, no solo si cambió la persona", () => {
  const FICHA = sacar("adminFicha");
  cierto(FICHA.includes('D.clave !== (fichaUid + "|" + fichaFecha + "|" + fichaHasta)'),
    "comparar solo la persona (D.clave.split('|')[0]) deja pasar una respuesta de OTRO rango de fechas");
});

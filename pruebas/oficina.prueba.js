/* La pantalla "Hoy" de oficina: solo cuenta lo que de verdad es venta.
   =======================================================================

   Bug real, encontrado en revisión (05-09-2026): la cabecera de "Hoy"
   (pedidos de hoy, vendido, entregados/por entregar) solo quitaba los
   pedidos anulados. Un pedido "adicional" -todavía sin aprobar- y uno
   "rechazado" -que nunca se aprobó- seguían sumando como venta real, y
   como ninguno de los dos llega nunca a "entregado" ni a "no entregado",
   se quedaban pegados en "por entregar" para siempre. La lista de
   seguimiento un poco más abajo, en la misma pantalla, sí los filtraba
   bien (bloqueSeguimiento) -las dos partes de una misma pantalla podían
   contradecirse entre sí. "entregado parcial" tampoco contaba como
   entrega hecha, aunque sí lo es.

   pintarOficinaHoy() pinta directo sobre el DOM y usa muchos ayudantes de
   pantalla; se prueba leyendo el código, como las guardas del puente.
*/
"use strict";
const { grupo, prueba, cierto, falso } = require("./decir");
const { sacar } = require("./leer");

grupo("Oficina · Hoy: solo cuenta lo que de verdad es venta");

const HOY = sacar("pintarOficinaHoy");

prueba("un pedido adicional (sin aprobar todavía) no cuenta como vendido hoy", () => {
  cierto(HOY.includes('x.estado !== "adicional"') && HOY.includes("!x.adicional"),
    "sin este filtro, un adicional pendiente infla \"vendido\" y \"pedidos de hoy\" antes de que oficina lo apruebe");
});

prueba("un pedido rechazado tampoco cuenta -y antes se quedaba pegado en \"por entregar\" para siempre", () => {
  // Un rechazado sigue con adicional:true (el botón "Rechazar" no lo
  // limpia), así que el mismo filtro de arriba también lo saca.
  falso(/peds\s*=\s*\(S\.pedidosDia \|\| \[\]\)\.filter\(x => \(x\.fecha \|\| ""\) === hoy && x\.estado !== "anulado"\)/.test(HOY),
    "el filtro viejo (solo 'anulado') dejaba pasar adicionales y rechazados");
});

prueba("una entrega parcial cuenta como entregada, no como pendiente", () => {
  cierto(HOY.includes('x.estado === "entregado" || x.estado === "entregado parcial"'),
    "\"entregado parcial\" es una entrega hecha; sin esto se mostraba como si faltara entregar");
});

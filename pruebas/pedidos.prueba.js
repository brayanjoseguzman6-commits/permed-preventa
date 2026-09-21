/* Editar el pedido de un cliente no puede borrar el de otro.
   ============================================================

   Bug real, encontrado en revisión (05-09-2026): `S.editando` guarda el id
   del pedido que se está corrigiendo. Si el vendedor abandonaba esa edición
   tocando afuera de la hoja (cerrarHoja(), que a propósito NO pregunta —
   "Salir" sí pregunta y sí limpiaba) y luego levantaba un pedido nuevo para
   OTRO cliente, `S.editando` seguía apuntando al pedido viejo. Al guardar el
   pedido del cliente nuevo, `guardarPedido()` borraba —sin avisar— el
   pedido real del cliente que se había quedado a medio editar.

   Dos candados, no uno: `arrancarPedido()` limpia `S.editando` apenas se
   arranca cualquier pedido nuevo (la raíz), y `guardarPedido()` además solo
   borra el "viejo" si es del MISMO cliente que se acaba de guardar (el
   respaldo, por si algún otro camino llega con `S.editando` pegado).
*/
"use strict";
const { grupo, prueba, igual, cierto } = require("./decir");
const { cargar, sacar } = require("./leer");

grupo("Pedidos: editar uno no puede borrar el de otro cliente");

prueba("arrancar un pedido nuevo suelta cualquier edición pendiente de otro cliente", () => {
  const S = {
    rol: "preventa", motivo: "algo de antes", notaGuardada: "algo",
    editando: "pedA123", cliente: { id: "A" }, carrito: [{ cod: "X", cant: 1 }]
  };
  let fueACatalogo = false;
  const { arrancarPedido } = cargar(
    ["arrancarPedido", "modoFiscalDe", "esContribuyente", "fiscalDe", "fiscalDeOficina"], {
    S, cerrarHoja: () => {}, irA: p => { if (p === "catalogo") fueACatalogo = true; }
  });

  arrancarPedido({ id: "B" }, "pedido");

  igual(S.editando, null,
    "si queda pegado, guardarPedido() puede borrar el pedido de OTRO cliente al guardar este");
  igual(S.cliente.id, "B");
  igual(S.carrito, []);
  cierto(fueACatalogo, "tiene que llevar a la pantalla de armar el pedido");
});

prueba("guardarPedido() solo borra el pedido viejo si es del mismo cliente que se guardó", () => {
  // guardarPedido() habla con Firestore de principio a fin: se lee el
  // candado directo del código, como se hace con las guardas de
  // cerrarEntrega() en puente.prueba.js.
  const GUARDAR = sacar("guardarPedido");
  cierto(GUARDAR.includes("S.editando"), "tiene que seguir revisando si hay una edición pendiente");
  cierto(
    GUARDAR.includes("x.id === S.editando && x.clienteId === S.cliente.id") ||
    GUARDAR.includes("x.clienteId === S.cliente.id && x.id === S.editando"),
    "se perdió el candado que evita borrar el pedido de OTRO cliente al guardar este");
});

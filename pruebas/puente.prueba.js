/* El puente con oficina: lo que se cobra tiene que ser lo que se factura.
   =======================================================================

   Cuando el motorista cierra una entrega, se escribe una copia en
   `porFacturar` y de ahí oficina emite el documento fiscal. Si ese número
   no es EXACTAMENTE el que se cobró en la puerta, la factura del cliente
   dice otra cosa que el ticket que firmó.

   `cerrarEntrega` no se puede ejecutar en una prueba --habla con Firestore
   y con la pantalla en la misma función--, así que acá se prueban dos
   cosas: el invariante del número (ejecutando la misma cuenta) y las
   guardas del código (leyéndolo). Lo segundo es menos elegante, pero es lo
   que avisa el día que alguien las quite sin querer.
*/
"use strict";
const { grupo, prueba, igual, cierto, falso, contiene } = require("./decir");
const { cargar, sacar } = require("./leer");

grupo("El puente: el número que viaja a facturar");

const { dosDec, totalEntrega } = cargar(["dosDec", "totalEntrega"]);

/** Las líneas tal como las arma `cerrarEntrega` para `porFacturar`. */
function lineasQueViajan(ped) {
  return (ped.lineas || [])
    .map(l => Object.assign({}, l,
      { entregado: l.entregado != null ? l.entregado : l.cant }))
    .filter(l => l.entregado > 0)
    .map(l => ({ cod: l.cod, cant: l.entregado,
                 precio: l.precio, total: dosDec(l.entregado * l.precio) }));
}

prueba("la suma de lo que se factura es igual a lo que se cobró", () => {
  // 🔑 El invariante del puente. Si esto se rompe, el cliente recibe una
  // factura por un monto distinto del que pagó.
  const casos = [
    { lineas: [{ cod: "A", cant: 10, precio: 11.3 }, { cod: "B", cant: 3, precio: 0.5 }] },
    { lineas: [{ cod: "A", cant: 10, precio: 11.3, entregado: 4 }] },
    { lineas: [{ cod: "A", cant: 3, precio: 0.335, entregado: 3 }] },
    { lineas: [{ cod: "A", cant: 7, precio: 1.115, entregado: 2 },
               { cod: "B", cant: 1, precio: 0.5, entregado: 1 }] },
  ];
  for (const ped of casos) {
    const suma = dosDec(lineasQueViajan(ped).reduce((a, l) => a + l.total, 0));
    igual(suma, totalEntrega(ped), "para " + JSON.stringify(ped.lineas));
  }
});

prueba("lo que no se entregó NO viaja a facturar", () => {
  const ped = { lineas: [
    { cod: "A", cant: 5, precio: 2, entregado: 5 },
    { cod: "B", cant: 5, precio: 2, entregado: 0 },
  ] };
  igual(lineasQueViajan(ped).map(l => l.cod), ["A"],
        "una línea entregada en cero no puede salir en la factura");
});

/* --------------- las guardas, leídas del código --------------- */

grupo("El puente: las guardas que no se pueden perder");

const CERRAR = sacar("cerrarEntrega");

prueba("una entrega fallida no llega a facturación", () => {
  // `ninguno` es «no recibió nada». Sin esta guarda se emitiría una
  // factura por una venta que no ocurrió.
  contiene(CERRAR, "if (!ninguno && total > 0)",
           "se perdió la guarda que impide facturar lo que no se entregó");
});

prueba("el documento de facturación se llama como el pedido", () => {
  // Es lo que hace imposible facturar dos veces: el mismo pedido escribe
  // siempre en el mismo documento, aunque el aviso llegue repetido.
  contiene(CERRAR, 'collection("porFacturar").doc(ped.id)',
           "el id del documento tiene que ser el del pedido");
});

prueba("el crédito fiscal sin NIT ni NRC se factura como consumidor final", () => {
  contiene(CERRAR, "comoConsumidor");
  contiene(CERRAR, "fiscal: comoConsumidor ? null",
           "si va como consumidor, los datos fiscales NO pueden viajar");
  contiene(CERRAR, "fiscalNota", "y tiene que quedar dicho por qué");
});

prueba("el total de cada línea que viaja se redondea, no se manda crudo", () => {
  contiene(CERRAR, "total: dosDec(l.entregado * l.precio)");
});

prueba("todo va en un solo lote: o entra completo, o no entra nada", () => {
  contiene(CERRAR, "db.batch()");
  contiene(CERRAR, "lote.commit()");
  // El pedido, la entrega, el puente y el kardex tienen que estar en el
  // MISMO lote. Si el puente quedara afuera, habría ventas cobradas que
  // oficina nunca factura, y nadie se entera hasta echar de menos la
  // factura.
  const antesDelCommit = CERRAR.slice(0, CERRAR.indexOf("lote.commit()"));
  for (const cual of ["pedidos", "entregas", "porFacturar", "movimientos"]) {
    contiene(antesDelCommit, cual, cual + " tiene que ir adentro del lote");
  }
});

/* --------------- el kardex --------------- */

grupo("El puente: el kardex de bodega");

prueba("cada línea entregada saca su propio número de movimiento", () => {
  // Antes las líneas de una misma entrega salían todas con el MISMO
  // número, porque se contaban sobre la lista sin haber guardado ninguna.
  const S = { movs: [], usuario: { uid: "u1" }, nombre: "Motorista",
              catalogo: [{ cod: "A", nombre: "Alitas", unidad: "UNIDAD" }] };
  const firebase = { firestore: { FieldValue: { serverTimestamp: () => "ahora" } } };
  const { movimientosDeEntrega } = cargar(
    ["correlativo", "unidadDe", "nombreProd", "docMovimiento", "movimientosDeEntrega"],
    { S, firebase, hoyISO: () => "2026-09-04" });

  const movs = movimientosDeEntrega(
    { id: "ped1", clienteId: "c1", clienteNombre: "La tienda" },
    { nombre: "La tienda" },
    [{ cod: "A", cant: 3, precio: 1, entregado: 3 },
     { cod: "B", cant: 2, precio: 1, entregado: 2 },
     { cod: "C", cant: 9, precio: 1, entregado: 0 }]);

  igual(movs.length, 2, "la línea entregada en cero no mueve bodega");
  const numeros = movs.map(m => m.num);
  igual(numeros.length, new Set(numeros).size, "dos movimientos no pueden llevar el mismo número");
});

prueba("el correlativo va con ceros adelante, por tipo y con corrimiento", () => {
  const S = { movs: [{ tipo: "salida" }, { tipo: "salida" }, { tipo: "entrada" }] };
  const { correlativo } = cargar(["correlativo"], { S });
  igual(correlativo("salida", 0), "000003", "ya hay dos salidas: la que sigue es la tercera");
  igual(correlativo("salida", 2), "000005", "el corrimiento es para las que van en el mismo lote");
  igual(correlativo("entrada", 0), "000002", "cada tipo lleva su propia cuenta");
  igual(correlativo("ajuste", 0), "000001", "un tipo que nunca se usó empieza en uno");
});

prueba("el crédito fiscal se reconoce por el tipo exacto", () => {
  const { esContribuyente } = cargar(["esContribuyente"]);
  cierto(esContribuyente({ fiscal: { tipo: "credito" } }));
  falso(esContribuyente({ fiscal: { tipo: "consumidor" } }));
  falso(esContribuyente({ fiscal: {} }));
  falso(esContribuyente({}), "un cliente sin datos fiscales no revienta");
  falso(esContribuyente(null));
});

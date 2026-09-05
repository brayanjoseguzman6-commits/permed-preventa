/* La comisión se paga sobre lo A/B/C que la venta REAL manda, no lo
   rechazado. ============================================================

   Bug real, encontrado en revisión (05-09-2026): pintarCuentasDelMes()
   armaba la clasificación A/B/C con TODOS los pedidos del mes, sin quitar
   los rechazados -mientras que, unas líneas más abajo, sí filtraba con
   esVenta() antes de sumar la venta de cada vendedor-. Un producto con
   ventas rechazadas grandes podía "inflar" su categoría (subir de B a A,
   por ejemplo) aunque esa venta nunca se haya cobrado de verdad, y esa
   clasificación es la que decide el % de comisión (pctDeGrupo) que se le
   aplica a la venta real de cada vendedor.
*/
"use strict";
const { grupo, prueba, igual, contiene } = require("./decir");
const { cargar, sacar } = require("./leer");

grupo("Comisiones: la clasificación A/B/C no cuenta lo rechazado");

const { clasificarABC, grupoDe } = cargar(["clasificarABC", "grupoDe"]);

prueba("un producto con mucha venta RECHAZADA no se cuela en el grupo A", () => {
  const pedidos = [
    // Venta real, chica: sin lo rechazado esto es case cerrado C.
    { estado: "entregado", lineas: [{ cod: "X", cat: "BEBIDAS", nombre: "X", total: 10, cant: 10 }] },
    // Venta RECHAZADA, grande: si se cuela, X salta a grupo A.
    { estado: "rechazado", lineas: [{ cod: "X", cat: "BEBIDAS", nombre: "X", total: 9000, cant: 900 }] },
    { estado: "entregado", lineas: [{ cod: "Y", cat: "BEBIDAS", nombre: "Y", total: 500, cant: 50 }] },
  ];
  const esVenta = p => p && p.estado !== "rechazado";

  const abcConRechazado = clasificarABC(pedidos);
  const abcSinRechazado = clasificarABC(pedidos.filter(esVenta));

  igual(grupoDe("X", abcSinRechazado), "C",
    "sin la venta rechazada, X es la más chica de su categoría: C");
  igual(grupoDe("X", abcConRechazado), "A",
    "con la venta rechazada adentro, X domina la categoría y sale A -- así se prueba que el bug era real");
});

prueba("pintarCuentasDelMes() arma la clasificación A/B/C solo con lo que cuenta como venta", () => {
  const FUENTE = sacar("pintarCuentasDelMes");
  contiene(FUENTE, "clasificarABC(ped.filter(esVenta))",
    "se perdió el filtro: un pedido rechazado no puede decidir en qué grupo A/B/C cae un producto");
});

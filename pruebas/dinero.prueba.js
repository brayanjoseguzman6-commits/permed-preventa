/* La plata.
   =========

   Un error acá no se ve: sale en un ticket, en una factura o en la
   comisión de fin de mes, y lo encuentra el cliente o el vendedor. Por eso
   este archivo es el primero y el más largo.

   La regla que sostiene todo: **el total es la suma de los totales de
   línea YA redondeados**, nunca el redondeo de la suma cruda. Así el
   pedido, la entrega y lo que se manda a facturar salen del mismo número.
*/
"use strict";
const { grupo, prueba, igual, cierto, cerca } = require("./decir");
const { cargar } = require("./leer");

grupo("La plata: redondeo y totales");

const { dosDec, money, dosDecTxt, cuatroDec } =
  cargar(["dosDec", "money", "dosDecTxt", "cuatroDec"]);

prueba("dos decimales, y lo que no es número vale cero", () => {
  igual(dosDec(1.239), 1.24);
  igual(dosDec(1.2), 1.2);
  igual(dosDec("2.556"), 2.56);
  igual(dosDec(null), 0, "un nulo no puede volverse NaN y contagiar el total");
  igual(dosDec(undefined), 0);
  igual(dosDec("no es un número"), 0);
  igual(dosDec(-1.235), -1.24, "los negativos también (una devolución)");
});

prueba("el medio centavo sube", () => {
  igual(dosDec(0.335), 0.34);
  igual(dosDec(2.345), 2.35);
});

prueba("CONOCIDO: hay medios centavos que el float baja, no sube", () => {
  // 0.145 × 100 en coma flotante da 14.499999999999998, y eso redondea a
  // 14. No es un descuido: es cómo guarda los números cualquier
  // computadora. Hoy no muerde porque los precios llevan dos decimales y
  // las cantidades son enteras. Queda escrito para que, el día que
  // aparezca un centavo bailando, se sepa dónde mirar.
  igual(dosDec(0.145), 0.14);
});

prueba("el dinero se escribe siempre con dos decimales y su signo", () => {
  igual(money(0), "$0.00");
  igual(money(1.5), "$1.50");
  igual(money(null), "$0.00");
  igual(money("12.3"), "$12.30");
  igual(dosDecTxt(3), "3.00", "el ticket imprime dos decimales siempre");
  igual(cuatroDec(11.3), "11.3000", "el precio unitario del ticket va a cuatro");
});

/* ------------------------- el total del pedido ------------------------- */

grupo("La plata: el total del pedido y el de la entrega");

prueba("el total del carrito suma líneas ya redondeadas, no redondea la suma", () => {
  const S = { carrito: [
    { cant: 1, precio: 0.335 }, { cant: 1, precio: 0.335 }, { cant: 1, precio: 0.335 },
  ] };
  const { totalCarrito } = cargar(["dosDec", "totalCarrito"], { S });
  // Cada línea es 0.34; tres líneas son 1.02. Redondear la suma cruda
  // (1.005) daría 1.00, y el ticket diría dos centavos menos de lo que
  // suman las líneas que el cliente está leyendo.
  igual(totalCarrito(), 1.02);
});

prueba("un carrito vacío vale cero", () => {
  const { totalCarrito } = cargar(["dosDec", "totalCarrito"], { S: { carrito: [] } });
  igual(totalCarrito(), 0);
});

const { totalEntrega, montoEntregado } =
  cargar(["dosDec", "totalEntrega", "montoEntregado"]);

const PEDIDO = { total: 113, lineas: [
  { cod: "A", cant: 10, precio: 11.3 },
  { cod: "B", cant: 3, precio: 0.5 },
] };

prueba("sin tocar nada, la entrega vale lo mismo que el pedido", () => {
  igual(totalEntrega(PEDIDO), 114.5);
});

prueba("lo entregado manda sobre lo pedido", () => {
  const parcial = { lineas: [
    { cant: 10, precio: 11.3, entregado: 4 },
    { cant: 3, precio: 0.5, entregado: 3 },
  ] };
  igual(totalEntrega(parcial), 46.7);
});

prueba("entregar CERO es cero, no «no dijo nada»", () => {
  // `entregado: 0` es un dato: el cliente no recibió esa línea. Si se
  // confundiera con «no se anotó», se le cobraría producto que no llevó.
  const nada = { lineas: [{ cant: 10, precio: 11.3, entregado: 0 }] };
  igual(totalEntrega(nada), 0);
});

prueba("«no se anotó» (null) sí cae a lo pedido", () => {
  const sinAnotar = { lineas: [{ cant: 2, precio: 5, entregado: null }] };
  igual(totalEntrega(sinAnotar), 10);
});

prueba("lo cobrado y lo entregado dicen el MISMO número", () => {
  // Son dos funciones distintas que se pintan una al lado de la otra. Un
  // centavo de diferencia entre ellas es una llamada de oficina.
  const casos = [
    PEDIDO,
    { lineas: [{ cant: 3, precio: 0.335, entregado: 3 }] },
    { lineas: [{ cant: 7, precio: 1.115, entregado: 2 }, { cant: 1, precio: 0.5 }] },
  ];
  for (const p of casos) igual(montoEntregado(p), totalEntrega(p), "para " + JSON.stringify(p.lineas));
});

prueba("un pedido viejo sin líneas cae a su total y no revienta", () => {
  igual(montoEntregado({ total: 25.4 }), 25.4);
  igual(montoEntregado(null), 0);
});

prueba("totalAjustado() (la hoja de reparto) suma líneas ya redondeadas, igual que las demás", () => {
  // Bug real, encontrado en revisión (05-09-2026): esta función redondeaba
  // la suma cruda al final, distinto a totalCarrito/totalEntrega/
  // montoEntregado -que sí suman dosDec por línea, como manda CLAUDE.md-.
  // Con estas dos líneas de 0.335 la diferencia es real: 0.34+0.34=0.68
  // por línea, contra dosDec(0.335+0.335)=dosDec(0.67)=0.67 de la suma
  // cruda. Hoy esta función solo pinta la hoja que lleva el motorista, no
  // lo que se cobra, pero sumar distinto es el mismo hueco que ya se
  // tapó en todos los demás totales.
  const { totalAjustado } = cargar(["dosDec", "totalAjustado"]);
  const ped = { lineas: [{ cod: "A", cant: 1, precio: 0.335 }, { cod: "B", cant: 1, precio: 0.335 }] };
  igual(totalAjustado(ped, null), 0.68);
});

/* ------------------------- precios y piso ------------------------- */

grupo("La plata: el precio que se cobra y hasta dónde se rebaja");

function mundoPrecios(extra) {
  return Object.assign({
    cliente: null, preciosEsp: {}, listas: [], costos: {},
    ajustes: { margenGeneral: 25 }, catalogo: [],
  }, extra);
}

prueba("sin cliente, el precio es el del catálogo", () => {
  const { precioDe } = cargar(["precioDe"], { S: mundoPrecios() });
  igual(precioDe({ cod: "A", precio: 3.5 }), 3.5);
});

prueba("el precio especial del cliente gana sobre todo", () => {
  const S = mundoPrecios({
    cliente: { id: "c1", listaId: "L1" },
    preciosEsp: { c1: { A: 2.75 } },
    listas: [{ id: "L1", descuento: 10 }],
  });
  const { precioDe } = cargar(["precioDe"], { S });
  igual(precioDe({ cod: "A", precio: 3.5 }), 2.75);
});

prueba("un precio especial de CERO también gana", () => {
  // Producto regalado. Con `||` en vez de `!= null` caería a la lista y se
  // le cobraría al cliente algo que se le dijo que iba gratis.
  const S = mundoPrecios({
    cliente: { id: "c1", listaId: "L1" },
    preciosEsp: { c1: { A: 0 } },
    listas: [{ id: "L1", descuento: 10 }],
  });
  const { precioDe } = cargar(["precioDe"], { S });
  igual(precioDe({ cod: "A", precio: 3.5 }), 0);
});

prueba("la lista con descuento se aplica y se redondea a dos", () => {
  const S = mundoPrecios({
    cliente: { id: "c1", listaId: "L1" },
    listas: [{ id: "L1", descuento: 10 }],
  });
  const { precioDe } = cargar(["precioDe"], { S });
  igual(precioDe({ cod: "A", precio: 3.55 }), 3.2);
});

const COSTOS = ["costoDe", "costoBase", "pisoDe", "descMaxDe"];

prueba("el costo se entiende venga como venga", () => {
  const S = mundoPrecios({ costos: {
    A: 2,                                   // el formato viejo: un número
    B: { prom: 2.5, ult: 3 },               // el de hoy
    C: { promedio: 1.5, ultimaCompra: 2 },  // los alias
    D: { ult: 4 },                          // solo última: sirve de promedio
    E: { prom: null, ult: null },           // nada útil
  } });
  const { costoDe, costoBase } = cargar(COSTOS, { S });
  igual(costoDe("A"), { prom: 2, ult: 2 });
  igual(costoDe("B"), { prom: 2.5, ult: 3 });
  igual(costoDe("C"), { prom: 1.5, ult: 2 });
  igual(costoDe("D"), { prom: 4, ult: 4 });
  igual(costoDe("E"), null);
  igual(costoDe("NO EXISTE"), null);
  igual(costoBase("B"), 2.5, "el piso se calcula con el PROMEDIO, no con la última");
});

prueba("el precio mínimo del catálogo manda sobre el costo", () => {
  const S = mundoPrecios({ costos: { A: 10 } });
  const { pisoDe } = cargar(COSTOS, { S });
  igual(pisoDe({ cod: "A", precio: 20, precioMin: 12 }), 12);
});

prueba("sin precio mínimo, el piso sale del costo más el margen", () => {
  const S = mundoPrecios({ costos: { A: 2 }, ajustes: { margenGeneral: 25 } });
  const { pisoDe } = cargar(COSTOS, { S });
  igual(pisoDe({ cod: "A", precio: 5 }), 2.5);
});

prueba("un margen de CERO es un margen, no «no dijo nada»", () => {
  // Producto que se vende al costo. Con `||` en vez de `??` se le pondría
  // el margen general y no se podría vender al precio que se decidió.
  const S = mundoPrecios({ costos: { A: 2 }, ajustes: { margenGeneral: 25 } });
  const { pisoDe } = cargar(COSTOS, { S });
  igual(pisoDe({ cod: "A", precio: 5, margen: 0 }), 2);
});

prueba("sin costo y sin mínimo NO hay piso, y eso no es cero", () => {
  // 🔑 Devolver 0 acá dejaría vender a un centavo. En el teléfono del
  // vendedor los costos ni siquiera se cargan, así que este es el caso
  // normal, no el raro.
  const { pisoDe } = cargar(COSTOS, { S: mundoPrecios() });
  igual(pisoDe({ cod: "A", precio: 5 }), null);
});

prueba("el descuento máximo nunca es negativo", () => {
  const S = mundoPrecios({ costos: { A: 10 } });
  const { descMaxDe } = cargar(COSTOS, { S });
  // El piso (12.5) quedó arriba del precio (10): el descuento es 0, no -25.
  igual(descMaxDe({ cod: "A", precio: 10 }), 0);
});

/* ------------------------- el bono del motorista ------------------------- */

grupo("La plata: el bono y los cargos");

prueba("el bono cambia justo en el límite, no un centavo después", () => {
  const { bonoTramo } = cargar(["bonoTramo"]);
  igual(bonoTramo(0).bono, 25);
  igual(bonoTramo(50).bono, 25, "50 exactos todavía es Excelente");
  igual(bonoTramo(50.01).bono, 17.5);
  igual(bonoTramo(100).bono, 17.5);
  igual(bonoTramo(100.01).bono, 10);
  igual(bonoTramo(150).bono, 10);
  igual(bonoTramo(150.01).bono, 0);
});

prueba("el cargo es del motorista salvo que sea culpa del preventa o venga dañado", () => {
  const { esCargoMotorista } = cargar(["esCargoMotorista"]);
  cierto(esCargoMotorista("No lo pidió"));
  cierto(esCargoMotorista(""), "sin motivo, el cargo es del que entregó");
  cierto(esCargoMotorista(null));
  igual(esCargoMotorista("Error del preventista · precio equivocado"), false);
  igual(esCargoMotorista("Producto dañado"), false);
  igual(esCargoMotorista("Producto danado"), false, "también sin tilde: así lo teclean");
  igual(esCargoMotorista("PRODUCTO DAÑADO"), false, "y en mayúsculas");
});

prueba("la quincena se parte el 15", () => {
  const { quincenaDe } = cargar(["quincenaDe"]);
  igual(quincenaDe("2026-09-01"), 1);
  igual(quincenaDe("2026-09-15"), 1, "el 15 todavía es la primera");
  igual(quincenaDe("2026-09-16"), 2);
  igual(quincenaDe("2026-09-30"), 2);
});

prueba("un pedido rechazado no es una venta", () => {
  const { esVenta } = cargar(["esVenta"]);
  cierto(esVenta({ estado: "entregado" }));
  cierto(esVenta({ estado: "pendiente" }));
  igual(esVenta({ estado: "rechazado" }), false);
});

prueba("la unidad cae a UNIDAD cuando el producto no la dice", () => {
  const S = { catalogo: [{ cod: "A", unidad: "6 PACK" }, { cod: "B", unidad: "" }] };
  const { unidadDe } = cargar(["unidadDe"], { S });
  igual(unidadDe("A"), "6 PACK");
  igual(unidadDe("B"), "UNIDAD");
  igual(unidadDe("NO EXISTE"), "UNIDAD");
});

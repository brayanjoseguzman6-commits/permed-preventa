/* La cola de facturación, vista desde oficina.
   ============================================

   Oficina mira esta pantalla para saber qué se facturó y qué no. Antes solo
   había dos estados —«pendiente» y todo lo demás— y con eso alcanzaba.
   Ahora el sistema de oficina contesta con cinco palabras distintas, y cada
   una dice algo que NO es lo mismo:

   - `armada` es un documento numerado SIN sello. No es una factura.
   - `prueba` tiene sello, pero del ambiente de pruebas. Tampoco es legal.
   - `revisar` falló varias veces y necesita que alguien la mire.

   Contarlas todas como «facturadas» haría creer que la venta ya salió, y en
   el caso de `revisar` la dejaría invisible: falló cinco veces y no la ve
   nadie.
*/
"use strict";
const { grupo, prueba, igual, cierto, falso } = require("./decir");
const { cargar } = require("./leer");

grupo("La cola de facturación: en qué anda cada entrega");

const { estadoDeCola, ES_FACTURA_REAL } =
  cargar(["ESTADOS_COLA", "estadoDeCola", "ES_FACTURA_REAL"]);

prueba("cada estado que manda oficina tiene su nombre en cristiano", () => {
  for (const clave of ["pendiente", "armada", "prueba", "facturada", "revisar"]) {
    const e = estadoDeCola({ estadoFactura: clave });
    igual(e.clave, clave);
    cierto(e.rotulo && e.rotulo.length > 3, "«" + clave + "» tiene que decir algo legible");
  }
});

prueba("el nombre corto no lleva puntos, porque va en la cuenta de arriba", () => {
  // La cuenta separa con « · », así que un rótulo que ya trae « · » adentro
  // la vuelve una sola tira ilegible. Se ve solo mirando la pantalla.
  for (const clave of ["pendiente", "armada", "prueba", "facturada", "revisar"]) {
    const e = estadoDeCola({ estadoFactura: clave });
    cierto(e.corto && e.corto.length > 3, "«" + clave + "» necesita nombre corto");
    falso(/·/.test(e.corto), "el corto de «" + clave + "» no puede llevar «·»");
  }
});

prueba("una entrega recién puesta en la cola está pendiente", () => {
  // La escribe el motorista al cerrar la entrega, antes de que oficina la
  // toque. Y si viniera sin estado, tampoco está facturada.
  igual(estadoDeCola({ estadoFactura: "pendiente" }).clave, "pendiente");
  igual(estadoDeCola({}).clave, "pendiente");
  igual(estadoDeCola({ estadoFactura: "" }).clave, "pendiente");
});

prueba("un estado que no se conoce NO se cuenta como facturado", () => {
  // Si oficina inventa una palabra nueva, lo seguro es tratarla como
  // pendiente: que se vea y que alguien pregunte.
  const e = estadoDeCola({ estadoFactura: "loquesea" });
  igual(e.clave, "pendiente");
  falso(e.real);
});

prueba("SOLO «facturada» es una factura de verdad", () => {
  // 🔑 Lo que contesta la pregunta «¿este dato ya es real?».
  igual(ES_FACTURA_REAL, "facturada");
  cierto(estadoDeCola({ estadoFactura: "facturada" }).real);
  for (const otra of ["pendiente", "armada", "prueba", "revisar"]) {
    falso(estadoDeCola({ estadoFactura: otra }).real,
          "«" + otra + "» NO puede contarse como facturada");
  }
});

prueba("las que hay que atender salen marcadas", () => {
  // Pendiente y revisar necesitan que alguien haga algo. Armada y prueba
  // están esperando a oficina, no a nadie de acá.
  cierto(estadoDeCola({ estadoFactura: "revisar" }).atender);
  cierto(estadoDeCola({ estadoFactura: "pendiente" }).atender);
  falso(estadoDeCola({ estadoFactura: "facturada" }).atender);
  falso(estadoDeCola({ estadoFactura: "prueba" }).atender);
});

prueba("una de prueba avisa que NO es legal", () => {
  const e = estadoDeCola({ estadoFactura: "prueba" });
  cierto(/prueba/i.test(e.rotulo), "el rótulo tiene que nombrar que es de prueba");
  falso(e.real);
});

prueba("se puede marcar a mano todo menos lo que ya tiene sello de verdad", () => {
  for (const otra of ["pendiente", "armada", "prueba", "revisar"]) {
    cierto(estadoDeCola({ estadoFactura: otra }).aMano,
           "«" + otra + "» se tiene que poder marcar a mano");
  }
  falso(estadoDeCola({ estadoFactura: "facturada" }).aMano,
        "una que ya tiene sello real no se toca a mano");
});

prueba("el ambiente dice lo mismo que el estado, y sirve de respaldo", () => {
  // El sistema de oficina manda las dos cosas. Que no se contradigan.
  igual(estadoDeCola({ estadoFactura: "facturada", dte: { ambiente: "01" } }).real, true);
  igual(estadoDeCola({ estadoFactura: "prueba", dte: { ambiente: "00" } }).real, false);
});

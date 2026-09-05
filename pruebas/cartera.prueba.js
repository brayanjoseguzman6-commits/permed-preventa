/* Quién ve qué.
   =============

   Si esto falla de un lado, un preventista amanece con la pantalla en
   blanco y no vende nada ese día. Si falla del otro, le sale la cartera
   del compañero y le levanta pedidos a clientes que no son suyos.

   Las dos cosas ya pasaron: los comentarios del código las cuentan.
*/
"use strict";
const { grupo, prueba, igual, cierto, falso } = require("./decir");
const { cargar } = require("./leer");

grupo("Quién ve qué: los clientes");

function conRol(rol, uid = "yo") {
  return { usuario: { uid }, rol, sectores: [], clientes: [] };
}

prueba("el cliente de otro preventista no es mío", () => {
  const S = conRol("preventa");
  const { esMio } = cargar(["esMio"], { S });
  cierto(esMio({ preventaUid: "yo" }));
  falso(esMio({ preventaUid: "otro" }));
});

prueba("el cliente sin dueño lo ve cualquiera", () => {
  // Es a propósito: un cliente nuevo, sin preventista asignado, tiene que
  // poder atenderlo el que pase. Pero con media cartera sin asignar, esto
  // hace que dos vendedores vean a la misma gente.
  const S = conRol("preventa");
  const { esMio } = cargar(["esMio"], { S });
  cierto(esMio({ preventaUid: null }));
  cierto(esMio({}));
});

prueba("el motorista y oficina ven a todos", () => {
  for (const rol of ["despacho", "admin", "bodega"]) {
    const { esMio } = cargar(["esMio"], { S: conRol(rol) });
    cierto(esMio({ preventaUid: "otro" }), "el rol " + rol + " tiene que ver todo");
  }
});

prueba("el supervisor, en la calle, ve SU parte y no toda la ruta", () => {
  const { esMio } = cargar(["esMio"], { S: conRol("supervisor") });
  cierto(esMio({ preventaUid: "yo" }));
  falso(esMio({ preventaUid: "otro" }));
});

prueba("sin haber entrado, nadie ve nada", () => {
  const { esMio } = cargar(["esMio"], { S: { usuario: null, rol: "preventa" } });
  falso(esMio({ preventaUid: "yo" }));
});

/* ------------------------- los sectores ------------------------- */

grupo("Quién ve qué: las rutas");

const SECTORES = [
  { id: "s1", nombre: "Lolotique", dia: 4 },
  { id: "s2", nombre: "Moncagua", dia: 2, preventaUid: "otro" },
  { id: "s3", nombre: "Apagada", dia: 1, activo: false },
  { id: "s4", nombre: "Del jefe", dia: 3, preventaUid: "yo" },
];

function mundoSectores(rol, clientes = []) {
  return { usuario: { uid: "yo" }, rol, sectores: SECTORES, clientes };
}

prueba("una ruta es mía si adentro tengo aunque sea un cliente", () => {
  // 🔑 El caso de las dos preventas por ruta: el sector queda «Todos lo
  // ven» y cada quien lo reconoce por sus clientes. Sin esto, a José le
  // abría la ruta de Luis.
  const S = mundoSectores("preventa", [
    { id: "c1", sectorId: "s1", preventaUid: "yo" },
    { id: "c2", sectorId: "s2", preventaUid: "otro" },
  ]);
  const { misSectores } = cargar(["misSectores"], { S });
  igual(misSectores().map(x => x.id), ["s1", "s4"],
        "s1 por el cliente, s4 porque se lo asignaron entero");
});

prueba("las rutas apagadas no le salen a nadie", () => {
  const S = mundoSectores("preventa", [{ id: "c", sectorId: "s3", preventaUid: "yo" }]);
  const { misSectores } = cargar(["misSectores"], { S });
  falso(misSectores().some(x => x.id === "s3"));
});

prueba("el preventista nuevo, sin un solo cliente, ve las rutas sin dueño", () => {
  // Si se le devolviera una lista vacía no podría ni empezar a trabajar.
  // Nadie: ni sector propio ni clientes suyos.
  const S = { usuario: { uid: "recien-llegado" }, rol: "preventa",
              sectores: SECTORES, clientes: [] };
  const { misSectores } = cargar(["misSectores"], { S });
  igual(misSectores().map(x => x.id), ["s1"],
        "solo las que no tienen dueño; s2 y s4 ya son de alguien");
});

prueba("el motorista va por CAMIÓN, no por preventista", () => {
  const S = mundoSectores("despacho");
  S.sectores = [{ id: "a", motoristaUid: "yo" }, { id: "b", motoristaUid: "otro" }];
  const { misSectores } = cargar(["misSectores"], { S });
  igual(misSectores().map(x => x.id), ["a"]);
});

prueba("el motorista sin camión asignado ve todo, no la nada", () => {
  // Antes esto filtraba por preventista y al motorista le daba lista
  // vacía: mapa en blanco y ni un cliente cargado.
  const S = mundoSectores("despacho");
  S.sectores = [{ id: "a", motoristaUid: "otro" }, { id: "b" }];
  const { misSectores } = cargar(["misSectores"], { S });
  igual(misSectores().map(x => x.id), ["a", "b"]);
});

/* ------------------------- la ruta del día ------------------------- */

grupo("Quién ve qué: la ruta del día");

prueba("un día con día puesto se elige, no el primero de la lista", () => {
  const S = mundoSectores("preventa", [
    { id: "c1", sectorId: "s1", preventaUid: "yo" },   // Lolotique, jueves
    { id: "c4", sectorId: "s4", preventaUid: "yo" },   // Del jefe, miércoles
  ]);
  // 2026-09-03 es jueves.
  const { sectorDeHoy } = cargar(["misSectores", "tieneDia", "sectorDeHoy"],
    { S, fechaVista: () => "2026-09-03", esHoy: () => true });
  igual(sectorDeHoy(), "s1");
});

prueba("otro día sin ruta NO inventa una", () => {
  // 🔑 Este es el defecto que se veía como «todos los días dice
  // Lolotique»: al correr las fechas se quedaba el sector de hoy.
  const S = mundoSectores("preventa", [{ id: "c1", sectorId: "s1", preventaUid: "yo" }]);
  const { sectorDeHoy } = cargar(["misSectores", "tieneDia", "sectorDeHoy"],
    { S, fechaVista: () => "2026-09-06", esHoy: () => false });   // domingo
  igual(sectorDeHoy(), "");
});

prueba("HOY, sin ruta que toque, se abre la primera para no dejarlo en blanco", () => {
  const S = mundoSectores("preventa", [{ id: "c1", sectorId: "s1", preventaUid: "yo" }]);
  const { sectorDeHoy } = cargar(["misSectores", "tieneDia", "sectorDeHoy"],
    { S, fechaVista: () => "2026-09-06", esHoy: () => true });
  igual(sectorDeHoy(), "s1");
});

prueba("un sector SIN día no se confunde con el domingo", () => {
  // `Number(null)` es 0, y 0 es domingo. Sin `tieneDia`, cada domingo se
  // abriría una ruta que nadie programó.
  const { tieneDia, ordenDia } = cargar(["tieneDia", "ordenDia"]);
  cierto(tieneDia({ dia: 0 }), "el domingo SÍ es un día puesto");
  falso(tieneDia({ dia: null }));
  falso(tieneDia({ dia: "" }));
  falso(tieneDia({}));
  igual(ordenDia({ dia: 0 }), 0);
  igual(ordenDia({ dia: null }), 9, "los que no tienen día van al final");
});

prueba("una entrega sin estado todavía está pendiente", () => {
  const { entregaPendiente } = cargar(["entregaPendiente"]);
  cierto(entregaPendiente({}));
  cierto(entregaPendiente({ estado: "pendiente" }));
  falso(entregaPendiente({ estado: "entregado" }));
  falso(entregaPendiente({ estado: "entregado parcial" }));
  falso(entregaPendiente({ estado: "no entregado" }));
});

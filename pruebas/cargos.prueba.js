/* Los cargos por lo no entregado: de quién es la culpa y a quién le pesa.
   Un cargo toca DOS bolsillos distintos y por caminos distintos:
     - al motorista, en su bono de eficiencia de la quincena
     - al preventista, en su comisión del mes
   Y esos dos caminos no son el mismo campo. */
const { grupo, prueba, igual, cierto, falso } = require("./decir.js");
const { cargar } = require("./leer.js");

const M = cargar(["esCargoMotorista", "culpaDelMotorista", "perdonAlPreventa",
                  "bonoTramo", "estadoDeCargo"], {});

grupo("Cargos: de quién fue la culpa");

prueba("sin decisión de oficina manda el motivo que escribió el motorista", () => {
  cierto(M.culpaDelMotorista({motivo: "Cliente cerrado"}, null));
  falso(M.culpaDelMotorista({motivo: "Error del preventista · pidió de más"}, null));
  falso(M.culpaDelMotorista({motivo: "Producto dañado"}, null));
});

prueba("un cargo sin responsable todavía no manda", () => {
  // El motorista lo propuso, el preventa lo contestó, pero oficina no ha
  // decidido: el motivo sigue siendo la única verdad.
  cierto(M.culpaDelMotorista({motivo: "Cliente cerrado"}, {estado: "rechazado"}));
});

prueba("si oficina decidió, eso manda sobre el motivo", () => {
  falso(M.culpaDelMotorista({motivo: "Cliente cerrado"}, {responsable: "preventa"}));
  falso(M.culpaDelMotorista({motivo: "Cliente cerrado"}, {responsable: "nadie"}));
  cierto(M.culpaDelMotorista({motivo: "Error del preventista"}, {responsable: "motorista"}));
});

grupo("Cargos: a quién le pesa de verdad");

prueba("mandarlo al motorista o a nadie le devuelve la comisión al preventa", () => {
  // 🪤 La comisión del preventa NO la mira el cargo: la mira
  // devolucionPerdonada, en el PEDIDO. Si al decidir no se toca ese campo,
  // la pantalla dice "anulado" y el día de pago le sigue pesando.
  cierto(M.perdonAlPreventa("motorista"));
  cierto(M.perdonAlPreventa("nadie"));
  falso(M.perdonAlPreventa("preventa"));
});

prueba("el estado viejo se sigue escribiendo, para no romper lo de antes", () => {
  igual(M.estadoDeCargo("preventa"), "aceptado");
  igual(M.estadoDeCargo("motorista"), "anulado");
  igual(M.estadoDeCargo("nadie"), "anulado");
});

prueba("un cargo mandado al motorista le baja el tramo del bono", () => {
  // El caso que probó Brayan a mano: $40 devueltos + un cargo de $60.
  igual(M.bonoTramo(40).bono, 25);
  igual(M.bonoTramo(40 + 60).bono, 17.5);
});

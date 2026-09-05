/* Las fechas y el horario.
   ========================

   De acá sale el día en que sale el camión y la hora hasta la que se puede
   levantar un pedido. Un error corre una entrega al domingo, o deja la
   jornada abierta toda la noche.
*/
"use strict";
const { grupo, prueba, igual, cierto, falso } = require("./decir");
const { cargar } = require("./leer");

grupo("Las fechas: correr días");

const { corrido } = cargar(["corrido"]);

prueba("correr un día es correr un día", () => {
  igual(corrido("2026-09-04", 1), "2026-09-05");
  igual(corrido("2026-09-04", -1), "2026-09-03");
  igual(corrido("2026-09-04", 0), "2026-09-04");
});

prueba("cruzar el fin de mes, el fin de año y un año bisiesto", () => {
  igual(corrido("2026-01-31", 1), "2026-02-01");
  igual(corrido("2026-12-31", 1), "2027-01-01");
  igual(corrido("2027-01-01", -1), "2026-12-31");
  igual(corrido("2028-02-28", 1), "2028-02-29", "2028 es bisiesto");
  igual(corrido("2026-02-28", 1), "2026-03-01", "2026 no lo es");
});

prueba("el mes y el día siempre salen con dos cifras", () => {
  igual(corrido("2026-09-30", 1), "2026-10-01");
  igual(corrido("2026-01-01", 0), "2026-01-01");
});

grupo("Las fechas: los días que se trabaja");

function conAjustes(ajustes) { return { ajustes }; }

prueba("por defecto no se trabaja ni sábado ni domingo", () => {
  const { esLaborable } = cargar(["esLaborable"], { S: conAjustes({}) });
  falso(esLaborable("2026-09-05"), "sábado");
  falso(esLaborable("2026-09-06"), "domingo");
  cierto(esLaborable("2026-09-04"), "viernes");
  cierto(esLaborable("2026-09-07"), "lunes");
});

prueba("si la empresa trabaja sábados, se le puede decir", () => {
  const S = conAjustes({ noLaborables: [0] });
  const { esLaborable } = cargar(["esLaborable"], { S });
  cierto(esLaborable("2026-09-05"), "el sábado ahora sí es hábil");
  falso(esLaborable("2026-09-06"));
});

grupo("Las fechas: cuándo sale el camión");

function mundoEntrega(dias, noLaborables) {
  return { ajustes: { diasEntrega: dias, noLaborables } };
}

prueba("un pedido del viernes con un día de entrega sale el lunes", () => {
  // 🔑 Sin saltar el fin de semana, el camión saldría un sábado y el
  // cliente esperaría producto que nadie va a llevar.
  const S = mundoEntrega(1);
  const { fechaEntregaDe } = cargar(["corrido", "esLaborable", "sumarHabiles", "fechaEntregaDe"], { S });
  igual(fechaEntregaDe("2026-09-04"), "2026-09-07");
});

prueba("dos días hábiles desde el jueves caen el lunes", () => {
  const S = mundoEntrega(2);
  const { fechaEntregaDe } = cargar(["corrido", "esLaborable", "sumarHabiles", "fechaEntregaDe"], { S });
  igual(fechaEntregaDe("2026-09-03"), "2026-09-07");
});

prueba("cero días de entrega es el mismo día", () => {
  const S = mundoEntrega(0);
  const { fechaEntregaDe } = cargar(["corrido", "esLaborable", "sumarHabiles", "fechaEntregaDe"], { S });
  igual(fechaEntregaDe("2026-09-04"), "2026-09-04");
});

prueba("aunque no hubiera ningún día hábil, no se queda colgado", () => {
  // Si alguien marca los siete días como no laborables, la cuenta tiene un
  // tope y devuelve algo. Colgarse dejaría al vendedor con el teléfono
  // trabado en media tienda.
  const S = mundoEntrega(1, [0, 1, 2, 3, 4, 5, 6]);
  const { fechaEntregaDe } = cargar(["corrido", "esLaborable", "sumarHabiles", "fechaEntregaDe"], { S });
  const r = fechaEntregaDe("2026-09-04");
  cierto(/^\d{4}-\d{2}-\d{2}$/.test(r), "tiene que devolver una fecha, no colgarse");
});

grupo("El horario: hasta qué hora se vende");

prueba("una hora mal escrita no abre la jornada para siempre", () => {
  const { minutosDeHora } = cargar(["minutosDeHora"]);
  igual(minutosDeHora("18:30"), 1110);
  igual(minutosDeHora("6:05"), 365);
  igual(minutosDeHora("00:00"), 0, "medianoche son cero minutos, no «nada»");
  igual(minutosDeHora(""), null);
  igual(minutosDeHora("18"), null, "sin dos puntos no es una hora");
  igual(minutosDeHora(null), null);
});

function horario(rol, ahora, ajustes) {
  return cargar(["minutosDeHora", "estaCerrado"],
                { S: { rol, ajustes }, minutosAhora: () => ahora });
}

prueba("antes de abrir está cerrado, y después de cerrar también", () => {
  const aj = { horaInicio: "05:00", horaCierre: "17:30" };
  cierto(horario("preventa", 4 * 60, aj).estaCerrado(), "a las 4 de la mañana");
  falso(horario("preventa", 10 * 60, aj).estaCerrado(), "a las 10");
  cierto(horario("preventa", 17 * 60 + 30, aj).estaCerrado(), "a la hora justa de cierre");
  cierto(horario("preventa", 20 * 60, aj).estaCerrado(), "a las 8 de la noche");
});

prueba("oficina y el supervisor no tienen horario", () => {
  const aj = { horaInicio: "05:00", horaCierre: "17:30" };
  falso(horario("admin", 23 * 60, aj).estaCerrado());
  falso(horario("supervisor", 3 * 60, aj).estaCerrado());
});

prueba("sin hora de cierre puesta, no se cierra", () => {
  falso(horario("preventa", 23 * 60, {}).estaCerrado());
});

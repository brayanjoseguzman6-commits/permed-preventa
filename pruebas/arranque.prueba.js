/* La puesta en marcha: qué falta para que el sistema quede andando.
   Lo que se prueba no es cómo se ve, sino la regla: qué cuenta como
   hecho, en qué orden van y --lo más importante-- que la tarjeta
   DESAPAREZCA cuando ya no falta nada. Una tarjeta de instalación que se
   queda para siempre es basura en la pantalla de todos los días. */
const { grupo, prueba, igual, cierto, falso } = require("./decir.js");
const { cargar } = require("./leer.js");

/* 🪤 El estado de la app es un global que el lector entrega UNA vez, al
   revivir el código. Reasignar `mundo.S` después no lo cambia: hay que
   ensuciar el MISMO objeto que quedó capturado. */
const S = {};
const M = cargar(["PASOS_ARRANQUE", "faltaDeArranque", "datosTicket",
                  "laEmpresa"], {S, window: {}});

function con(estado){
  Object.keys(S).forEach(k => delete S[k]);
  Object.assign(S, {usuarios: [], catalogo: [], sectores: [],
                    clientes: [], ajustes: {}}, estado);
  return M.faltaDeArranque().map(p => p.id);
}

const TODO = {
  ajustes:  {ticket: {razon: "Mi Empresa, S.A. de C.V."}},
  usuarios: [{rol: "preventa", activo: true}],
  catalogo: [{cod: "1", nombre: "Algo", precio: 1}],
  sectores: [{id: "s1", nombre: "Ruta 1"}],
  clientes: [{id: "c1", nombre: "Tienda"}]
};

grupo("Puesta en marcha: qué falta");

prueba("una instalación recién nacida no tiene nada hecho", () => {
  igual(con({}), ["empresa", "cuentas", "catalogo", "rutas", "clientes"]);
});

prueba("con todo puesto no falta nada, y la tarjeta no se dibuja", () => {
  igual(con(TODO), []);
});

prueba("el orden manda: primero la ruta, después el cliente", () => {
  const faltan = con({});
  cierto(faltan.indexOf("rutas") < faltan.indexOf("clientes"),
         "un cliente se mete DENTRO de una ruta: la ruta va antes");
  cierto(faltan.indexOf("cuentas") < faltan.indexOf("rutas"),
         "una ruta lleva su preventista: la cuenta va antes");
});

grupo("Puesta en marcha: qué cuenta como hecho");

prueba("el administrador solo no cuenta como equipo", () => {
  // Quien instala YA es admin. Si contara, el paso saldría hecho sin
  // que exista un solo preventista y nadie crearía las cuentas.
  cierto(con({usuarios: [{rol: "admin", activo: true}]}).indexOf("cuentas") >= 0);
  falso(con({usuarios: [{rol: "despacho", activo: true}]}).indexOf("cuentas") >= 0);
});

prueba("una cuenta apagada no cuenta", () => {
  cierto(con({usuarios: [{rol: "preventa", activo: false}]}).indexOf("cuentas") >= 0);
});

prueba("una ruta apagada no cuenta", () => {
  cierto(con({sectores: [{id: "s1", activo: false}]}).indexOf("rutas") >= 0);
  falso(con({sectores: [{id: "s1"}]}).indexOf("rutas") >= 0);
});

prueba("el nombre de la empresa en blanco o en puros espacios no cuenta", () => {
  cierto(con({ajustes: {ticket: {razon: "   "}}}).indexOf("empresa") >= 0);
  cierto(con({ajustes: {}}).indexOf("empresa") >= 0);
  falso(con({ajustes: {ticket: {razon: "X"}}}).indexOf("empresa") >= 0);
});

prueba("si preguntar por un paso revienta, ese paso NO se enseña", () => {
  // Mejor no enseñar el paso que enseñarlo con un dato inventado.
  con({});
  Object.defineProperty(S, "usuarios", {configurable: true,
    get(){ throw new Error("la lista no cargó"); }});
  falso(M.faltaDeArranque().map(p => p.id).indexOf("cuentas") >= 0);
  delete S.usuarios;
});

grupo("Puesta en marcha: no repite lo que ya está escrito");

prueba("los pasos que tienen guía apuntan a una guía de Ayuda", () => {
  const GUIAS = ["guiaRutas", "guiaCuentas", "guiaPadron", "guiaDia"];
  M.PASOS_ARRANQUE.filter(p => p.guia).forEach(p =>
    cierto(GUIAS.indexOf(p.guia) >= 0, p.id + " apunta a una guía que no existe: " + p.guia));
});

prueba("cada paso lleva a una pestaña con la forma grupo:pestaña", () => {
  M.PASOS_ARRANQUE.forEach(p =>
    cierto(/^[a-z]+:[a-zA-Z]+$/.test(p.ir), p.id + " tiene un destino raro: " + p.ir));
});

grupo("Los datos del ticket: quién manda");

prueba("lo que escribió administración le gana al arranque del paquete", () => {
  con({ajustes: {ticket: {razon: "LO QUE ESCRIBIÓ OFICINA"}}});
  igual(M.datosTicket().razon, "LO QUE ESCRIBIÓ OFICINA");
});

prueba("lo que está en blanco cae en el arranque del paquete", () => {
  // Es lo que hace que el ticket salga bien el día uno, sin teclear nada.
  con({});
  const base = (M.laEmpresa().ticket || {});
  igual(M.datosTicket().razon, base.razon || "");
  igual(M.datosTicket().nit, base.nit || "");
});

prueba("un campo en puros espacios cuenta como en blanco", () => {
  /* 🪤 Si contara, borrar el nombre en Ajustes dejaría el ticket con el
     encabezado vacío y sin manera de recuperarlo desde la pantalla. */
  con({ajustes: {ticket: {razon: "   "}}});
  const base = (M.laEmpresa().ticket || {});
  igual(M.datosTicket().razon, base.razon || "");
});

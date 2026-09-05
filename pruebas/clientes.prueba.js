/* Los clientes: no perderlos, no duplicarlos, no bloquear al que sí está.
   =======================================================================

   Acá no se mueve plata directa, pero se mueve confianza: un cliente
   duplicado ensucia el padrón para siempre, y una clave mal armada
   desbloquea en silencio a todos los que se dieron de baja.
*/
"use strict";
const { grupo, prueba, igual, cierto, falso, cerca } = require("./decir");
const { cargar, sacar } = require("./leer");

grupo("Los clientes: el teléfono");

const { telNorm } = cargar(["telNorm"]);

prueba("del teléfono se guardan los últimos ocho dígitos", () => {
  igual(telNorm("7226-7457"), "72267457");
  igual(telNorm("50372267457"), "72267457", "con código de país o sin él, es el mismo");
  igual(telNorm("(503) 7226 7457"), "72267457");
});

prueba("la basura que la gente teclea en el teléfono NO empareja a nadie", () => {
  // 🔑 Sin esto, todos los clientes con «0000000» o sin teléfono se
  // detectan como duplicados entre sí, y salen tiendas a 28 km de
  // distancia marcadas como la misma.
  igual(telNorm("0000000"), "", "un teléfono de puros ceros no es un teléfono");
  igual(telNorm("1111111"), "");
  igual(telNorm("N/A"), "");
  igual(telNorm("123456"), "", "seis dígitos no alcanzan para un teléfono");
  igual(telNorm(""), "");
  igual(telNorm(null), "");
});

grupo("Los clientes: la clave con la que se bloquea");

const { claveCliente } = cargar(["claveCliente"]);

prueba("la clave junta el nombre limpio con el teléfono", () => {
  // Es el id de la lista de bloqueados. Si el modo de armarla cambia,
  // todos los clientes dados de baja se desbloquean sin que nadie lo note.
  igual(claveCliente("Tienda La Esperanza", "7226-7457"), "tiendalaesperanza-72267457");
  igual(claveCliente("Súper Ahorro", "7000-0001"), "superahorro-70000001",
        "sin tildes y sin espacios");
});

prueba("sin nombre o sin teléfono, la clave igual sirve", () => {
  igual(claveCliente("", ""), "sinnombre-sintel");
  igual(claveCliente(null, null), "sinnombre-sintel");
  igual(claveCliente("Tienda", ""), "tienda-sintel");
});

grupo("Los clientes: los que parecen el mismo");

const { parecido } = cargar(["nomNorm", "parecido"]);

prueba("el mismo negocio escrito de dos maneras se parece", () => {
  // Las palabras de relleno («tienda», «la») se quitan antes de comparar.
  igual(parecido("Tienda La Esperanza", "La Esperanza"), 1);
  cierto(parecido("Comedor Marielos", "Marielos") === 1);
});

prueba("dos negocios distintos no se parecen", () => {
  cierto(parecido("La Esperanza", "El Triunfo") < 0.5,
         "no pueden pasar el umbral con el que se marcan duplicados");
});

prueba("comparar contra la nada da cero, no revienta", () => {
  igual(parecido("", "La Esperanza"), 0);
  igual(parecido(null, null), 0);
  igual(parecido("La Esperanza", "La Esperanza"), 1);
});

prueba("un cliente llamado solo «Tienda» no se parece a ningún otro", () => {
  // Al quitarle las palabras de relleno no queda nada que comparar, y dos
  // clientes sin nombre real NO son el mismo negocio. Que dé cero es lo
  // correcto: si diera 1, todas las «Tienda» del padrón se marcarían como
  // duplicadas entre sí.
  igual(parecido("Tienda", "Tienda"), 0);
  igual(parecido("La", "El"), 0);
});

grupo("El mapa: distancias");

const { distMetros, metrosEntre, textoDist, celdaDe } =
  cargar(["distMetros", "metrosEntre", "textoDist", "celdaDe", "CELDA"]);

prueba("la distancia entre dos puntos conocidos sale bien", () => {
  // San Salvador (13.6929, -89.2182) a San Miguel (13.4833, -88.1833):
  // unos 113 km en línea recta.
  const m = distMetros(13.6929, -89.2182, 13.4833, -88.1833);
  cerca(m / 1000, 113, 3, "los kilómetros entre San Salvador y San Miguel");
});

prueba("un punto consigo mismo está a cero metros", () => {
  igual(distMetros(13.48, -88.18, 13.48, -88.18), 0);
});

prueba("cien metros son cien metros", () => {
  // Un grado de latitud son ~111.32 km, así que 0.0009° ≈ 100 m.
  cerca(distMetros(13.48, -88.18, 13.4809, -88.18), 100, 2);
});

prueba("sin punto en el mapa no hay distancia, y eso no es cero", () => {
  igual(metrosEntre({ lat: null, lng: null }, { lat: 13.4, lng: -88.1 }), null);
  igual(metrosEntre({ lat: 13.4, lng: -88.1 }, { lat: null, lng: null }), null);
});

prueba("la distancia se escribe en metros abajo del kilómetro y en km arriba", () => {
  igual(textoDist(0), "A 0 m");
  igual(textoDist(999), "A 999 m");
  igual(textoDist(1000), "A 1 km");
  igual(textoDist(1050), "A 1.1 km");
  igual(textoDist(29500), "A 29.5 km");
  igual(textoDist(null), "", "sin GPS no se escribe nada");
});

prueba("dos tiendas juntas caen en la misma celda del mapa", () => {
  // Las celdas son de unos 55 metros y sirven para buscar duplicados sin
  // comparar cada cliente contra los 2.268 restantes.
  const a = celdaDe(13.4833, -88.1833);
  const b = celdaDe(13.48332, -88.18332);
  igual(a, b, "dos metros de diferencia no pueden cambiar de celda");
  cierto(celdaDe(13.4833, -88.1833) !== celdaDe(13.4933, -88.1833),
         "un kilómetro sí cambia de celda");
  igual(celdaDe(null, null), "");
});

grupo("El mapa: el lazo del zonificador");

const { zoAdentro } = cargar(["zoAdentro"]);
const CUADRADO = [[0, 0], [10, 0], [10, 10], [0, 10]];

prueba("el lazo agarra lo de adentro y deja lo de afuera", () => {
  // Con esto se le cambia la ruta y el preventista a un grupo de clientes
  // de un solo toque: si agarra de más, se reasigna cartera ajena.
  cierto(zoAdentro(5, 5, CUADRADO), "el centro está adentro");
  falso(zoAdentro(15, 5, CUADRADO), "a la derecha está afuera");
  falso(zoAdentro(-1, 5, CUADRADO), "a la izquierda está afuera");
  falso(zoAdentro(5, 20, CUADRADO), "arriba está afuera");
});

prueba("un lazo con forma de C no agarra lo del hueco", () => {
  const c = [[0, 0], [10, 0], [10, 3], [3, 3], [3, 7], [10, 7], [10, 10], [0, 10]];
  cierto(zoAdentro(1, 5, c), "la parte llena de la C");
  falso(zoAdentro(7, 5, c), "el hueco de la C no cuenta");
});

grupo("Nuevo cliente desde el mapa: dos candados encontrados en revisión (05-09-2026)");

/* hojaNuevoCliente() habla con Firestore de principio a fin -igual que
   cerrarEntrega()-, así que se prueba leyendo el código, no ejecutándolo. */
const NUEVO_CLIENTE = sacar("hojaNuevoCliente");

prueba("el botón de guardar se apaga ANTES de las revisiones, no solo antes del guardado final", () => {
  // Antes se apagaba recién en guardarEn(), al final -después de DOS vueltas
  // a la red (bloqueados y reservarCodigo()) sin ningún candado. Un doble
  // toque -muy normal con mala señal- corría las dos revisiones dos veces
  // con S.clientes todavía sin refrescar, y las dos creaban su propio
  // negocio: dos clientes de Firestore para una sola tienda.
  const inicio = NUEVO_CLIENTE.indexOf("#nc-guardar\").onclick");
  const primeraRevision = NUEVO_CLIENTE.indexOf('if (!nom) return alert');
  const seApaga = NUEVO_CLIENTE.indexOf("b.disabled = true");
  cierto(inicio >= 0 && seApaga >= 0 && primeraRevision >= 0 && seApaga < primeraRevision,
    "el botón tiene que apagarse ANTES de la primera revisión, no después");
});

prueba("si no se puede confirmar el candado de 'bloqueados', NO se sigue como si no hubiera nada bloqueado", () => {
  // z.get() casi nunca revienta -un documento que no existe da
  // {exists:false}, no una excepción-. Si SÍ revienta es porque el chequeo
  // de verdad falló (sin señal, que es la condición más común en la calle,
  // justo para la que existe este candado), y un catch vacío dejaba pasar
  // de largo: el punto que administración dio de baja se podía volver a
  // abrir justo cuando la conexión fallaba.
  const desde = NUEVO_CLIENTE.indexOf('db.collection("bloqueados")');
  const bloque = NUEVO_CLIENTE.slice(desde, NUEVO_CLIENTE.indexOf("clienteQueChoca"));
  falso(/catch\(e\)\{\s*\}/.test(bloque),
    "un catch vacío deja crear el cliente aunque no se haya podido confirmar el bloqueo");
  cierto(bloque.includes("No se pudo confirmar"),
    "si el chequeo de bloqueados falla, tiene que avisar y NO crear el cliente");
});

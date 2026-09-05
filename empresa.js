/* ===================================================================
   LA EMPRESA — el único lugar donde va el nombre y los datos fiscales

   Este archivo y `firebase-config.js` son los dos únicos que hay que
   tocar para que este paquete sirva a otra empresa. Nada más.

   Si algún día el nombre aparece escrito en una pantalla y NO sale de
   acá, eso es un defecto: se corrige trayéndolo acá, no escribiéndolo
   dos veces.
=================================================================== */

window.EMPRESA = {
  /* Como se le dice a la empresa. Corto: va en pies de página, en el
     encabezado de las hojas impresas y en el mensaje de WhatsApp. */
  nombre: "PERMED",

  /* El nombre largo, para la pestaña del navegador y la app instalada.
     Si se deja vacío, se usa `nombre`. */
  nombreLargo: "Inversiones PERMED",

  /* La frase que va debajo del nombre en el pie del tablero. Puede ir
     vacía y entonces no se dibuja nada. */
  lema: "",

  /* ===== El nombre de la APLICACIÓN =====
     Ojo: esto NO es el nombre de la empresa, es el nombre del programa,
     el que sale en la pestaña, en la barra de arriba, en la app instalada
     y en el correo con que se le manda la contraseña a alguien.

     Va aparte a propósito. Esta instalación es de PERMED y no tiene por
     qué andar cargando el nombre del producto de otra empresa. Póngale el
     que quiera; si se deja vacío, se usa el nombre de la empresa. */
  app: "",

  /* Solo es un ejemplo gris dentro de la casilla del correo, cuando se
     crea una cuenta nueva. No es la cuenta de nadie. */
  correoEjemplo: "preventa1@ejemplo.com",

  /* ===== Lo que va arriba del ticket =====
     Estos cinco salieron de la ficha del emisor que ya está registrada
     ante Hacienda (NIT 1222-310726-102-2), así que el papel sale bien
     desde el primer día sin que nadie teclee nada.

     Son solo el ARRANQUE: lo que se escriba en Ajustes › Datos del
     ticket manda sobre esto. Se pone acá y no allá porque el que
     instala no tiene por qué saberse el NRC de memoria.

     🔴 Falta el teléfono y el correo, y es a propósito: los que están
     en la ficha del emisor son PRESTADOS de otra empresa. Hay que poner
     los de PERMED antes de imprimir un ticket que los lleve. */
  ticket: {
    razon:     "INVERSIONES PERMED, S.A.S. DE C.V.",
    direccion: "Pasaje #2, Colonia San Carlos, San Miguel",
    iva:       "3905080",
    nit:       "1222-310726-102-2",
    giro:      "Venta al por menor de carnes y productos cárnicos"
  }
};

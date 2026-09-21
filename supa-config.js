/* ===================================================================
   Datos del proyecto de Supabase: la base de la preventa de PERMED.

   Va junto a index.html, en el lugar que antes ocupaba firebase-config.js.

   🔴 ES LA BASE DE PERMED, NO LA DE D'ELIZA. Son dos proyectos de Supabase
   distintos, con sus propios datos y sus propias cuentas. Pegar aquí la URL
   de D'Preventa haría que los teléfonos de PERMED escribieran en la base de
   la otra empresa.

   La llave publicable (`sb_publishable_…`, la que reemplaza a la «anon») NO
   es un secreto: viaja al teléfono en cada carga y sola no deja hacer nada
   —quien manda son las reglas de dp_puede() y la RLS—.
   La llave de SERVICIO nunca va aquí: esa vive en el servidor, en `datos/`.

   Mientras diga PEGUE, la app abre en la pantalla «Falta conectar Supabase»
   y no intenta hablar con ninguna base. Eso es a propósito: es preferible
   una pantalla que lo dice a una app que parece andar y no guarda nada.
=================================================================== */

window.SUPABASE_CONFIG = {
  url:   "https://swypdgynvnbrdaffxveu.supabase.co",
  clave: "sb_publishable_tvBZvFiyNKqLjgzcAmQXZA_YG9FQ7xh"
};

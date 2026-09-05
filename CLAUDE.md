# CLAUDE.md — D'Preventa

Guía para cualquier sesión de Claude que trabaje en este repositorio.
Léela ANTES de tocar nada. Estas reglas las puso **Brayan Chacón**, dueño del
sistema; no son preferencias, salieron de problemas reales.

Todo va en **español**: código, commits, comentarios y respuestas.

## Qué es esto

**D'Preventa** es la app de preventa y reparto de **Brayan Chacón**, un PWA de
un solo `index.html` (Firebase Auth + Firestore, proyecto de Firebase
propio de cada instalación, servido en Firebase Hosting del mismo proyecto). La usan preventistas y motoristas en la calle,
desde el teléfono, todos los días. Está **en producción**.

Se conecta con el sistema de oficina de la empresa que la usa por
un puente: cada entrega real deja una copia en la colección **`porFacturar`**
(un documento por pedido, idempotente por el id del pedido), que el sistema de
oficina lee, factura y responde con el DTE. Ese puente es lo más delicado del
repo: un error ahí es plata.

## Cómo se trabaja (reglas duras)

1. **Nada entra a `main` sin el OK por escrito de Brayan.** Las sesiones
   **proponen** y suben una **rama**; el merge lo da él. Ni un commit directo a
   `main`.
2. **Un tema por rama.** El puente de facturación y el kardex NO viajan juntos:
   si algo se cae en reparto, hay que poder saber de una cuál cambio fue.
3. **Los cambios de pantalla van con maqueta aprobada primero**, no por código
   directo. (Artifact HTML navegable, vista PC y teléfono, aprobada por Brayan
   o Abner antes de escribir una línea.)
4. **Lo que toque plata o el puente con oficina se prueba antes de que lo use
   el reparto** — nunca en horario de ruta (**5:30 a.m. a 6:30 p.m.**).
5. **Verificar que la rama salga de la versión publicada** — el número de
   `CACHE` que tenga hoy `sw.js`. Ojo: el
   `index.html` sigue rotulado **5.4.7** aunque ya lleva cambios encima; el
   rótulo se quedó atrás, así que **el número bueno para saber en qué va el
   repo es el `CACHE` del `sw.js`**, no el 5.4.7. No salir de una copia
   anterior: el `index.html` se mueve varias veces el mismo día; un merge
   sobre base vieja devuelve cosas para atrás sin avisar. Confirmarlo antes
   de empezar.
6. **Ningún secreto entra al repositorio** — ni en un commit que después se
   borre, porque el historial de GitHub lo deja ver igual. Las cuentas de
   servicio, tokens y llaves viven fuera del bundle. El `firebase-config.js` sí
   va: es config web pública (la protegen las reglas de Firestore, no el
   secreto).
7. **Proponer el cambio antes de editar** cuando la instrucción lo pida, y
   siempre que toque plata, el puente o lógica central de entrega.
8. **Las pruebas tienen que estar en verde antes de subir.**
   `node pruebas/correr.js` — tarda un segundo y no hay que instalar nada.
   Corren solas en GitHub con cada subida. Si se toca algo de plata, del
   puente o de quién ve qué, **la prueba va en el mismo commit que el
   cambio**. Ver `pruebas/LEEME.md`.

## Las pruebas

```
node pruebas/correr.js            todas (unas 93, un segundo)
node pruebas/correr.js dinero     solo un grupo
```

No tocan el `index.html`: lo leen como texto, recortan la función que
quieren probar y la corren con un mundo de mentira alrededor. Así el
archivo único y sin build se queda como está.

Lo que cuidan hoy: el **redondeo y los totales** (que el pedido, la entrega
y lo que se factura digan el mismo número), **el puente con oficina** (que
lo cobrado sea lo facturado, y que las guardas sigan puestas), **quién ve
qué** (que a un preventista no le salga la cartera ajena ni la pantalla en
blanco), **las fechas** (cuándo sale el camión, hasta qué hora se vende),
**los clientes** (duplicados, bloqueos, distancias) y **la estructura**
(que ninguna pestaña ni botón apunte a una función borrada).

## Qué hay adentro

`index.html` (la app entera, con el JS en línea) · `sw.js` (service worker) ·
`manifest.json` · íconos · `leaflet.js`/`leaflet.css` · `qrcode.js` ·
`firebase-config.js` (config web pública) · `reglas-firestore.txt` (las reglas
de Firestore) · `catalogo-inicial.json` y `costos-iniciales.json` (datos de
arranque) · `PASOS-FIRESTORE.md`.

## Cosas técnicas que una sesión necesita saber

- **El dinero se maneja con `dosDec`** (dos decimales, redondeo aritmético).
  El total de una entrega (`totalEntrega()`) suma los **totales de línea ya
  redondeados**, no el redondeo de la suma cruda — así el pedido
  (`pedidos.totalEntregado`), la entrega (`entregas.total`) y el puente
  (`porFacturar.total`) salen del mismo cálculo y dicen el mismo número.
- **El puente `porFacturar`** es idempotente por el id del pedido: una entrega
  = un documento, imposible facturar doble aunque el aviso llegue repetido. No
  romper eso.
- **Reglas de Firestore**: en `reglas-firestore.txt`. Se prueban con el
  emulador (`firebase emulators:start --only firestore`), nunca en producción.
  Cada cuenta lee solo lo suyo donde hay plata (jornadas, comisiones).
- **El service worker cachea la app.** Al publicar una versión, **subir el
  número de `CACHE` en `sw.js`**, o los teléfonos siguen con la versión vieja.
- **El código va todo en un `<script>` en línea.** Un CSP que no incluya
  `'unsafe-inline'` lo bloquea entero y deja la pantalla en blanco. Los hosts
  externos que la app usa: `www.gstatic.com` (Firebase), los tiles de
  OpenStreetMap y ArcGIS, y `router.project-osrm.org` (ruteo).
- **La app cacha sus errores**: un fallo a medio pintar queda en la pantalla de
  **Diagnóstico**. Ahí sale la primera línea del error — es lo primero que hay
  que pedir/mirar cuando algo "se traba".

## Deploy

**Publicar es un comando**: `firebase deploy --only hosting`. No sale a la
calle hasta que alguien lo corre. O sea: **fusionar a `main` es
publicar**. No hay paso aparte ni botón de por medio — el merge sale a la
calle, a los teléfonos del reparto, de una.

Por eso: **no se fusiona a `main` en horario de ruta (5:30 a.m. a 6:30 p.m.)**.
La única excepción la da **Brayan**, caso por caso (hoy, 2 de septiembre de
2026, dio una). Lo normal es publicar fuera de ese horario.

**Cada publicación sube el `CACHE` del `sw.js`**, o los teléfonos siguen con la
versión vieja. Y ese número es **el que distingue una versión de otra** — no el
rótulo del `index.html`, que se quedó en 5.4.7.

## Pendientes (en orden, cada uno en su rama)

1. **Escrituras de la entrega no atómicas.** Juntar en un `writeBatch` las tres
   escrituras de `cerrarEntrega`, e incluir `salidasDeEntrega` (hoy queda
   fuera: llama a `anotarMovimiento` después, sin esperarlo ni ver si falló).
   Cambia lógica central: probado con calma, fuera de horario de ruta.
2. **`porFacturar` se reescribe sin mirar si ya se facturó.** El `.set()` pisa
   el documento y devuelve `estadoFactura` a `pendiente` y `dte` a nulo. Hoy no
   es alcanzable (no hay cómo reabrir una entrega cerrada); arreglarlo **antes**
   de que exista cualquier botón de "corregir entrega": no pisar esos dos
   campos si el documento ya existe facturado.
3. **Factor de empaque — bloqueado por dato.** La salida se anota con
   `porBulto: 1`, así que un six pack baja uno del producto base y no seis.
   Entra cuando oficina cargue las 44 equivalencias: leer el campo `unidad` y
   convertir al descontar.
4. **Kilometraje y combustible obligatorios para el motorista**, como lo pidió
   el jefe.
5. **Alinear la hora de cierre.** Ajustes dice 16:00 y las reglas de Firestore
   permiten hasta 18:45. Cuál es la buena es decisión de Brayan/Abner.

# Pasos en Firestore — versión 1.5 (pedidos)

Proyecto: **el suyo** — el que creó en Firebase y pegó en `firebase-config.js`.

Nada de lo que sigue toca `configuracion` ni `usuarios`. Si algo sale mal,
borra las colecciones nuevas y el catálogo queda igual.

---

## 1. Publicar las reglas

Firebase -> **Firestore Database** -> pestana **Reglas**.

**Las reglas ya no van copiadas aqui.** Estan en el archivo
`reglas-firestore.txt` que viene en este mismo paquete: abrilo, copialo
completo y pegalo en la consola. Ese archivo es el unico bueno.

Las que estaban escritas en este manual eran de la version 1.4 y solo
cubrian 14 colecciones. La app de hoy escribe en 22. Si se pegan las
viejas, `entregas`, `porFacturar`, `movimientos`, `jornadas`, `posiciones`,
`cargos`, `comisiones` y `bodegaDia` quedan cerradas y **la app deja de
guardar sin dar ningun error visible** -- incluida la cola de facturacion,
que es el puente con el sistema de oficina. Por eso se borraron de aqui.

Al pegar, revisa que arriba diga `rules_version = '2';` y que abajo
aparezca la linea `match /{document=**} { allow read, write: if false; }`.
Si no aparece, el pegado quedo cortado.

---

## 2. Crear las colecciones

No hay que crearlas a mano: se crean solas cuando la app guarda el primer
documento. Entrá con la cuenta de administración y usá las pestañas nuevas.

Si preferís verlas en Firestore antes, esta es la forma de cada una.

### `sectores`
| campo | tipo | ejemplo |
|---|---|---|
| nombre | string | `Centro` |
| dia | number | `2` |
| activo | boolean | `true` |

El día va de **0 a 6**, donde 0 = domingo, 1 = lunes … 6 = sábado.

### `clientes`
| campo | tipo | ejemplo |
|---|---|---|
| nombre | string | `Tienda La Bendición` |
| telefono | string | `7777-7777` — **obligatorio**, lo usa el motorista |
| codigo | string | `C-001` |
| sectorId | string | el id del documento del sector |
| direccion | string | `Calle Principal #4` |
| referencia | string | `frente a la iglesia` |
| orden | number | `3` |
| activo | boolean | `true` |
| listaId | string | la lista de precios que se le aplica (opcional) |
| foto | string | foto del negocio en base64 (la pone el preventista) |
| lat | number | `13.478210` (la pone la app) |
| lng | number | `-88.177930` (la pone la app) |

**El `codigo` es el mismo que usan en oficina.** Es el que va a permitir
emparejar con el otro sistema el día que se conecten.

### `existencias`
El **id del documento es el código del producto** (`BEB-001`, no un id
automático). Solo se cargan los productos escasos.

| campo | tipo | ejemplo |
|---|---|---|
| disponible | number | `40` |
| nombre | string | `Delipop Bolsa 300ml` |
| actualizado | timestamp | automático |

Producto que no esté en esta colección se vende sin tope.

### `metas`
El **id del documento** es `mes_uid`, por ejemplo `2026-08_aBc123…`.

| campo | tipo | ejemplo |
|---|---|---|
| mes | string | `2026-08` |
| preventaUid | string | el UID del preventista |
| preventaNombre | string | |
| monto | number | `5000` |

Se cargan desde **Administrar → Metas y equipo**.

### `visitas` — la escribe la app sola
| campo | ejemplo |
|---|---|
| fecha | `2026-08-22` |
| preventaUid / preventaNombre | del que entró |
| sectorId, clienteId, clienteNombre, clienteCodigo | |
| resultado | `pedido`, `Cerrado`, `Sin dinero`, `Tiene producto`, `No quiso`… |
| mes | `2026-08` |
| monto | `45.20` |
| pedidoId | solo si hubo venta |
| inicio, duracionSeg | si se usó **Iniciar visita** |
| lat, lng, exactitud | dónde estaba el preventista |
| metrosDelCliente | distancia al punto guardado del cliente |
| foto | evidencia en base64, si se tomó |

### `pedidos` — la escribe la app sola
| campo | ejemplo |
|---|---|
| tipo | `pedido`, `cambio`, `extra` |
| fecha | `2026-08-22` |
| mes | `2026-08` |
| fechaEntrega | `2026-08-24` — la calcula sola según los días configurados |
| estado | `pendiente` |
| preventaUid / preventaNombre | |
| sectorId, clienteId, clienteNombre, clienteCodigo | |
| lineas | lista: `{cod, nombre, cat, cant, precio, total}` |
| total | `45.20` |
| nota | texto libre |

---

## 3. Cargar los datos

Entrá a la app con la cuenta de administración → **Administrar**:

1. **Sectores** — creá uno por día que salen.
2. **Clientes** — uno por uno, o pegá la lista completa con el formato
   `codigo;nombre;telefono;direccion;referencia`, una línea por cliente.
3. **Existencias** — solo los productos escasos. Los demás dejalos fuera.

---

## 3b. Puntear los clientes en el mapa

Las coordenadas no se escriben a mano. Hay tres formas, todas desde **Ruta →
Mapa**:

- **＋ Cliente donde estoy** — parado frente al negocio. Toma el GPS y abre
  el formulario ya con el punto puesto. Es la forma normal de levantar la
  ruta la primera vez.
- **Elegir en el mapa** — toca el botón y después el punto exacto. Sirve
  para agregar sin estar ahí.
- **Marcar ubicación** dentro de un cliente que ya existe pero no tiene punto.

Si la precisión del GPS es mala, avisa antes de guardar.

Una vez marcados, el botón **Mapa** arriba de la lista muestra el sector con
los puntos numerados en orden de visita: verde el que ya compró, rojo el que
no, azul el pendiente. Tocando un punto se abre el cliente.

**Cómo llegar** abre Google Maps con la dirección puesta.

El mapa necesita señal para cargar las calles. Los pedidos sí funcionan sin
señal; el mapa no.

---

## 3c. Sectores por preventista y metas

- En **Sectores**, cada uno puede quedar a cargo de un preventista. Ese
  preventista solo ve sus sectores; si se deja en "Todos lo ven", lo ven
  todos. Es lo que evita que un vendedor vea la ruta de otro.
- En **Metas y equipo** se pone el monto del mes de cada quien. El
  preventista ve su avance en **Mi día**; la oficina ve la tabla completa
  ordenada por venta, con efectividad, ticket promedio y minutos por visita.

## 3d. Sobre el registro de visitas

Si el preventista toca **Iniciar visita** antes de atender al cliente, queda
guardado cuánto duró, desde dónde la hizo y a cuántos metros estaba del punto
del cliente. También puede adjuntar una foto como evidencia.

Esto es control de trabajo en calle y conviene que el personal lo sepa de
antemano — funciona mejor cuando se presenta como respaldo del vendedor
(prueba de que sí visitó) que como vigilancia.

La app **no** rastrea la posición todo el día: solo la toma cuando se abre
una visita o se marca un punto.

---

## 3e. Roles

| rol | qué ve |
|---|---|
| `preventa` | su ruta, su día, sus pedidos |
| `supervisor` | además: Tablero, Foco, Metas, Agenda y Pedidos del equipo. **No ve costos ni márgenes** |
| `despacho` | el mapa con los clientes que tienen pedido, la entrega y su total del día. **No toma pedidos ni crea clientes** |
| `admin` | todo, incluido costos, catálogo y reglas de comisión |

El rol se pone en el documento del usuario, igual que los demás.

## 3f. Tabla de foco y comisiones

- **Foco y comisiones** (Administrar): se marcan los productos del mes con su
  meta en unidades para todo el equipo. El avance se calcula solo desde los
  pedidos y se ve por producto y por vendedor.
- El botón **Ver los 10 de mejor margen** ordena el catálogo por margen sobre
  el costo y deja agregarlos al foco de un toque. Solo lo ve el administrador,
  porque usa los costos.
- Las reglas de comisión (porcentaje sobre venta, bono por meta, bono por foco)
  se cargan una vez y quedan en `configuracion/comisiones`. La comisión que
  muestra el sistema es **estimada**: sirve para que el vendedor se ubique, no
  reemplaza la planilla.
- El vendedor ve su foco y su comisión estimada en **Mi día**.

---

## 4. Probar antes de repartirlo

1. Entrá con una cuenta de preventa.
2. En **Ruta** debe salir el sector del día con sus clientes.
3. Tocá un cliente → **Tomar pedido** → elegí productos → **Ver pedido**
   → **Guardar**.
4. El cliente queda marcado con el monto y el avance sube.
5. En **Mi día** aparecen las cifras.
6. Poné el teléfono en modo avión y tomá otro pedido: debe guardarlo igual
   y subirlo solo al volver la señal.

---

## Nota sobre el precio

El precio de cada línea se **copia** al guardar el pedido. Si mañana cambia
el precio del catálogo, los pedidos viejos conservan el que tenían. Eso es
a propósito.

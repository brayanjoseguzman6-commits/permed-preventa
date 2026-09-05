# Las pruebas de D'Preventa

```
node pruebas/correr.js            todas
node pruebas/correr.js dinero     solo las de dinero
```

Tarda **un segundo**. No hay que instalar nada: solo Node.
Corren solas en GitHub con cada subida, así que si algo sale en rojo se ve
antes de que Cloudflare publique.

## Cómo funcionan sin tocar el index.html

D'Preventa es **un solo archivo**, sin build y sin dependencias, y eso es
una decisión buena: se publica copiando un archivo. Las pruebas no la
pueden romper.

Así que no se le pone `export` a nada. En vez de eso, `leer.js` abre el
`index.html` **como texto**, recorta la función que se quiere probar y le
da vida con `new Function`, con un mundo de mentira alrededor:

```js
const { cargar } = require("./leer");

const S = { carrito: [{ cant: 2, precio: 1.5 }] };
const { totalCarrito } = cargar(["dosDec", "totalCarrito"], { S });
igual(totalCarrito(), 3);
```

`cargar` recibe **los nombres** de lo que hace falta —da igual si está
escrito como `function` o como `const … =>`— y el mundo que esas funciones
van a ver. Si una función usa algo que no se le pasó, la prueba revienta
diciendo qué le faltó, que es justo lo que uno quiere saber.

## Cómo agregar una prueba

Un archivo nuevo `pruebas/loquesea.prueba.js`. El corredor lo encuentra
solo.

```js
"use strict";
const { grupo, prueba, igual, cierto, falso } = require("./decir");
const { cargar } = require("./leer");

grupo("De qué se trata este archivo");

prueba("lo que tiene que pasar, dicho en una frase", () => {
  const { loQueSea } = cargar(["loQueSea"]);
  igual(loQueSea(2), 4);
});
```

Lo que hay para comprobar: `igual`, `cierto`, `falso`, `contiene`,
`revienta`, `cerca`. Nada más, y no hace falta más.

**La frase de la prueba se lee sola.** Si hay que abrir el código para
entender qué se está probando, está mal escrita. Y el comentario de arriba
dice *por qué importa*, no qué hace la función.

## Qué hay hoy

| Archivo | De qué cuida |
|---|---|
| `dinero.prueba.js` | Redondeo, totales, precios, piso de rebaja, bono. |
| `puente.prueba.js` | Que lo que se cobra sea lo que oficina factura. |
| `cartera.prueba.js` | Que cada preventista vea lo suyo, ni de más ni de menos. |
| `fechas.prueba.js` | Cuándo sale el camión y hasta qué hora se vende. |
| `clientes.prueba.js` | Duplicados, bloqueos, distancias y el lazo del mapa. |
| `estructura.prueba.js` | Que nada apunte al vacío: pestañas, botones, sintaxis. |

## Lo que NO se puede probar así

Todo lo que dibuja pantalla (`pintar*`, `hoja*`, `admin*`) y todo lo que
habla con Firestore (`cerrarEntrega`, `guardarPedido`, los `escuchar*`).
Para esas, lo que se prueba son **sus piezas**: el cálculo por un lado y,
por el otro, que las guardas sigan escritas donde tienen que estar —eso lo
hace `puente.prueba.js` leyendo el código—.

El día que valga la pena, la salida es extraer esas piezas a funciones
propias. Mientras tanto, esto cubre lo que cuesta plata.

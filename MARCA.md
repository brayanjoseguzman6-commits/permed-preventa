# La marca: las cinco imágenes que faltan

Este paquete **no trae logo ni iconos, y es a propósito**. Traía los de
D'ELIZA, y mandar la marca de otra empresa dentro de la app de PERMED es
peor que no mandar ninguna.

Mientras no estén, la app **no se rompe**: donde iba el dibujo se escribe
el nombre de la empresa (`EMPRESA.nombre`, en `empresa.js`). Se ve
correcto, solo que sin logo.

## Qué hay que poner

Los cinco archivos van **en la misma carpeta que `index.html`**, con
**exactamente estos nombres**:

| Archivo | Qué es | Tamaño | Fondo |
|---|---|---|---|
| `logo.png` | el logo sobre fondo **oscuro** (barra azul de arriba) | alto 26 px o más, ancho libre | transparente |
| `logo-oscuro.png` | el logo sobre fondo **claro** (menú lateral, tickets) | alto 26 px o más, ancho libre | transparente |
| `icon-192.png` | el icono de la app instalada | 192 × 192 | sólido |
| `icon-512.png` | el mismo, grande | 512 × 512 | sólido |
| `icon-maskable-512.png` | el mismo, con margen | 512 × 512 | sólido, y el dibujo dentro del **80 % central** — Android le recorta las orillas |

Los dos primeros llevan **transparencia**; los tres iconos, no: Android
los pone sobre su propio fondo y una transparencia sale con manchas.

## Después de ponerlos: dos líneas en `sw.js`

En la lista `BASICOS` hay un comentario que dice exactamente qué agregar.
Se descomenta y listo.

> ⚠️ Ese paso importa. `addAll` es **todo o nada**: si la lista nombra un
> archivo que no existe, la instalación del service worker falla entera y
> **la app deja de funcionar sin señal sin decir nada**. Por eso los
> nombres están comentados y no puestos.

Y súbale uno al número de `CACHE` (`preventa-v1` → `preventa-v2`) para
que los teléfonos que ya tengan la app se traigan las imágenes nuevas.

## Un detalle que va a ver quien abra la consola

Mientras los archivos no estén, el navegador anota un `404` por cada uno
en su consola. **No es un defecto y no se ve en la pantalla**: la app lo
atiende y en lugar del dibujo escribe el nombre de la empresa. Desaparece
solo en cuanto se pongan las imágenes.

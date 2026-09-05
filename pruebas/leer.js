/* Sacar una función del index.html para poder probarla.
   =====================================================

   D'Preventa es UN SOLO ARCHIVO, sin build y sin dependencias, y eso es
   una decisión buena: se publica copiando un archivo. Las pruebas no la
   pueden romper, así que NO se le pone `export` a nada ni se parte el
   código en módulos. En vez de eso, acá se lee el archivo como texto, se
   recorta la función que se quiere probar y se le da vida con
   `new Function`, con un mundo de mentira alrededor.

   🔑 Recortar la función NO es contar llaves y ya. En este archivo hay
   llaves adentro de textos ('style="{...}"'), adentro de comentarios y
   adentro de expresiones regulares (/\D/g). Un contador ingenuo corta la
   función en el lugar equivocado y la prueba revienta por una razón que no
   es la suya. Por eso el escáner de abajo sabe en qué está parado.
*/
"use strict";
const fs = require("fs");
const path = require("path");

const RUTA = path.join(__dirname, "..", "index.html");
let _texto = null;

/** El index.html entero, leído una sola vez. */
function fuente() {
  if (_texto === null) _texto = fs.readFileSync(RUTA, "utf8");
  return _texto;
}

/** Los bloques <script> propios (los que no traen src). */
function bloques() {
  const encontrados = [];
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(fuente())) !== null) encontrados.push(m[1]);
  return encontrados;
}

/* Las palabras después de las cuales una barra abre una expresión regular
   y no es una división.

   🪤 Acá vivió el único caso que se me escapó al escribir esto: en
   `return /[",;\n]/.test(t)`, mirar el último CARÁCTER da la «n» de
   «return» —que parece un identificador, o sea división—, y entonces el
   escáner se metía en la comilla de adentro de la regex y se comía media
   función. Hay que mirar la última PALABRA. */
const PALABRAS_ANTES_DE_REGEX = new Set([
  "return", "typeof", "case", "in", "of", "new", "delete", "void", "do",
  "else", "yield", "await", "instanceof",
]);

/** ¿La barra que está en `i` abre una expresión regular, o divide? */
function abreRegex(txt, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(txt[j])) j--;
  if (j < 0) return true;
  const c = txt[j];
  // Después de algo que devuelve un valor --un nombre, un paréntesis o un
  // corchete que cierran-- la barra DIVIDE.
  if (c === ")" || c === "]") return false;
  if (/[\w$]/.test(c)) {
    let k = j;
    while (k >= 0 && /[\w$]/.test(txt[k])) k--;
    return PALABRAS_ANTES_DE_REGEX.has(txt.slice(k + 1, j + 1));
  }
  return true;   // después de un símbolo, siempre abre
}

/** El índice del `}` que cierra al `{` que está en `desde`. */
function cierre(txt, desde) {
  let prof = 0;
  let i = desde;
  let anterior = "";           // último carácter que no era espacio
  const pila = [];             // para las plantillas anidadas
  while (i < txt.length) {
    const c = txt[i];
    const dos = txt.slice(i, i + 2);

    if (dos === "//") {                       // comentario de línea
      const fin = txt.indexOf("\n", i);
      i = fin < 0 ? txt.length : fin;
      continue;
    }
    if (dos === "/*") {                       // comentario de bloque
      const fin = txt.indexOf("*/", i + 2);
      i = fin < 0 ? txt.length : fin + 2;
      continue;
    }
    if (c === '"' || c === "'") {             // texto
      i++;
      while (i < txt.length && txt[i] !== c) i += txt[i] === "\\" ? 2 : 1;
      i++;
      anterior = c;
      continue;
    }
    if (c === "`") {                          // plantilla
      i++;
      while (i < txt.length) {
        if (txt[i] === "\\") { i += 2; continue; }
        if (txt[i] === "`") { i++; break; }
        if (txt.slice(i, i + 2) === "${") {   // adentro vuelve a haber código
          let p = 1;
          i += 2;
          while (i < txt.length && p > 0) {
            if (txt[i] === "{") p++;
            else if (txt[i] === "}") p--;
            i++;
          }
          continue;
        }
        i++;
      }
      anterior = "`";
      continue;
    }
    if (c === "/" && abreRegex(txt, i)) {              // expresión regular
      i++;
      let enCorchete = false;
      while (i < txt.length) {
        if (txt[i] === "\\") { i += 2; continue; }
        if (txt[i] === "[") enCorchete = true;
        else if (txt[i] === "]") enCorchete = false;
        else if (txt[i] === "/" && !enCorchete) { i++; break; }
        else if (txt[i] === "\n") break;      // no era regex
        i++;
      }
      while ("gimsuyd".includes(txt[i])) i++; // las banderas
      anterior = "/";
      continue;
    }

    if (c === "{") prof++;
    else if (c === "}") {
      prof--;
      if (prof === 0) return i;
    }
    if (!/\s/.test(c)) anterior = c;
    else if (c === "\n") anterior = "\n";
    i++;
  }
  throw new Error("no se encontró el cierre de la llave que abre en " + desde);
}

/** El código de una función `function nombre(...)`, tal como está escrita. */
function sacarFuncion(nombre) {
  const txt = fuente();
  const re = new RegExp("(?:^|[\\n;}])\\s*(?:async\\s+)?function\\s+" +
                        nombre + "\\s*\\(", "");
  const m = re.exec(txt);
  if (!m) throw new Error("no existe la función «" + nombre + "» en index.html");
  // El `async` va ADENTRO del recorte: si se deja afuera, el cuerpo queda
  // con `await` suelto y no compila.
  const arranca = m.index + m[0].search(/(?:async\s+)?function/);
  const llave = txt.indexOf("{", txt.indexOf(")", arranca));
  return txt.slice(arranca, cierre(txt, llave) + 1);
}

/**
 * La declaración COMPLETA de una constante: `const X = ...;`.
 *
 * En este archivo la mitad de las funciones chicas están escritas como
 * `const dosDec = n => ...`, y esas no las encuentra el buscador de
 * `function`. Para quien escribe una prueba eso da igual: pide el nombre y
 * ya, sin tener que saber cómo se declaró.
 */
function sacarConst(nombre) {
  return "const " + nombre + " = " + valorDeConst(nombre) + ";";
}

/** El valor de una constante, sin el `const X =` de adelante. */
function valorDeConst(nombre) {
  const txt = fuente();
  const re = new RegExp("(?:^|\\n)\\s*const\\s+" + nombre + "\\s*=\\s*", "");
  const m = re.exec(txt);
  if (!m) throw new Error("no existe la constante «" + nombre + "»");
  let i = m.index + m[0].length;
  if (txt[i] === "{" || txt[i] === "[") {
    const abre = txt[i];
    const cierra = abre === "{" ? "}" : "]";
    let prof = 0, j = i;
    // Se reusa el escáner de arriba para los objetos; para los arreglos se
    // cuenta parejo, que en este archivo alcanza.
    if (abre === "{") return txt.slice(i, cierre(txt, i) + 1);
    while (j < txt.length) {
      if (txt[j] === abre) prof++;
      else if (txt[j] === cierra) { prof--; if (prof === 0) return txt.slice(i, j + 1); }
      else if (txt[j] === '"' || txt[j] === "'") {
        const q = txt[j++];
        while (j < txt.length && txt[j] !== q) j += txt[j] === "\\" ? 2 : 1;
      }
      j++;
    }
  }
  return txt.slice(i, finDeSentencia(txt, i));
}

/**
 * El `;` que cierra una sentencia, saltándose los que están adentro.
 *
 * 🪤 `const telNorm = t => { ... };` tiene un `;` ADENTRO del cuerpo, y
 * cortar en el primero deja media función. Hay que contar las llaves --y
 * los paréntesis y los corchetes-- y saltarse textos, comentarios y
 * expresiones regulares, igual que `cierre()`.
 */
function finDeSentencia(txt, desde) {
  let prof = 0, i = desde;
  while (i < txt.length) {
    const c = txt[i], dos = txt.slice(i, i + 2);
    if (dos === "//") { const f = txt.indexOf("\n", i); i = f < 0 ? txt.length : f; continue; }
    if (dos === "/*") { const f = txt.indexOf("*/", i + 2); i = f < 0 ? txt.length : f + 2; continue; }
    if (c === '"' || c === "'") {
      i++;
      while (i < txt.length && txt[i] !== c) i += txt[i] === "\\" ? 2 : 1;
      i++; continue;
    }
    if (c === "`") {
      i++;
      while (i < txt.length) {
        if (txt[i] === "\\") { i += 2; continue; }
        if (txt[i] === "`") { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "/" && abreRegex(txt, i)) {
      i++;
      let enCorchete = false;
      while (i < txt.length) {
        if (txt[i] === "\\") { i += 2; continue; }
        if (txt[i] === "[") enCorchete = true;
        else if (txt[i] === "]") enCorchete = false;
        else if (txt[i] === "/" && !enCorchete) { i++; break; }
        else if (txt[i] === "\n") break;
        i++;
      }
      while ("gimsuyd".includes(txt[i])) i++;
      continue;
    }
    if (c === "{" || c === "(" || c === "[") prof++;
    else if (c === "}" || c === ")" || c === "]") prof--;
    else if (c === ";" && prof === 0) return i;
    i++;
  }
  return txt.length;
}

/**
 * El código de algo del index.html, se llame como se llame: una función
 * declarada con `function`, o una constante con flecha. Se pide por nombre.
 */
function sacar(nombre) {
  try { return sacarFuncion(nombre); }
  catch (noEsFuncion) {
    try { return sacarConst(nombre); }
    catch (tampoco) {
      throw new Error("no existe «" + nombre + "» en index.html (ni como " +
                      "function ni como const)");
    }
  }
}

/**
 * Da vida a unas funciones del index.html, con el mundo que se le diga.
 *
 * `mundo` son las variables globales que esas funciones necesitan (`S`,
 * `$`, `db`…). Lo que no se le pase, no existe: si una función lo usa, la
 * prueba revienta diciendo qué le faltó, que es justo lo que se quiere
 * saber.
 */
function cargar(nombres, mundo = {}) {
  const codigo = nombres.map(sacar).join("\n\n");
  const claves = Object.keys(mundo);
  const cuerpo = codigo + "\n\nreturn {" + nombres.join(",") + "};";
  try {
    return new Function(...claves, cuerpo)(...claves.map(k => mundo[k]));
  } catch (e) {
    throw new Error("no se pudo cargar [" + nombres.join(", ") + "]: " + e.message);
  }
}

module.exports = { fuente, bloques, sacar, sacarFuncion, sacarConst,
                   valorDeConst, cargar, cierre, RUTA };

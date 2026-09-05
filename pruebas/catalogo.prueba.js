/* Cargar el catálogo de Excel no puede borrar trabajo.
   ======================================================

   Antes, subir un Excel REEMPLAZABA el catálogo completo: un precio que
   alguien había corregido a mano en la app volvía al valor viejo del
   archivo, sin avisar. `fusionarCatalogo` es lo que evita eso: un producto
   editado a mano queda intacto, y lo que traía el Excel para él se guarda
   aparte (`pendienteExcel`) para que alguien decida, no para perderse.
*/
"use strict";
const { grupo, prueba, igual, cierto, falso } = require("./decir");
const { cargar } = require("./leer");

grupo("El catálogo: fusionar con el Excel sin perder ediciones");

const { fusionarCatalogo } = cargar(["fusionarCatalogo"]);

prueba("un producto nuevo en el Excel se agrega tal cual", () => {
  const actuales = [{ cod: "A", nombre: "Alitas", precio: 1 }];
  const nuevos = [{ cod: "B", nombre: "Bebida", precio: 2 }];
  const { productos, respetados } = fusionarCatalogo(actuales, nuevos);
  igual(productos.map(p => p.cod).sort(), ["A", "B"]);
  igual(respetados, []);
});

prueba("un producto sin marca de edición se actualiza con el Excel", () => {
  const actuales = [{ cod: "A", nombre: "Alitas viejas", precio: 1 }];
  const nuevos = [{ cod: "A", nombre: "Alitas", precio: 1.5 }];
  const { productos } = fusionarCatalogo(actuales, nuevos);
  igual(productos[0].nombre, "Alitas", "sin edición manual, gana el Excel");
  igual(productos[0].precio, 1.5);
});

prueba("un producto editado a mano NO se pisa con el Excel", () => {
  const actuales = [{ cod: "A", nombre: "Alitas", precio: 9.99,
                       editado: { por: "Brayan", uid: "u1", en: "2026-09-05" } }];
  const nuevos = [{ cod: "A", nombre: "Alitas (excel)", precio: 1 }];
  const { productos, respetados } = fusionarCatalogo(actuales, nuevos);
  igual(productos[0].nombre, "Alitas", "la edición manual manda");
  igual(productos[0].precio, 9.99);
  igual(respetados, ["A"]);
});

prueba("lo que trae el Excel para un producto editado queda guardado aparte", () => {
  const actuales = [{ cod: "A", nombre: "Alitas", precio: 9.99,
                       editado: { por: "Brayan", uid: "u1", en: "2026-09-05" } }];
  const nuevos = [{ cod: "A", nombre: "Alitas (excel)", precio: 1 }];
  const { productos } = fusionarCatalogo(actuales, nuevos);
  igual(productos[0].pendienteExcel.nombre, "Alitas (excel)",
        "la versión del Excel no se pierde: queda ahí para revisarla");
});

prueba("un producto que no viene en el Excel nuevo no se borra", () => {
  const actuales = [{ cod: "A", nombre: "Alitas", precio: 1 },
                     { cod: "B", nombre: "Bebida", precio: 2 }];
  const nuevos = [{ cod: "A", nombre: "Alitas", precio: 1 }];
  const { productos } = fusionarCatalogo(actuales, nuevos);
  igual(productos.map(p => p.cod).sort(), ["A", "B"],
        "que falte en el Excel no quiere decir que dejó de existir");
});

prueba("al soltar la marca de edición, el próximo Excel ya lo actualiza normal", () => {
  const actuales = [{ cod: "A", nombre: "Alitas (excel)", precio: 1 }]; // ya sin `editado`
  const nuevos = [{ cod: "A", nombre: "Alitas nuevas", precio: 1.2 }];
  const { productos, respetados } = fusionarCatalogo(actuales, nuevos);
  igual(productos[0].nombre, "Alitas nuevas");
  igual(respetados, []);
});

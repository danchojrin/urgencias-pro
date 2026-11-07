// Ejecutar: node test/extractor.test.js   (sin dependencias; solo funciones puras del extractor)
const assert = require("assert");

let pasados = 0;
const fallos = [];
function test(nombre, fn) {
  try {
    fn();
    pasados++;
    console.log("  ok  ", nombre);
  } catch (e) {
    fallos.push(nombre);
    console.log("  FALLO", nombre, "\n       ", e.message);
  }
}

let X = {};
test("el extractor se puede cargar en Node (funciones puras exportadas)", () => {
  X = require("../extractor.js");
  assert.strictEqual(typeof X.codigoCelda, "function");
});

test("codigoCelda: primera línea de la celda", () => {
  assert.strictEqual(X.codigoCelda("D1\n07:50-20:10"), "D1");
  assert.strictEqual(X.codigoCelda("  N2(-Lac)\n19:50"), "N2(-Lac)");
  assert.strictEqual(X.codigoCelda(""), "");
  assert.strictEqual(X.codigoCelda(null), "");
});

test("codigoCelda: una ausencia (-XXX) en otra línea no se pierde", () => {
  assert.strictEqual(X.codigoCelda("D1\n(-HS)"), "D1(-HS)");
  assert.strictEqual(X.codigoCelda("MM\n08:00-15:00\n(-PAP)"), "MM(-PAP)");
});

test("agregarPersona: fila repetida se ignora; homónimos distintos se conservan", () => {
  const m = new Map();
  assert.strictEqual(X.agregarPersona(m, "GARCIA LOPEZ, ANA", ["D1", "N2"]), "GARCIA LOPEZ, ANA");
  assert.strictEqual(X.agregarPersona(m, "GARCIA LOPEZ, ANA", ["D1", "N2"]), null); // misma fila otra vez
  assert.strictEqual(X.agregarPersona(m, "GARCIA LOPEZ, ANA", ["V", "V"]), "GARCIA LOPEZ, ANA (2)"); // otra persona
  assert.strictEqual(m.size, 2);
  assert.deepStrictEqual(m.get("GARCIA LOPEZ, ANA (2)").turnos, ["V", "V"]);
});

test("resolverAnio: año escrito en la cabecera del mes", () => {
  assert.strictEqual(X.resolverAnio("Enero 2027", "2026-12-29", 1, new Date(2026, 11, 20)), 2027);
});

test("resolverAnio: data-date solo cuenta si es del mismo mes", () => {
  assert.strictEqual(X.resolverAnio("Noviembre", "2026-11-01", 11, new Date(2027, 0, 5)), 2026);
  // enero visto en diciembre con un data-date de diciembre (solape): año siguiente, no el actual
  assert.strictEqual(X.resolverAnio("Enero", "2026-12-29", 1, new Date(2026, 11, 20)), 2027);
});

test("resolverAnio: sin datos, el año más cercano a hoy para ese mes", () => {
  assert.strictEqual(X.resolverAnio("Diciembre", "", 12, new Date(2027, 0, 10)), 2026); // diciembre visto en enero
  assert.strictEqual(X.resolverAnio("Enero", "", 1, new Date(2026, 11, 10)), 2027); // enero visto en diciembre
  assert.strictEqual(X.resolverAnio("Marzo", "", 3, new Date(2026, 1, 10)), 2026);
});

test("limpiarNombre y esNombreValido (sin regresiones)", () => {
  assert.strictEqual(X.limpiarNombre("123\nDU GARCIA LOPEZ, ANA"), "GARCIA LOPEZ, ANA");
  assert.strictEqual(X.limpiarNombre("RUIZ SOTO, LUIS"), "RUIZ SOTO, LUIS");
  assert.ok(X.esNombreValido("RUIZ SOTO, LUIS"));
  assert.ok(!X.esNombreValido("TOTAL HORAS"));
  assert.ok(!X.esNombreValido("07:50"));
});

console.log(`\n${pasados} pasados, ${fallos.length} fallos`);
process.exit(fallos.length ? 1 : 0);

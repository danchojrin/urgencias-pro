// Ejecutar: node test/app.test.js   (sin dependencias)
// Prueba de humo de app.js con DOM y chrome.* simulados: arranque, importar, mes dudoso, import parcial,
// Generar, "por qué", cambios desde otra pestaña y errores. Datos sintéticos.
const vm = require("vm");
const fs = require("fs");
const RAIZ = require("path").join(__dirname, "..") + "/";
const Core = require(RAIZ + "core.js");

const escH = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
class El {
  constructor(tag) { this.tag = tag; this.style = {}; this.dataset = {}; this.innerHTML = ""; this._t = ""; this.value = ""; this.className = ""; this.title = ""; this.firstChild = { textContent: "" }; this.children = []; }
  set textContent(v) { this._t = String(v); }
  get textContent() { return this._t; }
  get outerHTML() {
    const a = (this.style.color ? ` style="color:${this.style.color}"` : "") + (this.title ? ` title="${escH(this.title)}"` : "");
    return `<${this.tag}${a}>${escH(this._t)}</${this.tag}>`;
  }
  get classList() { return { toggle() {}, add() {}, remove() {} }; }
  querySelectorAll() { return []; }
  querySelector() { return new El("button"); }
  appendChild(c) { this.children.push(c); }
}
const els = {};
const $ = (id) => (els[id] = els[id] || new El("div"));
const document = { getElementById: $, querySelectorAll: () => [], createElement: (t) => new El(t) };

const N = 30;
const fila = (nombre, code) => ({ nombre, turnos: Array(N).fill(code) });
const almacen = {
  ultimoImport: { mes: { year: 2026, month: 11, label: "NOVIEMBRE 2026" }, personal: [fila("VIEJO, IMPORT", "D1(-BM)")] },
  masterStaff: { "GARCIA LOPEZ, MARIA JOSE": { nombre: "GARCIA LOPEZ, MARIA JOSE", esp_ped: true, rotar: "si" } },
};
const guardados = [];
const oyentes = [];
let respuestaExtractor = null;
const llamadas = [];
const chrome = {
  storage: {
    local: {
      get: async (keys) => JSON.parse(JSON.stringify(Object.fromEntries(keys.filter((k) => k in almacen).map((k) => [k, almacen[k]])))),
      set: async (o) => {
        const copia = JSON.parse(JSON.stringify(o));
        guardados.push(copia);
        const cambios = Object.fromEntries(Object.entries(copia).map(([k, v]) => [k, { newValue: v, oldValue: almacen[k] }]));
        Object.assign(almacen, copia);
        setTimeout(() => oyentes.forEach((f) => f(cambios, "local")), 0);
      },
    },
    onChanged: { addListener: (f) => oyentes.push(f) },
  },
  tabs: {
    query: async () => [{ id: 7, windowId: 1, url: "https://x.aturnos.com/table_fusion" }],
    getCurrent: async () => ({ id: 3, windowId: 2 }),
    update: async (id, o) => llamadas.push(`tab ${id} ${JSON.stringify(o)}`),
    create() {},
  },
  windows: { update: async (id, o) => llamadas.push(`win ${id} ${JSON.stringify(o)}`) },
  scripting: {
    executeScript: async ({ files }) => {
      llamadas.push(files ? `inyecta ${files}` : "extrae");
      return files ? [{}] : [{ result: JSON.parse(JSON.stringify(respuestaExtractor)) }];
    },
  },
  runtime: { getURL: (x) => x, lastError: null },
};
const ctx = vm.createContext({ document, chrome, UrgenciasCore: Core, console, setTimeout, clearTimeout, URL, Blob: class {}, JSON });
vm.runInContext(
  fs.readFileSync(RAIZ + "app.js", "utf8") +
    "\n;globalThis.__app = { importar, generar, htmlTabla, get currentData(){return currentData}, get mesActual(){return mesActual}, get historialMeses(){return historialMeses}, get masterStaff(){return masterStaff} };",
  ctx
);
const esperar = (ms = 20) => new Promise((r) => setTimeout(r, ms));
let pasados = 0;
let fallos = 0;
const ok = (cond, msg) => {
  if (cond) pasados++;
  else fallos++;
  console.log((cond ? "  ok   " : "  FALLO ") + msg);
};

(async () => {
  await esperar();
  const app = ctx.__app;
  ok(guardados.some((g) => g.ultimoImport && !JSON.stringify(g).includes("(-")), "arranque: import antiguo migrado sin causa de ausencia");

  // 1) Import con mes no detectado
  const personal = [
    fila("GARCIA LOPEZ, MARIA JOSE", "D1"), fila("GARCIA PEREZ, MARIA LUISA", "D1"), fila("DE LA FUENTE SOTO, ANA", "D1(-BM)"),
    ...Array.from({ length: 9 }, (_, i) => fila(`RUIZ ${i}, LUIS`, i < 6 ? "D1" : "N2")), fila('COMILLAS "X", PEPA', "N2(-Lac)"),
  ];
  respuestaExtractor = { exito: true, personal, grupos: { "URG Urg 13": 13 }, homonimos: [], esperados: 13, cargados: 13, mes_num: null, anio: 2026, dias: N };
  await app.importar();
  ok(llamadas.join("|").includes("tab 7") && llamadas[llamadas.length - 1].startsWith("tab 3"), "muestra aTurnos durante la extracción y vuelve a la app");
  ok(llamadas.includes("inyecta extractor.js") && llamadas.includes("extrae"), "inyección bajo demanda (archivo + extraer)");
  ok(!JSON.stringify(app.currentData).includes("(-"), "import: sin causas de ausencia en memoria");
  ok(app.mesActual.dudoso === true && /mes/.test(els.status.textContent), "mes no detectado -> aviso");
  app.generar();
  ok(!("2026-11" in app.historialMeses) && /selector/.test(els.status.textContent), "Generar bloqueado mientras el mes es dudoso");
  els.mesInput.value = "2026-11";
  await els.mesInput.onchange({ target: els.mesInput });
  ok(app.mesActual.dudoso === false && app.mesActual.month === 11, "selector de mes confirma el mes");
  app.generar();
  await esperar();
  ok("2026-11" in app.historialMeses, "con el mes confirmado se genera y se guarda en el histórico");
  const html = els.tablaDiv.innerHTML;
  ok(html.includes("GARCIA, MARIA JOSE") && html.includes("GARCIA, MARIA LUISA") && !html.includes(">GARCIA, MARIA<"), "nombres desambiguados en la tabla");
  ok(/title="[^"]*— (equidad|aptitud|única|pediatría|desempate|regla|refuerzo)/.test(html), "cada nombre lleva el «por qué» al pasar el ratón");
  ok(html.split("<tr>").length - 2 === N, "una fila por día");

  // 2) Import parcial: se genera pero no se guarda
  respuestaExtractor = { ...respuestaExtractor, mes_num: 12, anio: 2026, esperados: 20, personal: personal.map((p) => ({ ...p, turnos: Array(31).fill(p.turnos[0]) })) };
  await app.importar();
  ok(app.mesActual.parcial === true && /Solo se leyeron/.test(els.status.textContent), "import parcial avisado");
  app.generar();
  ok(!("2026-12" in app.historialMeses) && /NO guardado/.test(els.status.textContent), "import parcial: NO se guarda en el histórico");

  // 3) Cambio desde otra pestaña
  const otro = { ...app.masterStaff, "NUEVA, PERSONA": { nombre: "NUEVA, PERSONA", rotar: "si" } };
  oyentes.forEach((f) => f({ masterStaff: { newValue: otro } }, "local"));
  ok("NUEVA, PERSONA" in app.masterStaff && /otra pestaña/.test(els.status.textContent), "cambios de otra pestaña se cargan");
  const antes = els.status.textContent;
  await chrome.storage.local.set({});
  await esperar();
  ok(els.status.textContent === antes, "los ecos de esta pestaña no repintan");

  // 4) Error del extractor
  respuestaExtractor = { error: "fallo simulado" };
  await app.importar();
  ok(/fallo simulado/.test(els.status.textContent), "error del extractor llega al usuario");

  console.log(`\n${pasados} pasados, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})();

// Ejecutar: node test/core.test.js   (sin dependencias)
const assert = require("assert");
const C = require("../core.js");

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

// ---------- Datos sintéticos deterministas (proporciones parecidas a un cuadrante real) ----------
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cuadranteSintetico({ n = 43, dias = 30, seed = 1 } = {}) {
  const r = rng(seed);
  const personal = Array.from({ length: n }, (_, i) => ({
    nombre: "Enfermero " + String(i + 1).padStart(2, "0"),
    turnos: Array(dias).fill(""),
  }));
  // Un par de personas de vacaciones todo el mes y otras con baja larga
  personal[8].turnos.fill("V");
  personal[30].turnos.fill("D1(-BM)");
  for (let d = 0; d < dias; d++) {
    const libres = personal.filter((p) => p.turnos[d] === "");
    // barajar determinista
    libres.sort(() => r() - 0.5);
    let k = 0;
    const nDia = 8 + Math.floor(r() * 4); // 8-11
    const nNoche = 5 + Math.floor(r() * 3); // 5-7
    for (let i = 0; i < nDia && k < libres.length; i++, k++) {
      const x = r();
      libres[k].turnos[d] = x < 0.6 ? "D1" : x < 0.8 ? "D" : x < 0.93 ? "MM" : x < 0.97 ? "m9" : "t5";
    }
    for (let i = 0; i < nNoche && k < libres.length; i++, k++) libres[k].turnos[d] = "N2";
    // algunas ausencias con paréntesis y desconocidos
    if (k < libres.length && r() < 0.5) libres[k++].turnos[d] = "D1(-BC)";
    if (k < libres.length && r() < 0.3) libres[k++].turnos[d] = "N2(-Lac)";
    if (d === 3 && k < libres.length) libres[k++].turnos[d] = "[+]";
  }
  return personal;
}

const perfilesVacios = (personal) =>
  Object.fromEntries(personal.map((p) => [p.nombre, { nombre: p.nombre, rotar: "si" }]));

const asArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const ids = (a) => [
  ...asArr(a.tri1), ...asArr(a.tri2), ...asArr(a.v1), ...asArr(a.v2), ...asArr(a.obs),
].map((x) => x.id);

// ---------- Clasificación ----------
test("clasificarTurno: códigos reales del cuadrante", () => {
  const casos = {
    "": "libre", N2: "noche", D1: "dia/MT", D: "dia/MT", V: "ausente", MM: "dia/M", m9: "dia/M",
    t5: "dia/T", "[+]": "desconocido", "D1(-HS)": "ausente", "N2(-Lac)": "ausente",
    "D(-BM)": "ausente", "D1(-PIHO)": "ausente", "D1(-CAES)": "ausente", "MM(-PAP)": "ausente",
  };
  for (const [k, esp] of Object.entries(casos)) {
    const r = C.clasificarTurno(k);
    assert.strictEqual(r.franja ? `${r.tipo}/${r.franja}` : r.tipo, esp.replace("desconocido", "desconocido"), k);
  }
});

test("verano = julio y agosto; observación de noche mínima 1", () => {
  assert.ok(C.esVerano(7) && C.esVerano(8) && !C.esVerano(6) && !C.esVerano(9));
  assert.strictEqual(C.minimosNoche(7).obs, 1);
  assert.strictEqual(C.minimosNoche(11).obs, 2);
});

// ---------- Invariantes del cuadrante ----------
const personal = cuadranteSintetico();
const perfiles = perfilesVacios(personal);
const res = C.generarMes({ personal, perfiles, year: 2026, month: 11 });

test("nadie ausente/libre/desconocido es asignado", () => {
  for (const modo of ["diurno", "noche"]) {
    for (const dia of res[modo]) {
      const todos = [...ids(dia.M), ...(dia.T ? ids(dia.T) : [])];
      for (const id of todos) {
        const p = personal.find((x) => x.nombre === id);
        const c = C.clasificarTurno(p.turnos[dia.dia - 1]);
        assert.strictEqual(c.tipo, modo === "noche" ? "noche" : "dia", `${id} día ${dia.dia} (${p.turnos[dia.dia - 1]})`);
      }
    }
  }
});

test("solo-tarde (t5) nunca en mañana; solo-mañana (MM, m9) nunca en tarde", () => {
  for (const dia of res.diurno) {
    for (const id of ids(dia.M)) {
      const code = personal.find((x) => x.nombre === id).turnos[dia.dia - 1].toUpperCase();
      assert.ok(!/^T/.test(code), `T en mañana: ${id} día ${dia.dia}`);
    }
    for (const id of ids(dia.T)) {
      const code = personal.find((x) => x.nombre === id).turnos[dia.dia - 1].toUpperCase();
      assert.ok(!/^M/.test(code), `M en tarde: ${id} día ${dia.dia}`);
    }
  }
});

test("nadie en dos puestos a la vez en el mismo bloque", () => {
  for (const modo of ["diurno", "noche"]) {
    for (const dia of res[modo]) {
      for (const bloque of [dia.M, dia.T].filter(Boolean)) {
        const lista = ids(bloque);
        assert.strictEqual(new Set(lista).size, lista.length, `duplicado día ${dia.dia} ${modo}`);
      }
    }
  }
});

test("mínimos cubiertos cuando hay gente suficiente (diurno mañana)", () => {
  let comprobados = 0;
  for (const dia of res.diurno) {
    const disponiblesM = ids(dia.M).length;
    if (disponiblesM >= 6) {
      comprobados++;
      assert.ok(dia.M.tri1 && dia.M.tri2, `triage día ${dia.dia}`);
      assert.ok(dia.M.v1.length >= 1 && dia.M.v2.length >= 1, `valoración día ${dia.dia}`);
      assert.ok(dia.M.obs.length >= 2, `observación día ${dia.dia}`);
      assert.strictEqual(dia.corto.M.tri1 || dia.corto.M.tri2 || dia.corto.M.v1 || dia.corto.M.v2 || dia.corto.M.obs, false);
    }
  }
  assert.ok(comprobados > 10, "pocos días comprobados: " + comprobados);
});

test("mínimos de noche: 1 triage, 2 valoración, 2 observación (no verano)", () => {
  let comprobados = 0;
  for (const dia of res.noche) {
    if (ids(dia.M).length >= 5) {
      comprobados++;
      assert.ok(dia.M.tri1, `triage noche ${dia.dia}`);
      assert.ok(dia.M.v1.length >= 1 && dia.M.v2.length >= 1);
      assert.ok(dia.M.obs.length >= 2);
      assert.strictEqual(dia.corto.alguno, false);
    }
  }
  assert.ok(comprobados > 10);
});

test("verano: noche con 4 personas cubre mínimos (1 tri, 2 val, 1 obs) sin aviso", () => {
  const p = ["A", "B", "C", "D"].map((n) => ({ nombre: n + " Apellido", turnos: ["N2"] }));
  const r = C.generarMes({ personal: p, perfiles: {}, year: 2026, month: 7 });
  const dia = r.noche[0];
  assert.ok(dia.M.tri1 && dia.M.v1.length >= 1 && dia.M.v2.length >= 1 && dia.M.obs.length >= 1);
  assert.strictEqual(dia.corto.alguno, false);
  // el mismo cuadrante fuera de verano SÍ avisa de falta (obs mínimo 2)
  const r2 = C.generarMes({ personal: p, perfiles: {}, year: 2026, month: 11 });
  assert.strictEqual(r2.noche[0].corto.alguno, true);
});

test("falta de personal marca aviso (amarillo)", () => {
  const p = ["A", "B", "C"].map((n) => ({ nombre: n + " Apellido", turnos: ["D1"] }));
  const r = C.generarMes({ personal: p, perfiles: {}, year: 2026, month: 11 });
  assert.strictEqual(r.diurno[0].corto.alguno, true);
});

test("códigos desconocidos se devuelven y se ignoran", () => {
  assert.deepStrictEqual(res.desconocidos, ["[+]"]);
});

test("usuarios XXX se ignoran", () => {
  const p = [{ nombre: "XXX Vacante", turnos: ["D1"] }, { nombre: "Ana Lopez", turnos: ["D1"] }];
  const r = C.generarMes({ personal: p, perfiles: {}, year: 2026, month: 11 });
  assert.deepStrictEqual(ids(r.diurno[0].M), ["Ana Lopez"]);
});

// ---------- Tareas configurables ----------
const diasConTarea = (r, modo, texto) => r[modo].filter((d) => d.tareas.some((x) => x.includes(texto))).map((d) => d.dow);

// Pedido del equipo: sin tareas de farmacia; carro de paradas lunes por la mañana y viernes por la tarde.
test("tareas por defecto: sin farmacia; carro lunes mañana y viernes tarde; noche miércoles", () => {
  assert.ok(!C.TAREAS_DEFECTO.some((t) => /farmacia|farm\./i.test(t.nombre)), "queda alguna tarea de farmacia");
  assert.deepStrictEqual([...new Set(diasConTarea(res, "diurno", "Carro Paradas (mañana)"))], [1]);
  assert.deepStrictEqual([...new Set(diasConTarea(res, "diurno", "Carro Paradas (tarde)"))], [5]);
  assert.deepStrictEqual([...new Set(diasConTarea(res, "noche", "Ok Desf/Carro"))], [3]);
});

// Cada persona del carro tiene que trabajar en esa franja: el de la mañana sale de quien está por la
// mañana (no de quien solo hace tarde), y el de la tarde, de quien está por la tarde.
test("carro por franja: la mañana solo elige a quien trabaja por la mañana; la tarde, a quien trabaja por la tarde", () => {
  const cortos = C.nombresCortos(personal.map((p) => p.nombre));
  const nombresDe = (texto) => texto.split("<small")[1].split(">")[1].split("<")[0].split(" / ");
  const dedicadas = (bloques) => new Set(bloques.map((b) => cortos.get(b.nombre) || C.nombreCorto(b.nombre)));
  let cM = 0, cT = 0;
  for (const dia of res.diurno) {
    const txtM = dia.tareas.find((x) => x.includes("Carro Paradas (mañana)"));
    const txtT = dia.tareas.find((x) => x.includes("Carro Paradas (tarde)"));
    if (txtM) {
      cM++;
      const manana = new Set(dia.M ? [dia.M.tri1, dia.M.tri2, ...asArr(dia.M.v1), ...asArr(dia.M.v2), ...asArr(dia.M.obs)].filter(Boolean).map((x) => cortos.get(x.nombre) || C.nombreCorto(x.nombre)) : []);
      for (const n of nombresDe(txtM)) assert.ok(manana.has(n), `carro de mañana: ${n} no trabaja por la mañana (día ${dia.dia})`);
    }
    if (txtT) {
      cT++;
      const tarde = new Set(dia.T ? [dia.T.tri1, dia.T.tri2, ...asArr(dia.T.v1), ...asArr(dia.T.v2), ...asArr(dia.T.obs)].filter(Boolean).map((x) => cortos.get(x.nombre) || C.nombreCorto(x.nombre)) : []);
      for (const n of nombresDe(txtT)) assert.ok(tarde.has(n), `carro de tarde: ${n} no trabaja por la tarde (día ${dia.dia})`);
    }
  }
  assert.ok(cM > 0 && cT > 0, `pocos días: lunes ${cM}, viernes ${cT}`);
});

test("tareas configurables: carro movido a martes con 3 personas", () => {
  const tareas = C.TAREAS_DEFECTO.map((t) => (t.id === "carro_paradas" ? { ...t, dias: [2], personas: 3 } : t));
  const r = C.generarMes({ personal, perfiles, year: 2026, month: 11, tareas });
  assert.deepStrictEqual([...new Set(diasConTarea(r, "diurno", "Carro Paradas (mañana)"))], [2]);
  const dia = r.diurno.find((d) => d.tareas.some((x) => x.includes("Carro Paradas (mañana)")));
  assert.strictEqual(dia.tareas.find((x) => x.includes("Carro Paradas (mañana)")).split("<small")[1].split(">")[1].split("<")[0].split(" / ").length, 3);
});

// Configuración guardada antes de esta versión: sin farmacia, carro con su franja nueva y lo que la
// persona hubiera cambiado (días de otras tareas, caducidad desactivada) se conserva.
test("migrarTareas: quita farmacia, pasa el carro a lunes mañana / viernes tarde y conserva cambios", () => {
  const vieja = [
    { id: "farm_colocar", icono: "💊", nombre: "Colocar Farmacia", turno: "D", dias: [1] },
    { id: "carro_paradas", icono: "🚑", nombre: "Carro Paradas", turno: "D", dias: [5], personas: 2 },
    { id: "desf_carro_n", icono: "🩺", nombre: "Ok Desf/Carro", turno: "N", dias: [2] },
    { id: "caducidad", icono: "📆", nombre: "Caducidad", turno: "N", tipo: "caducidad", activa: false },
  ];
  const m = C.migrarTareas(vieja);
  assert.deepStrictEqual(m.map((t) => t.id), C.TAREAS_DEFECTO.map((t) => t.id));
  assert.deepStrictEqual(m.find((t) => t.id === "carro_paradas").dias, [1]);
  assert.strictEqual(m.find((t) => t.id === "carro_paradas").franja, "M");
  assert.deepStrictEqual(m.find((t) => t.id === "desf_carro_n").dias, [2]);
  assert.strictEqual(m.find((t) => t.id === "caducidad").activa, false);
});

test("migrarTareas: una configuración ya nueva conserva los cambios de la persona (carro de tarde a martes)", () => {
  const nueva = C.TAREAS_DEFECTO.map((t) => (t.id === "carro_paradas_t" ? { ...t, dias: [2], personas: 3 } : t));
  const m = C.migrarTareas(nueva);
  const ct = m.find((t) => t.id === "carro_paradas_t");
  assert.deepStrictEqual(ct.dias, [2]);
  assert.strictEqual(ct.personas, 3);
  assert.strictEqual(ct.franja, "T");
});

test("migrarTareas: sin datos guardados devuelve los valores por defecto", () => {
  assert.deepStrictEqual(C.migrarTareas(undefined), C.TAREAS_DEFECTO);
  assert.deepStrictEqual(C.migrarTareas(null), C.TAREAS_DEFECTO);
});

test("tareas: un mismo día puede tener varias (lunes: carro de mañana + carro de tarde)", () => {
  const tareas = C.TAREAS_DEFECTO.map((t) => (t.id === "carro_paradas_t" ? { ...t, dias: [1] } : t));
  const r = C.generarMes({ personal, perfiles, year: 2026, month: 11, tareas });
  const lunes = r.diurno.find((d) => d.dow === 1);
  assert.ok(lunes.tareas.length >= 2, "el lunes no tiene dos tareas");
});

// ---------- Prioridad de especialidad ----------
test("skill: tri1 sale de quien tiene exp_urg+form_trj cuando alguno trabaja", () => {
  const pf = perfilesVacios(personal);
  const expertos = personal.slice(0, 6).map((p) => p.nombre);
  expertos.forEach((n) => Object.assign(pf[n], { exp_urg: true, form_trj: true }));
  const r = C.generarMes({ personal, perfiles: pf, year: 2026, month: 11 });
  let c = 0;
  for (const dia of r.diurno) {
    const hayExperto = ids({ ...dia.M, tri1: null, tri2: null }).concat(ids({ tri1: dia.M.tri1 })).some((id) => expertos.includes(id));
    if (hayExperto) { c++; assert.ok(expertos.includes(dia.M.tri1.id), `tri1 sin skill día ${dia.dia}`); }
  }
  assert.ok(c > 5);
});

// Actualizado (decisión del equipo): V2 es más importante que T2. Antes este test exigía T2 con
// pediatría siempre que trabajase alguien de pediatría; ahora la primera va a V2 y T2 solo si hay dos.
test("pediatría: V2 siempre con pediatría si alguien de pediatría trabaja; T2 también si hay dos o más", () => {
  const pf = perfilesVacios(personal);
  const ped = personal.slice(10, 20).map((p) => p.nombre);
  ped.forEach((n) => Object.assign(pf[n], { esp_ped: true }));
  const r = C.generarMes({ personal, perfiles: pf, year: 2026, month: 11 });
  let cV2 = 0, cT2 = 0;
  for (const modo of ["diurno", "noche"]) {
    for (const dia of r[modo]) {
      for (const b of [dia.M, dia.T].filter(Boolean)) {
        if (ids(b).some((id) => ped.includes(id))) {
          cV2++;
          assert.ok(b.v2.some((x) => ped.includes(x.id)), `V2 sin pediatría (${modo} día ${dia.dia})`);
        }
      }
      if (modo === "diurno" && ids(dia.M).filter((id) => ped.includes(id)).length >= 2 && dia.M.tri2) {
        cT2++;
        assert.ok(ped.includes(dia.M.tri2.id), `T2 sin pediatría habiendo dos (día ${dia.dia})`);
      }
    }
  }
  assert.ok(cV2 > 20 && cT2 > 5, `pocos casos: V2 ${cV2}, T2 ${cT2}`);
});

// Actualizado (decisión del equipo): V2 puede quedar sin especialista por la tarde si tiene a alguien
// con experiencia en pediatría. Lo que no puede pasar es V2 sin pediatría habiéndola en el bloque.
// Se sigue midiendo que la especialista vaya a V2 con frecuencia (preferencia).
test("pediatría: V2 con pediatría (especialista o experiencia) siempre que haya en el bloque; especialista preferida", () => {
  const pf = perfilesVacios(personal);
  const esp = personal.slice(10, 14).map((p) => p.nombre);
  const exp = personal.slice(14, 20).map((p) => p.nombre);
  esp.forEach((n) => Object.assign(pf[n], { esp_ped: true }));
  exp.forEach((n) => Object.assign(pf[n], { exp_ped: true }));
  const ped = [...esp, ...exp];
  const r = C.generarMes({ personal, perfiles: pf, year: 2026, month: 11 });
  let c = 0, conEsp = 0;
  for (const modo of ["diurno", "noche"]) {
    for (const dia of r[modo]) {
      for (const b of [dia.M, dia.T].filter(Boolean)) {
        if (ids(b).some((id) => ped.includes(id))) {
          c++;
          assert.ok(b.v2.some((x) => ped.includes(x.id)), `V2 sin pediatría habiéndola (${modo} día ${dia.dia})`);
          if (b.v2.some((x) => esp.includes(x.id))) conEsp++;
        }
      }
    }
  }
  assert.ok(c > 10);
  // Referencia medida (synthetic seed 1): 65 % en la versión anterior, 64 % ahora. Umbral 60 % para no fallar por ruido.
  assert.ok(conEsp / c >= 0.6, `V2 con especialista solo en ${Math.round((100 * conEsp) / c)} % de los bloques`);
});

// ---------- Imparcialidad ----------
const sumaDelta = (...ds) => {
  const t = {};
  for (const d of ds) for (const [id, v] of Object.entries(d)) { t[id] = t[id] || {}; for (const [k, n] of Object.entries(v)) t[id][k] = (t[id][k] || 0) + n; }
  return t;
};
const rango = (arr) => Math.max(...arr) - Math.min(...arr);
const tasasTri = (delta, minDias) => Object.values(delta).filter((v) => v._d >= minDias).map((v) => ((v.tri1 || 0) + (v.tri2 || 0)) / v._d);
const repartoVal = (delta, minDias) => Object.values(delta).filter((v) => v._d >= minDias).map((v) => ((v.v1 || 0) + (v.v2 || 0)) / Math.max(1, (v.v1 || 0) + (v.v2 || 0) + (v.obs || 0)));

test("equidad: perfiles iguales -> triage por día trabajado parejo", () => {
  const grande = cuadranteSintetico({ n: 43, dias: 30, seed: 7 });
  const r = C.generarMes({ personal: grande, perfiles: perfilesVacios(grande), year: 2026, month: 11 });
  const t = tasasTri(r.delta, 8);
  console.log("        triage/día: min", Math.min(...t).toFixed(2), "max", Math.max(...t).toFixed(2), "n =", t.length);
  assert.ok(rango(t) <= 0.2, "rango " + rango(t));
});

test("equidad: reparto valoración/observación parejo (nadie siempre en lo mismo)", () => {
  const grande = cuadranteSintetico({ n: 43, dias: 30, seed: 7 });
  const r = C.generarMes({ personal: grande, perfiles: perfilesVacios(grande), year: 2026, month: 11 });
  const v = repartoVal(r.delta, 8);
  console.log("        val/(val+obs): min", Math.min(...v).toFixed(2), "max", Math.max(...v).toFixed(2));
  assert.ok(rango(v) <= 0.3, "rango " + rango(v));
});

test("equidad: sin sesgo por orden del roster (primeros vs últimos de la lista)", () => {
  const grande = cuadranteSintetico({ n: 43, dias: 30, seed: 11 });
  const r = C.generarMes({ personal: grande, perfiles: perfilesVacios(grande), year: 2026, month: 11 });
  const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const ent = Object.entries(r.delta).filter(([, v]) => v._d >= 8);
  const orden = (id) => grande.findIndex((p) => p.nombre === id);
  const mitad = ent.filter(([id]) => orden(id) < 21).map(([, v]) => ((v.v1 || 0) + (v.v2 || 0)) / ((v.v1 || 0) + (v.v2 || 0) + (v.obs || 0)));
  const resto = ent.filter(([id]) => orden(id) >= 21).map(([, v]) => ((v.v1 || 0) + (v.v2 || 0)) / ((v.v1 || 0) + (v.v2 || 0) + (v.obs || 0)));
  assert.ok(Math.abs(media(mitad) - media(resto)) < 0.08, `primera mitad ${media(mitad).toFixed(2)} vs resto ${media(resto).toFixed(2)}`);
});

// ---------- Histórico ----------
test("determinista: misma entrada, mismo resultado", () => {
  const a = C.generarMes({ personal, perfiles, year: 2026, month: 11 });
  const b = C.generarMes({ personal, perfiles, year: 2026, month: 11 });
  assert.deepStrictEqual(JSON.stringify(a), JSON.stringify(b));
});

test("histórico: usarlo reduce la desigualdad ACUMULADA de triage entre meses", () => {
  const pf = perfilesVacios(personal);
  const oct = C.generarMes({ personal: cuadranteSintetico({ n: 43, dias: 31, seed: 21 }), perfiles: pf, year: 2026, month: 10 });
  const nov = cuadranteSintetico({ n: 43, dias: 30, seed: 22 });
  const base = C.sumarHistorial({ "2026-10": oct.delta }, "2026-11");
  const conBase = C.generarMes({ personal: nov, perfiles: pf, year: 2026, month: 11, historialBase: base });
  const sinBase = C.generarMes({ personal: nov, perfiles: pf, year: 2026, month: 11 });
  const rCon = rango(tasasTri(sumaDelta(oct.delta, conBase.delta), 14));
  const rSin = rango(tasasTri(sumaDelta(oct.delta, sinBase.delta), 14));
  console.log("        rango acumulado triage: con histórico", rCon.toFixed(3), "sin histórico", rSin.toFixed(3));
  assert.ok(rCon <= rSin + 0.01, `con ${rCon} sin ${rSin}`);
});

test("histórico idempotente: regenerar el mismo mes no duplica (se excluye el propio mes)", () => {
  const pf = perfilesVacios(personal);
  const oct = C.generarMes({ personal, perfiles: pf, year: 2026, month: 10 });
  const nov1 = C.generarMes({ personal, perfiles: pf, year: 2026, month: 11, historialBase: C.sumarHistorial({ "2026-10": oct.delta }, "2026-11") });
  const porMes = { "2026-10": oct.delta, "2026-11": nov1.delta };
  const nov2 = C.generarMes({ personal, perfiles: pf, year: 2026, month: 11, historialBase: C.sumarHistorial(porMes, "2026-11") });
  assert.deepStrictEqual(nov1.delta, nov2.delta);
});

// ---------- Arreglos de la auditoría (no cambian a quién se asigna dónde) ----------
test("seguridad: los nombres dentro de las tareas se escapan (sin HTML inyectado)", () => {
  const dow = new Date(2026, 10, 1).getDay();
  const p = [{ nombre: '<img src="https://ejemplo.invalid/x">Mal', turnos: ["D1"] }];
  const tareas = [{ id: "x", icono: "🚑", nombre: "Carro <i>", turno: "D", dias: [dow], personas: 1 }];
  const t = C.generarMes({ personal: p, perfiles: {}, year: 2026, month: 11, tareas }).diurno[0].tareas[0];
  assert.ok(!t.includes("<img") && !t.includes("<i>"), t);
  assert.ok(t.includes("&lt;img") && t.includes("Carro &lt;i&gt;"), t);
});

test("día sin nadie trabajando aparece como fila en amarillo (no desaparece de la tabla)", () => {
  const p = [{ nombre: "Ana Uno", turnos: ["D1", "", "D1"] }];
  const r = C.generarMes({ personal: p, perfiles: {}, year: 2026, month: 2 });
  assert.strictEqual(r.diurno.length, 28);
  const d2 = r.diurno.find((d) => d.dia === 2);
  assert.ok(d2, "falta el día 2");
  assert.strictEqual(d2.n, 0);
  assert.strictEqual(d2.corto.alguno, true);
});

test("meses de 28, 29, 30 y 31 días generan una fila por día", () => {
  for (const [y, m, n] of [[2026, 2, 28], [2028, 2, 29], [2026, 11, 30], [2026, 12, 31]]) {
    const p = [{ nombre: "Ana Uno", turnos: Array(n).fill("D1") }];
    const r = C.generarMes({ personal: p, perfiles: {}, year: y, month: m });
    assert.strictEqual(r.diurno.length, n, `${y}-${m}`);
    assert.strictEqual(r.diurno[n - 1].dow, new Date(y, m - 1, n).getDay(), `día de la semana ${y}-${m}-${n}`);
  }
});

test("nombreCorto respeta apellidos compuestos (de, del, de la, san...)", () => {
  assert.strictEqual(C.nombreCorto("DE LA FUENTE GARCIA, ANA"), "DE LA FUENTE, ANA");
  assert.strictEqual(C.nombreCorto("DEL RIO PEREZ, JOSE LUIS"), "DEL RIO, JOSE");
  assert.strictEqual(C.nombreCorto("SAN JUAN MORA, PEDRO"), "SAN JUAN, PEDRO");
  assert.strictEqual(C.nombreCorto("GARCIA LOPEZ, MARIA"), "GARCIA, MARIA");
  assert.strictEqual(C.nombreCorto("Enfermero 01"), "Enfermero 01");
});

test("nombresCortos: dos personas nunca comparten el mismo nombre impreso", () => {
  const lista = ["GARCIA LOPEZ, MARIA JOSE", "GARCIA PEREZ, MARIA LUISA", "RUIZ SOTO, ANA", "MORA DIAZ, LUIS", "MORA GIL, LUIS"];
  const m = C.nombresCortos(lista);
  const vals = lista.map((n) => m.get(n));
  assert.strictEqual(new Set(vals).size, lista.length, vals.join(" | "));
  assert.strictEqual(m.get("RUIZ SOTO, ANA"), "RUIZ, ANA"); // sin coincidencia se mantiene corto
});

test("aviso de aptitud por puesto: V2 con una persona de pediatría no avisa por la otra", () => {
  const pf = { Ped: { esp_ped: true }, Exp: { exp_ped: true }, Nada: {}, T1: { exp_urg: true, form_trj: true }, Urg: { exp_urg: true } };
  const P = (id) => ({ id });
  assert.strictEqual(C.faltaAptitud("v2", [P("Nada"), P("Ped")], pf), false);
  assert.strictEqual(C.faltaAptitud("v2", [P("Nada")], pf), true);
  assert.strictEqual(C.faltaAptitud("tri2", P("Exp"), pf), false);
  assert.strictEqual(C.faltaAptitud("tri1", P("Urg"), pf), true);
  assert.strictEqual(C.faltaAptitud("tri1", P("T1"), pf), false);
  assert.strictEqual(C.faltaAptitud("obs", [P("Nada")], pf), false);
  assert.strictEqual(C.faltaAptitud("v2", [], pf), false); // puesto vacío: lo avisa la falta de personal
});

test("privacidad: la causa de la ausencia no se guarda y el cuadrante no cambia", () => {
  assert.strictEqual(C.minimizarCodigo("D1(-BM)"), "AUS");
  assert.strictEqual(C.minimizarCodigo("N2(-Lac)"), "AUS");
  assert.strictEqual(C.minimizarCodigo("PIH"), "AUS");
  assert.strictEqual(C.minimizarCodigo("D1"), "D1");
  assert.strictEqual(C.minimizarCodigo("[+]"), "[+]"); // desconocido: se conserva para avisar
  assert.strictEqual(C.minimizarCodigo(""), "");
  assert.strictEqual(C.clasificarTurno("AUS").tipo, "ausente");
  const min = personal.map((p) => ({ nombre: p.nombre, turnos: p.turnos.map(C.minimizarCodigo) }));
  assert.ok(!JSON.stringify(min).includes("(-"));
  const a = C.generarMes({ personal, perfiles, year: 2026, month: 11 });
  const b = C.generarMes({ personal: min, perfiles, year: 2026, month: 11 });
  assert.deepStrictEqual(JSON.stringify([b.diurno, b.noche, b.delta]), JSON.stringify([a.diurno, a.noche, a.delta]));
});

test("copia de seguridad: se valida y se sanea antes de importarla", () => {
  const buena = {
    version: 1,
    masterStaff: { "Ana Uno": { nombre: "Ana Uno", esp_ped: true, exp_ped: false, exp_urg: false, form_trj: false, fijo: "obs", rotar: "no" } },
    historialMeses: { "2026-10": { "Ana Uno": { _d: 12, tri1: 2, v2: 5, obs: 3 } } },
    tareasCfg: C.TAREAS_DEFECTO,
  };
  const r = C.validarCopia(JSON.parse(JSON.stringify(buena)));
  assert.ok(r.ok, r.error);
  assert.deepStrictEqual(r.datos.masterStaff, buena.masterStaff);
  assert.deepStrictEqual(r.datos.historialMeses, buena.historialMeses);
  assert.strictEqual(r.datos.tareasCfg.length, C.TAREAS_DEFECTO.length);
  // saneado: sin nombre -> se usa la clave; fijo desconocido -> vacío
  const r2 = C.validarCopia({ version: 1, masterStaff: { "Luis Dos": { fijo: "<b>x</b>" } }, historialMeses: {} });
  assert.ok(r2.ok, r2.error);
  assert.strictEqual(r2.datos.masterStaff["Luis Dos"].nombre, "Luis Dos");
  assert.strictEqual(r2.datos.masterStaff["Luis Dos"].fijo, "");
  // rechazos
  assert.strictEqual(C.validarCopia(null).ok, false);
  assert.strictEqual(C.validarCopia({ version: 2, masterStaff: {}, historialMeses: {} }).ok, false);
  assert.strictEqual(C.validarCopia({ version: 1, masterStaff: [], historialMeses: {} }).ok, false);
  assert.strictEqual(C.validarCopia({ version: 1, masterStaff: {}, historialMeses: { "2026-1": {} } }).ok, false);
  assert.strictEqual(C.validarCopia({ version: 1, masterStaff: {}, historialMeses: { "2026-10": { A: { tri1: -3 } } } }).ok, false);
  assert.strictEqual(C.validarCopia({ version: 1, masterStaff: {}, historialMeses: { "2026-10": { A: { tri1: "x" } } } }).ok, false);
});

// ---------- Algoritmo v15 (decisiones del equipo tras la auditoría) ----------
const bloquesDe = (r) => ["diurno", "noche"].flatMap((modo) => r[modo].flatMap((d) => [["M", d.M], ["T", d.T]].filter(([, b]) => b).map(([f, b]) => ({
  modo, franja: f, dia: d.dia, b, triM: [d.M.tri1, d.M.tri2].filter(Boolean).map((x) => x.id),
}))));
const enPuesto = (b) => ["tri1", "tri2", "v1", "v2", "obs"].flatMap((k) => asArr(b[k]).map((x) => ({ ...x, post: k })));
function perfilesMixtos(lista) {
  const pf = perfilesVacios(lista);
  lista.forEach((p, i) => {
    if (i < 10) Object.assign(pf[p.nombre], { exp_urg: true, form_trj: true });
    if (i >= 15 && i < 18) Object.assign(pf[p.nombre], { esp_ped: true, exp_ped: true });
    else if (i >= 18 && i < 21) Object.assign(pf[p.nombre], { esp_ped: true });
    else if (i >= 21 && i < 23) Object.assign(pf[p.nombre], { exp_ped: true });
  });
  return pf;
}
const esPedP = (c) => !!(c && (c.esp_ped || c.exp_ped));

test("pediatría reservada: nunca en V1/OBS mientras alguien sin pediatría ocupa V2 o T2 del bloque", () => {
  let evitables = 0, enAdultos = 0, total = 0;
  for (let seed = 40; seed < 46; seed++) {
    const p = cuadranteSintetico({ seed });
    const pf = perfilesMixtos(p);
    const r = C.generarMes({ personal: p, perfiles: pf, year: 2026, month: 11 });
    for (const { franja, b, triM } of bloquesDe(r)) {
      const todos = enPuesto(b);
      for (const x of todos.filter((y) => esPedP(pf[y.id]))) {
        total++;
        if (x.post !== "v1" && x.post !== "obs") continue;
        enAdultos++;
        // Rotación (decisión del equipo): quien hizo triage por la mañana no repite T2 por la tarde,
        // así que un T2 de tarde sin pediatría no es "evitable" para esa persona.
        const podiaT2 = !(franja === "T" && triM.includes(x.id));
        if (todos.some((y) => !esPedP(pf[y.id]) && (y.post === "v2" || (y.post === "tri2" && podiaT2)))) evitables++;
      }
    }
  }
  console.log(`        pediatría en V1/OBS: ${enAdultos} de ${total} (evitables ${evitables})`);
  assert.strictEqual(evitables, 0);
});

test("escalones: especialista con y sin casilla de experiencia se reparten V2 (antes 30/0)", () => {
  const dias = 30;
  const p = [
    { nombre: "Ped Ambas", turnos: Array(dias).fill("N2") },
    { nombre: "Ped Esp", turnos: Array(dias).fill("N2") },
    ...Array.from({ length: 4 }, (_, i) => ({ nombre: "Otro " + i, turnos: Array(dias).fill("N2") })),
  ];
  const r = C.generarMes({ personal: p, perfiles: { "Ped Ambas": { esp_ped: true, exp_ped: true }, "Ped Esp": { esp_ped: true } }, year: 2026, month: 11 });
  const c = (id) => r.noche.filter((d) => d.M.v2.some((x) => x.id === id)).length;
  assert.ok(Math.abs(c("Ped Ambas") - c("Ped Esp")) <= 4, `${c("Ped Ambas")} / ${c("Ped Esp")}`);
});

test("puesto fijo: se respeta aunque la persona tenga formación de triage", () => {
  const p = cuadranteSintetico({ seed: 50 });
  const pf = perfilesMixtos(p);
  Object.assign(pf["Enfermero 01"], { fijo: "obs" }); // tiene urgencias + triage
  Object.assign(pf["Enfermero 16"], { fijo: "tri2" }); // pediatría
  const r = C.generarMes({ personal: p, perfiles: pf, year: 2026, month: 11 });
  let vistos = 0;
  for (const { modo, franja, b } of bloquesDe(r)) {
    if (franja === "T") continue; // por la tarde manda "rotar"
    for (const x of enPuesto(b)) {
      const f = pf[x.id].fijo;
      if (!f || (modo === "noche" && f === "tri2")) continue;
      vistos++;
      assert.strictEqual(x.post, f, `${x.id} (${modo}) en ${x.post}`);
    }
  }
  assert.ok(vistos > 10);
});

test("regla D/D1: ningún puesto de mañana con varias personas todo 'D' si se podía cambiar por un D1", () => {
  let malos = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const p = cuadranteSintetico({ seed });
    const r = C.generarMes({ personal: p, perfiles: {}, year: 2026, month: 11 });
    for (const d of r.diurno) {
      for (const k of ["v1", "v2", "obs"]) {
        const arr = d.M[k];
        if (arr.length < 2 || !arr.every((x) => x.turnoCode === "D")) continue;
        // ¿había un D1 en otro puesto que pudiera venir sin dejar ese puesto todo D?
        const hay = ["v1", "v2", "obs"].some((q) => q !== k && d.M[q].some((x, i) => x.turnoCode !== "D" && (d.M[q].length < 2 || d.M[q].some((y, j) => j !== i && y.turnoCode !== "D"))));
        if (hay) malos++;
      }
    }
  }
  assert.strictEqual(malos, 0);
});

test("con poco personal se cubre en orden T1 > V > OBS > V > OBS > T2 (6, 5, 4 y 3 personas)", () => {
  const cuenta = (b) => ({ tri1: asArr(b.tri1).length, tri2: asArr(b.tri2).length, v: b.v1.length + b.v2.length, obs: b.obs.length });
  const gen = (n, code, month = 11) => {
    const p = Array.from({ length: n }, (_, i) => ({ nombre: "P" + i + " X", turnos: [code] }));
    return C.generarMes({ personal: p, perfiles: {}, year: 2026, month });
  };
  const esperado = { 6: { tri1: 1, tri2: 1, v: 2, obs: 2 }, 5: { tri1: 1, tri2: 0, v: 2, obs: 2 }, 4: { tri1: 1, tri2: 0, v: 2, obs: 1 }, 3: { tri1: 1, tri2: 0, v: 1, obs: 1 } };
  for (const n of [6, 5, 4, 3]) {
    const d = gen(n, "D1").diurno[0];
    assert.deepStrictEqual(cuenta(d.M), esperado[n], `mañana con ${n}`);
    assert.deepStrictEqual(cuenta(d.T), esperado[n], `tarde con ${n}`);
  }
  assert.deepStrictEqual(cuenta(gen(5, "N2").noche[0].M), { tri1: 1, tri2: 0, v: 2, obs: 2 });
  assert.deepStrictEqual(cuenta(gen(4, "N2").noche[0].M), { tri1: 1, tri2: 0, v: 2, obs: 1 });
  assert.deepStrictEqual(cuenta(gen(3, "N2").noche[0].M), { tri1: 1, tri2: 0, v: 1, obs: 1 });
  const d5 = gen(5, "D1").diurno[0];
  assert.ok(d5.corto.M.tri2 && !d5.corto.M.obs, "con 5 falta T2 (amarillo) y OBS está cubierta");
});

test("MINIMOS manda de verdad: con triage de mañana = 1 no se asigna ni se exige T2", () => {
  const orig = C.MINIMOS.manana.tri;
  try {
    C.MINIMOS.manana.tri = 1;
    const p = Array.from({ length: 8 }, (_, i) => ({ nombre: "P" + i + " X", turnos: ["D1"] }));
    const d = C.generarMes({ personal: p, perfiles: {}, year: 2026, month: 11 }).diurno[0];
    assert.strictEqual(d.M.tri2, null);
    assert.strictEqual(d.corto.M.tri2, false);
    assert.ok(d.T.tri2, "la tarde mantiene su mínimo de 2 triages");
  } finally {
    C.MINIMOS.manana.tri = orig;
  }
});

test("histórico: los días con puesto fijo no cuentan; al dejar el fijo se vuelve a la media", () => {
  const porMes = {};
  let ultimo;
  for (let i = 0; i < 13; i++) {
    const y = 2025 + Math.floor(i / 12), m = (i % 12) + 1;
    const p = cuadranteSintetico({ seed: 100 + i, dias: new Date(y, m, 0).getDate() });
    const pf = perfilesVacios(p);
    if (i < 12) pf["Enfermero 01"].fijo = "tri1";
    const clave = `${y}-${String(m).padStart(2, "0")}`;
    ultimo = C.generarMes({ personal: p, perfiles: pf, year: y, month: m, historialBase: C.sumarHistorial(porMes, clave) });
    porMes[clave] = ultimo.delta;
    if (i === 0) assert.ok(!(ultimo.delta["Enfermero 01"] || {})._d && !(ultimo.delta["Enfermero 01"] || {}).tri1, "un fijo no suma al histórico");
  }
  const tri = (v) => ((v.tri1 || 0) + (v.tri2 || 0)) / v._d;
  const otros = Object.entries(ultimo.delta).filter(([id, v]) => id !== "Enfermero 01" && v._d >= 10).map(([, v]) => tri(v));
  const media = otros.reduce((a, b) => a + b, 0) / otros.length;
  const ex = tri(ultimo.delta["Enfermero 01"]);
  assert.ok(Math.abs(ex - media) < 0.12, `ex-fijo ${ex.toFixed(2)} vs media ${media.toFixed(2)} (antes: 0 triajes durante 12 meses)`);
});

test("rotar=no: la tarde también cuenta en el histórico", () => {
  const p = Array.from({ length: 10 }, (_, i) => ({ nombre: "P" + i + " X", turnos: Array(30).fill("D1") }));
  const r = C.generarMes({ personal: p, perfiles: { "P0 X": { rotar: "no" } }, year: 2026, month: 11 });
  const v = r.delta["P0 X"];
  const bloques = ["tri1", "tri2", "v1", "v2", "obs"].reduce((n, k) => n + (v[k] || 0), 0);
  assert.strictEqual(bloques, 60, "30 días x 2 bloques");
});

test("explicación: cada asignación dice por qué (fijo, aptitud, equidad...)", () => {
  const p = cuadranteSintetico({ seed: 60 });
  const pf = perfilesMixtos(p);
  pf["Enfermero 02"].fijo = "obs";
  const r = C.generarMes({ personal: p, perfiles: pf, year: 2026, month: 11 });
  const motivos = new Set();
  for (const { franja, b } of bloquesDe(r)) {
    for (const x of enPuesto(b)) {
      assert.ok(typeof x.motivo === "string" && x.motivo.length > 3, `sin motivo: ${x.id}`);
      motivos.add(x.motivo.split(":")[0]);
      if (franja === "M" && x.id === "Enfermero 02") assert.ok(/fijo/.test(x.motivo), x.motivo);
    }
  }
  assert.ok([...motivos].some((m) => /equidad/.test(m)) && [...motivos].some((m) => /aptitud|pediatr/.test(m)), [...motivos].join(" | "));
  const solo = C.generarMes({ personal: [{ nombre: "Sola X", turnos: ["N2"] }], perfiles: {}, year: 2026, month: 11 }).noche[0];
  assert.match(solo.M.tri1.motivo, /única/);
});

test("carro de paradas: reparto por equidad a lo largo del año (antes 3 personas nunca y rango 0.07-0.67)", () => {
  const porMes = {};
  const elegido = {}, disponible = {};
  for (let m = 1; m <= 12; m++) {
    const p = cuadranteSintetico({ seed: 300 + m, dias: new Date(2026, m, 0).getDate() });
    const clave = `2026-${String(m).padStart(2, "0")}`;
    const r = C.generarMes({ personal: p, perfiles: {}, year: 2026, month: m, historialBase: C.sumarHistorial(porMes, clave) });
    porMes[clave] = r.delta;
    for (const d of r.diurno) {
      const t = d.tareas.find((x) => x.includes("Carro Paradas"));
      if (!t) continue;
      t.split("<small")[1].split(">")[1].split("<")[0].split(" / ").forEach((n) => (elegido[n] = (elegido[n] || 0) + 1));
      p.filter((x) => C.clasificarTurno(x.turnos[d.dia - 1]).tipo === "dia").forEach((x) => (disponible[x.nombre] = (disponible[x.nombre] || 0) + 1));
    }
  }
  const tasas = Object.keys(disponible).filter((n) => disponible[n] >= 4).map((n) => (elegido[n] || 0) / disponible[n]);
  console.log(`        carro: veces/viernes trabajado min ${Math.min(...tasas).toFixed(2)} max ${Math.max(...tasas).toFixed(2)}`);
  assert.ok(Math.min(...tasas) > 0, "alguien con 4+ viernes nunca salió");
  assert.ok(Math.max(...tasas) - Math.min(...tasas) <= 0.35, "rango " + (Math.max(...tasas) - Math.min(...tasas)).toFixed(2));
});

test("validarImport: avisa si el cuadrante no cuadra con el mes (posible cambio en aTurnos)", () => {
  assert.deepStrictEqual(C.validarImport(personal, 2026, 11), []);
  const corto = personal.map((p) => ({ ...p, turnos: p.turnos.slice(0, 28) }));
  assert.ok(C.validarImport(corto, 2026, 11).some((a) => /columnas/.test(a)));
  // columnas desplazadas: la primera "celda" es otra cosa y todo se corre una posición
  const desplazado = personal.map((p) => ({ ...p, turnos: ["ENF", ...p.turnos.slice(0, 29)].map((x, i) => (i % 3 === 0 && x ? x + "h" : x)) }));
  assert.ok(C.validarImport(desplazado, 2026, 11).some((a) => /desconocidos/.test(a)));
  assert.ok(C.validarImport([], 2026, 11).some((a) => /nadie/.test(a)));
});

test("copia de seguridad: conserva las cuentas de tareas", () => {
  const r = C.validarCopia({ version: 1, masterStaff: {}, historialMeses: { "2026-10": { A: { _d: 3, tarea_carro_paradas: 1, tareaDisp_carro_paradas: 2, raro: 5 } } } });
  assert.ok(r.ok, r.error);
  assert.deepStrictEqual(r.datos.historialMeses["2026-10"].A, { _d: 3, tarea_carro_paradas: 1, tareaDisp_carro_paradas: 2 });
});

// Pedido del equipo: en observación no se rota. Quien trabaja 12 h y estaba en observación por la mañana
// sigue en observación por la tarde (sin pediatría en el cuadrante, nadie sale de ahí).
test("observación no rota: quien está de 12 h en observación por la mañana sigue ahí por la tarde", () => {
  const r = C.generarMes({ personal, perfiles: perfilesVacios(personal), year: 2026, month: 11 });
  let c = 0;
  for (const dia of r.diurno) {
    if (!dia.T) continue;
    const obsTarde = ids({ obs: dia.T.obs || [] });
    for (const p of asArr(dia.M.obs)) {
      if (p.franja !== "MT") continue;
      c++;
      assert.ok(obsTarde.includes(p.id), `${p.id} sale de observación a las 15 h (día ${dia.dia})`);
      assert.ok(/observación: no rota/.test(dia.T.obs.find((x) => x.id === p.id).motivo || ""), `motivo ausente (día ${dia.dia})`);
    }
  }
  assert.ok(c > 20, `pocos casos: ${c}`);
});

console.log(`\n${pasados} pasados, ${fallos.length} fallos`);
process.exit(fallos.length ? 1 : 0);

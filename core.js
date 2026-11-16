// Urgencias Pro - núcleo del algoritmo (puro: sin DOM ni chrome.*)
// Funciona en el navegador (global UrgenciasCore) y en Node (module.exports) para poder probarlo.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.UrgenciasCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ===== Configuración editable =====
  const VERANO_MESES = [7, 8]; // julio y agosto
  const MINIMOS = {
    manana: { tri: 2, val: 2, obs: 2 },
    tarde: { tri: 2, val: 2, obs: 2 },
    noche: { tri: 1, val: 2, obs: 2 },
    nocheVerano: { tri: 1, val: 2, obs: 1 },
  };
  // Tareas sistemáticas. dias: 0=domingo ... 6=sábado. turno: "D" diurno, "N" noche.
  // personas: si se indica, se sortean esas personas del turno (ej. carro de paradas).
  // franja (solo con personas, turno D): "M" solo quien trabaja por la mañana, "T" solo por la tarde,
  // "D" cualquiera de la jornada.
  const TAREAS_DEFECTO = [
    { id: "carro_paradas", icono: "🚑", nombre: "Carro Paradas", turno: "D", dias: [1], personas: 2, franja: "M" },
    { id: "carro_paradas_t", icono: "🚑", nombre: "Carro Paradas", turno: "D", dias: [5], personas: 2, franja: "T" },
    { id: "desf_carro_n", icono: "🩺", nombre: "Ok Desf/Carro", turno: "N", dias: [3] },
    { id: "caducidad", icono: "📆", nombre: "Caducidad", turno: "N", tipo: "caducidad", activa: true },
  ];
  const FRANJAS_TAREA = ["D", "M", "T"];

  // Configuración guardada en el navegador (versión anterior incluida): conserva lo que cada persona
  // haya cambiado (días, personas, activa, franja) y añade lo nuevo. Quita tareas que ya no existen
  // (farmacia). Si una tarea con franja no la tenía guardada, es de la versión anterior: se usa el valor nuevo.
  function migrarTareas(guardadas) {
    const lista = Array.isArray(guardadas) ? guardadas.filter((t) => t && typeof t === "object") : [];
    return TAREAS_DEFECTO.map((def) => {
      const r = JSON.parse(JSON.stringify(def));
      const t = lista.find((x) => x.id === def.id);
      if (!t || (def.franja && !FRANJAS_TAREA.includes(t.franja))) return r;
      if (Array.isArray(t.dias)) r.dias = t.dias.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6);
      if (def.personas && t.personas) r.personas = Math.max(1, Math.min(6, parseInt(t.personas, 10) || 1));
      if (t.activa !== undefined && def.tipo === "caducidad") r.activa = t.activa !== false;
      if (def.franja) r.franja = t.franja;
      return r;
    });
  }
  const esVerano = (m) => VERANO_MESES.includes(m);
  const minimosNoche = (m) => (esVerano(m) ? MINIMOS.nocheVerano : MINIMOS.noche);

  // Ausencias sin paréntesis (coincidencia exacta). Todo (-XXX) es ausencia:
  // HS, BC, PFD, PAP, BR, AL, Lac, BM, PIHO, CAES, PPN...
  // "AUS" es el código genérico que se guarda tras minimizar (ver minimizarCodigo).
  const AUSENCIAS_EXACTAS = new Set(["V", "L", "BC", "AL", "BR", "PIH", "PFA", "AUS"]);

  // Escapa texto para insertarlo en HTML (los nombres vienen de aTurnos o de copias importadas)
  const escaparHTML = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // tipo: dia | noche | ausente | libre | desconocido
  // franja (solo dia): M = solo mañana, T = solo tarde, MT = jornada completa
  function clasificarTurno(raw) {
    const t = (raw || "").trim().toUpperCase();
    if (!t) return { tipo: "libre" };
    if (t.includes("(-")) return { tipo: "ausente" };
    if (AUSENCIAS_EXACTAS.has(t) || t.includes("DESCANSO")) return { tipo: "ausente" };
    if (/^N+\d*$/.test(t)) return { tipo: "noche" };
    if (/^M+\d*$/.test(t)) return { tipo: "dia", franja: "M" };
    if (/^T+\d*$/.test(t)) return { tipo: "dia", franja: "T" };
    if (/^D+\d*$/.test(t)) return { tipo: "dia", franja: "MT" };
    return { tipo: "desconocido" };
  }

  // Minimización de datos (RGPD): para asignar puestos basta con saber que alguien no acude;
  // la causa (BM, Lac, HS...) es dato de salud y no se guarda.
  function minimizarCodigo(raw) {
    return clasificarTurno(raw).tipo === "ausente" ? "AUS" : String(raw == null ? "" : raw);
  }

  // Primer apellido respetando partículas: "DE LA FUENTE GARCIA" -> "DE LA FUENTE"
  const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "san", "santa", "da", "das", "do", "dos", "van", "von"]);
  function primerApellido(txt) {
    const out = [];
    for (const w of txt.trim().split(/\s+/)) {
      out.push(w);
      if (!PARTICULAS.has(w.toLowerCase())) break;
    }
    return out.join(" ");
  }

  function nombreCorto(nombre) {
    const parts = nombre.split(",");
    if (parts.length >= 2) {
      const nom = parts[1].trim().split(/\s+/)[0];
      return `${primerApellido(parts[0])}, ${nom}`;
    }
    return nombre.trim().split(/\s+/).slice(0, 2).join(" ");
  }

  // Nombres impresos sin ambigüedad: si dos personas comparten nombre corto se alarga
  // (primer apellido + nombre completo) y, si aún coinciden, se usa el nombre completo.
  function nombresCortos(nombres) {
    const res = new Map([...new Set(nombres)].map((n) => [n, nombreCorto(n)]));
    const medio = (n) => {
      const parts = n.split(",");
      return parts.length >= 2 ? `${primerApellido(parts[0])}, ${parts[1].trim()}` : n.trim();
    };
    const repetidos = () => {
      const g = {};
      for (const [n, c] of res) (g[c] = g[c] || []).push(n);
      return Object.values(g).filter((x) => x.length > 1).flat();
    };
    repetidos().forEach((n) => res.set(n, medio(n)));
    repetidos().forEach((n) => res.set(n, n.trim()));
    return res;
  }

  // ¿Le falta al puesto la aptitud requerida? Un aviso por puesto, no por persona:
  // V2 con una persona de pediatría y otra sin ella no avisa.
  function faltaAptitud(post, personas, perfiles) {
    const lista = Array.isArray(personas) ? personas : personas ? [personas] : [];
    if (!lista.length) return false;
    const c = (p) => (perfiles && perfiles[p.id]) || {};
    if (post === "tri1") return !lista.some((p) => c(p).exp_urg && c(p).form_trj);
    if (post === "tri2" || post === "v2") return !lista.some((p) => c(p).esp_ped || c(p).exp_ped);
    return false;
  }

  // Hash determinista [0,1): desempata de forma reproducible e imparcial (no por orden de lista)
  function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
  }

  // Solo se usa entre personas NO aptas (p. ej. nadie con urgencias + triage: mejor quien tiene una de las dos)
  function puntuacionSkill(c, post) {
    if (post === "tri1") return (c.exp_urg ? 10 : 0) + (c.form_trj ? 5 : 0);
    if (post === "tri2" || post === "v2") return (c.esp_ped ? 10 : 0) + (c.exp_ped ? 5 : 0);
    return 0;
  }

  // Aptitud = requisito del puesto, sí o no (sin escalones que anulen la equidad).
  // T1: urgencias + formación en triage. T2 y V2: pediatría (especialidad o experiencia).
  function apto(c, post) {
    if (post === "tri1") return !!(c.exp_urg && c.form_trj);
    if (post === "tri2" || post === "v2") return !!(c.esp_ped || c.exp_ped);
    return true;
  }
  // En V2 va antes la especialista (2) que quien solo tiene experiencia (1)
  const nivelPed = (c) => (c.esp_ped ? 2 : c.exp_ped ? 1 : 0);
  // Puestos de adultos: la pediatría se reserva para V2/T2 y solo va aquí si no hay alternativa
  const PUESTOS_ADULTOS = ["tri1", "v1", "obs"];

  const POSTS = ["tri1", "tri2", "v1", "v2", "obs"];
  const asArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

  // Orden en que se cubren los mínimos de un bloque; si falta personal se sacrifica primero lo último.
  // Con mínimos 2/2/2: 6 personas = 2T 2V 2O · 5 = 1T 2V 2O · 4 = 1T 2V 1O · 3 = 1T 1V 1O.
  // La primera valoración es V2 (pediatría) y la segunda V1.
  const PRIORIDAD_ZONAS = ["tri", "val", "obs", "val", "obs", "tri"];
  function pasosMinimos(min) {
    const n = { tri: 0, val: 0, obs: 0 };
    const seq = [...PRIORIDAD_ZONAS];
    for (let i = 0; i < 10; i++) seq.push("val", "obs"); // por si se suben los mínimos por encima de 2
    const pasos = [];
    for (const z of seq) {
      if (n[z] >= (min[z] || 0)) continue;
      n[z]++;
      if (z === "tri") {
        if (n.tri <= 2) pasos.push(n.tri === 1 ? "tri1" : "tri2"); // solo hay dos puestos de triage
      } else if (z === "val") pasos.push(n.val === 1 ? "v2" : "v1");
      else pasos.push("obs");
    }
    return pasos;
  }

  /**
   * Genera el cuadrante de un mes (diurno + noche) con equilibrio basado en histórico.
   * @param {Object} o
   * @param {Array}  o.personal  [{nombre, turnos:[código por día]}]
   * @param {Object} o.perfiles  {nombre: {esp_ped, exp_ped, exp_urg, form_trj, fijo, rotar}}
   * @param {number} o.year
   * @param {number} o.month     1-12
   * @param {Object} [o.historialBase] acumulado de meses anteriores {id: {_d, tri1, tri2, v1, v2, obs}}
   * @param {Array}  [o.tareas] configuración de tareas (por defecto TAREAS_DEFECTO)
   * @returns {{diurno:Array, noche:Array, delta:Object, desconocidos:string[]}}
   */
  function generarMes({ personal, perfiles, year, month, historialBase, tareas: tareasCfg }) {
    perfiles = perfiles || {};
    tareasCfg = tareasCfg || TAREAS_DEFECTO;
    const base = historialBase || {};
    const hist = {};
    const desconocidos = new Set();
    const cortos = nombresCortos(
      personal.filter((p) => !p.nombre.startsWith("XXX")).map((p) => (perfiles[p.nombre] && perfiles[p.nombre].nombre) || p.nombre)
    );

    const perfil = (id) => perfiles[id] || {};
    // Quien tiene puesto fijo no entra en el cómputo de equidad: ese puesto no lo elige el algoritmo y,
    // al dejar el fijo, vuelve con su histórico rotativo (sin "deuda" que le deje meses sin un puesto).
    const exento = (id) => !!perfil(id).fijo;

    const h = (id) => {
      if (!hist[id]) {
        hist[id] = { _d: 0, tri1: 0, tri2: 0, v1: 0, v2: 0, obs: 0 };
        const b = base[id];
        if (b) for (const [k, v] of Object.entries(b)) if (typeof v === "number") hist[id][k] = v;
      }
      return hist[id];
    };
    // La equidad se mide por GRUPO de puesto (triage = tri1+tri2, valoración = v1+v2, observación)
    const GRUPO = { tri1: ["tri1", "tri2"], tri2: ["tri1", "tri2"], v1: ["v1", "v2"], v2: ["v1", "v2"], obs: ["obs"] };
    // Triage: veces por día trabajado. Valoración/observación compiten por las mismas personas,
    // así que se compara el reparto relativo entre ambas (quien lleva más valoración pasa a observación).
    const tasa = (id, post) => {
      const x = h(id);
      const g = GRUPO[post].reduce((n, k) => n + x[k], 0);
      if (post === "tri1" || post === "tri2") return g / Math.max(1, x._d);
      return g / Math.max(1, x.v1 + x.v2 + x.obs);
    };
    const anotar = (id, post, n = 1) => {
      if (!exento(id) && post in h(id)) h(id)[post] += n;
    };
    const NOMBRE_GRUPO = { tri1: "triage por día", tri2: "triage por día", v1: "parte en valoración", v2: "parte en valoración", obs: "parte en observación" };
    const fmtTasa = (post, x) => (post === "tri1" || post === "tri2" ? x.toFixed(2) : `${Math.round(x * 100)} %`);

    // Elige la mejor candidata para un puesto y explica por qué: el primer criterio que la separa
    // de la siguiente. Orden: puesto fijo > aptitud > (entre no aptas) formación parcial >
    // especialista en V2 > pediatría reservada > regla D/D1 > equidad > desempate reproducible.
    // op: { excluir: [ids], miembros: [ya en el puesto], tarde, noche, ctx }
    function elegir(lista, post, op) {
      if (!lista || lista.length === 0) return null;
      let pool = op.excluir && op.excluir.length ? lista.filter((x) => !op.excluir.includes(x.id)) : lista;
      if (pool.length === 0) pool = lista;
      // El puesto fijo manda por la mañana y por la noche; por la tarde manda "rotar". De noche no hay T2.
      const fijoDe = (x) => {
        const f = perfil(x.id).fijo;
        return !f || op.tarde || (op.noche && f === "tri2") ? "" : f;
      };
      // Quien tiene fijo en OTRO puesto no compite aquí (salvo que no quede nadie más)
      const sinFijoAjeno = pool.filter((x) => !fijoDe(x) || fijoDe(x) === post);
      if (sinFijoAjeno.length) pool = sinFijoAjeno;
      if (pool.length === 1) return { persona: pool[0], motivo: fijoDe(pool[0]) === post ? "puesto fijo" : "única persona disponible" };

      // Equidad: quien tiene puesto fijo (exento) compite con la tasa media, ni favorecida ni castigada
      const tasas = new Map(pool.map((x) => [x.id, exento(x.id) ? null : tasa(x.id, post)]));
      const validas = [...tasas.values()].filter((v) => v !== null);
      const media = validas.length ? validas.reduce((a, b) => a + b, 0) / validas.length : 0;
      for (const [k, v] of tasas) if (v === null) tasas.set(k, media);

      const soloD = !op.noche && !op.tarde && Array.isArray(op.miembros) && op.miembros.length > 0 && op.miembros.every((x) => x.turnoCode === "D");
      const c = (x) => perfil(x.id);
      const criterios = [
        ["puesto fijo", (a, b) => (fijoDe(b) === post) - (fijoDe(a) === post)],
        [post === "tri1" ? "aptitud: urgencias + formación en triage" : "aptitud: pediatría", (a, b) => apto(c(b), post) - apto(c(a), post)],
        ["formación parcial (nadie apta)", (a, b) => (apto(c(a), post) || apto(c(b), post) ? 0 : puntuacionSkill(c(b), post) - puntuacionSkill(c(a), post))],
        ["especialista en pediatría", (a, b) => (post === "v2" ? nivelPed(c(b)) - nivelPed(c(a)) : 0)],
        ["pediatría reservada para V2/T2", (a, b) => (PUESTOS_ADULTOS.includes(post) ? apto(c(a), "v2") - apto(c(b), "v2") : 0)],
        ["regla D/D1 (cubrir de 8 a 10 h)", (a, b) => (soloD ? (a.turnoCode === "D") - (b.turnoCode === "D") : 0)],
        ["equidad", (a, b) => { const d = tasas.get(a.id) - tasas.get(b.id); return Math.abs(d) > 1e-9 ? d : 0; }],
        ["desempate reproducible", (a, b) => hash01(`${a.id}|${op.ctx}|${post}`) - hash01(`${b.id}|${op.ctx}|${post}`)],
      ];
      const orden = [...pool].sort((a, b) => {
        for (const [, f] of criterios) {
          const r = f(a, b);
          if (r) return r;
        }
        return 0;
      });
      const [g, s] = orden;
      let motivo = "desempate reproducible";
      for (const [nombre, f] of criterios) {
        if (f(g, s)) {
          motivo = nombre === "equidad"
            ? `equidad: ${NOMBRE_GRUPO[post]} ${fmtTasa(post, tasas.get(g.id))} frente a ${fmtTasa(post, tasas.get(s.id))} de la siguiente`
            : nombre;
          break;
        }
      }
      return { persona: g, motivo };
    }

    function asignarDia(modoNoche, d) {
      const date = new Date(year, month - 1, d + 1);
      const dow = date.getDay();
      const minM = modoNoche ? minimosNoche(month) : MINIMOS.manana;
      const minT = MINIMOS.tarde;

      const working = personal
        .filter((p) => {
          if (p.nombre.startsWith("XXX")) return false;
          const c = clasificarTurno(p.turnos[d]);
          if (c.tipo === "desconocido") desconocidos.add((p.turnos[d] || "").trim());
          return c.tipo === (modoNoche ? "noche" : "dia");
        })
        .map((p) => ({
          id: p.nombre,
          nombre: perfiles[p.nombre]?.nombre || p.nombre,
          turnoCode: (p.turnos[d] || "").toUpperCase(),
          franja: clasificarTurno(p.turnos[d]).franja,
        }));
      // Un día sin nadie NO se omite: sale como fila con todos los puestos en amarillo
      working.forEach((p) => {
        if (!exento(p.id)) h(p.id)._d++;
      });

      const ctx = `${year}-${month}-${d}-${modoNoche ? "N" : "D"}`;
      const pick = (lista, post, op = {}) => {
        const r = elegir(lista, post, { ...op, ctx, noche: modoNoche });
        if (!r) return null;
        anotar(r.persona.id, post);
        return { ...r.persona, motivo: r.motivo };
      };
      const vacio = () => ({ tri1: null, tri2: null, v1: [], v2: [], obs: [] });
      const cuantos = (as, post) => asArr(as[post]).length;
      const poner = (as, post, x) => {
        if (Array.isArray(as[post])) as[post].push(x);
        else as[post] = x;
      };

      // Rellena un bloque: 1) mínimos en orden de prioridad; 2) la pediatría que sobra refuerza V2
      // (no va a adultos); 3) extras; 4) el resto rota entre puestos y la persona sale por equidad.
      function rellenar(as, pool, { min, extras, dests, excluirTri, tarde }) {
        const quitar = (x) => (pool = pool.filter((y) => y.id !== x.id));
        const objetivo = { tri1: 0, tri2: 0, v1: 0, v2: 0, obs: 0 };
        const asignar = (post) => {
          objetivo[post]++;
          if (cuantos(as, post) >= objetivo[post]) return; // ya cubierto (p. ej. por "rotar = no")
          const x = pick(pool, post, { excluir: post.startsWith("tri") ? excluirTri : null, miembros: as[post], tarde });
          if (x) {
            poner(as, post, x);
            quitar(x);
          }
        };
        // La prioridad decide QUÉ puestos se cubren si falta gente; las personas se eligen en este orden
        // para que T1/T2 se repartan por equidad de triage entre todo el bloque (y V2 antes que T2).
        const ORDEN_ELECCION = ["tri1", "v2", "tri2", "v1", "obs"];
        const yaPuestos = POSTS.reduce((n, k) => n + cuantos(as, k), 0);
        pasosMinimos(min)
          .slice(0, pool.length + yaPuestos)
          .sort((a, b) => ORDEN_ELECCION.indexOf(a) - ORDEN_ELECCION.indexOf(b))
          .forEach(asignar);
        pool.filter((x) => apto(perfil(x.id), "v2")).forEach((x) => {
          anotar(x.id, "v2");
          as.v2.push({ ...x, motivo: "pediatría sobrante: refuerza V2" });
          quitar(x);
        });
        extras.forEach(asignar);
        let i = 0;
        while (pool.length > 0) {
          const post = dests[i++ % dests.length];
          const x = pick(pool, post, { miembros: as[post], tarde });
          poner(as, post, { ...x, motivo: `refuerzo · ${x.motivo}` });
          quitar(x);
        }
      }

      // Regla D/D1: un puesto con varias personas no puede quedar todo "D" (10-22 h): de 8 a 10 no habría
      // nadie. Al elegir ya se prefiere un no-D; si aun así ocurre, se intercambia una "D" con alguien que
      // entra a las 8 de otro puesto (V1/V2/OBS), sin tocar fijos ni pediatría y sin dejar el otro todo "D".
      function reglaD1(as) {
        const P = ["v1", "v2", "obs"];
        const cambio = "regla D/D1: cambiada para cubrir de 8 a 10 h";
        for (const p of P) {
          const arr = as[p];
          if (arr.length < 2 || !arr.every((x) => x.turnoCode === "D")) continue;
          let hecho = false;
          for (const q of P) {
            if (q === p || hecho) continue;
            const otros = as[q];
            for (let i = 0; i < otros.length && !hecho; i++) {
              const x = otros[i];
              if (x.turnoCode === "D" || perfil(x.id).fijo) continue;
              const restoQ = otros.filter((_, j) => j !== i);
              if (restoQ.length && restoQ.every((y) => y.turnoCode === "D")) continue;
              const j = arr.findIndex((y) => !perfil(y.id).fijo && apto(perfil(y.id), "v2") === apto(perfil(x.id), "v2"));
              if (j < 0) continue;
              const y = arr[j];
              arr[j] = { ...x, motivo: cambio };
              otros[i] = { ...y, motivo: cambio };
              anotar(x.id, q, -1);
              anotar(x.id, p);
              anotar(y.id, p, -1);
              anotar(y.id, q);
              hecho = true;
            }
          }
        }
      }

      const asM = vacio();
      rellenar(asM, working.filter((x) => x.franja !== "T"), { // solo-tarde no cubre la mañana
        min: minM,
        extras: modoNoche ? ["v1"] : ["v1", "v2", "obs"],
        dests: modoNoche ? ["v1", "obs", "v2"] : ["v1", "v2", "obs"],
        excluirTri: null,
        tarde: false,
      });
      if (!modoNoche) reglaD1(asM);

      let asT = null;
      if (!modoNoche) {
        asT = vacio();
        const tardeTodos = working.filter((p) => p.franja !== "M"); // solo-mañana no rota a las 15 h
        let poolT = [...tardeTodos];
        // Observación no rota: quien trabaja 12 h allí prefiere quedarse (conoce a los pacientes).
        // Excepción: V2 puede quedar sin especialista si tiene a alguien con experiencia en pediatría,
        // pero no sin pediatría. Si por la tarde V2 se quedaría sin nadie de pediatría y el resto
        // tampoco puede cubrirla, sale de observación a V2 la de pediatría más formada (con rotar = sí).
        const quedanT = (p) => tardeTodos.some((x) => x.id === p.id);
        const pedia = (p) => nivelPed(perfil(p.id)) > 0;
        const v2FijaPed = asArr(asM.v2).some((p) => perfil(p.id).rotar === "no" && pedia(p) && quedanT(p));
        const saleObs = v2FijaPed || poolT.some(pedia)
          ? null
          : asArr(asM.obs).filter((p) => pedia(p) && perfil(p.id).rotar !== "no" && quedanT(p)).sort((a, b) => nivelPed(perfil(b.id)) - nivelPed(perfil(a.id)))[0] || null;
        // rotar = no: siguen por la tarde en su puesto de la mañana
        for (const post of POSTS) {
          for (const p of asArr(asM[post])) {
            if (saleObs && p.id === saleObs.id) continue;
            const sinRotar = perfil(p.id).rotar === "no" || post === "obs";
            if (sinRotar && quedanT(p)) {
              const motivoQuieto = post === "obs" && perfil(p.id).rotar !== "no" ? "observación: no rota a las 15 h (conoce a los pacientes)" : "no rota a las 15 h: sigue en su puesto";
              poner(asT, post, { ...p, motivo: motivoQuieto });
              anotar(p.id, post);
              poolT = poolT.filter((x) => x.id !== p.id);
            }
          }
        }
        if (saleObs) {
          poner(asT, "v2", { ...saleObs, motivo: "pediatría: V2 necesita especialista (sale de observación)" });
          anotar(saleObs.id, "v2");
          poolT = poolT.filter((x) => x.id !== saleObs.id);
        }
        // T1 y T2 rotan: quien hizo triage por la mañana no repite por la tarde
        const exTri = [asM.tri1, asM.tri2].filter(Boolean).map((x) => x.id);
        rellenar(asT, poolT, { min: minT, extras: ["v1", "v2", "obs"], dests: ["v1", "v2", "obs"], excluirTri: exTri, tarde: true });
      }

      // Tareas sistemáticas según la configuración (HTML ligero que pinta la interfaz)
      const tareas = [];
      const turnoClave = modoNoche ? "N" : "D";
      for (const t of tareasCfg) {
        if (t.turno !== turnoClave) continue;
        const sufijo = t.personas && !modoNoche && t.franja === "M" ? " (mañana)" : t.personas && !modoNoche && t.franja === "T" ? " (tarde)" : "";
        const etiqueta = `${escaparHTML(t.icono)} <b>${escaparHTML(t.nombre + sufijo)}`;
        if (t.tipo === "caducidad") {
          if (t.activa !== false && d + 1 === new Date(year, month, 0).getDate() - (month % 3)) {
            tareas.push(`${etiqueta}</b>`);
          }
          continue;
        }
        if (!(t.dias || []).includes(dow)) continue;
        if (t.personas) {
          // Por equidad: sale quien menos veces la ha hecho respecto a las veces que estaba disponible
          // ese día (se guarda en el histórico como tarea_<id> / tareaDisp_<id>).
          const kE = `tarea_${t.id}`;
          const kD = `tareaDisp_${t.id}`;
          // Franja: "M" solo entre quien trabaja por la mañana; "T" solo por la tarde (solo turno diurno)
          const enFranja = !modoNoche && t.franja === "M" ? working.filter((p) => p.franja !== "T")
            : !modoNoche && t.franja === "T" ? working.filter((p) => p.franja !== "M") : working;
          enFranja.forEach((p) => (h(p.id)[kD] = (h(p.id)[kD] || 0) + 1));
          const tasaT = (p) => (h(p.id)[kE] || 0) / Math.max(1, h(p.id)[kD]);
          const elegidos = [...enFranja]
            .sort((a, b) => tasaT(a) - tasaT(b) || hash01(`${a.id}|${ctx}|${t.id}`) - hash01(`${b.id}|${ctx}|${t.id}`))
            .slice(0, t.personas);
          elegidos.forEach((p) => (h(p.id)[kE] = (h(p.id)[kE] || 0) + 1));
          const r = elegidos.map((p) => escaparHTML(cortos.get(p.nombre) || nombreCorto(p.nombre)));
          tareas.push(`${etiqueta}:</b><br><small style="color:#2563eb">${r.join(" / ")}</small>`);
        } else {
          tareas.push(`${etiqueta}</b>`);
        }
      }

      // Amarillo: puesto por debajo de su mínimo (los requeridos salen de MINIMOS, igual que el reparto)
      const cortoDe = (as, min) => {
        const req = { tri1: 0, tri2: 0, v1: 0, v2: 0, obs: 0 };
        pasosMinimos(min).forEach((k) => req[k]++);
        const r = {};
        for (const k of POSTS) r[k] = cuantos(as, k) < req[k];
        return r;
      };
      const cortoM = cortoDe(asM, minM);
      const cortoT = asT ? cortoDe(asT, minT) : {};
      const alguno = Object.values(cortoM).some(Boolean) || Object.values(cortoT).some(Boolean);

      return { dia: d + 1, dow, n: working.length, M: asM, T: asT, tareas, corto: { M: cortoM, T: cortoT, alguno }, obsMin: minM.obs };
    }

    const diurno = [];
    const noche = [];
    const dias = new Date(year, month, 0).getDate();
    for (let d = 0; d < dias; d++) {
      const a = asignarDia(false, d);
      if (a) diurno.push(a);
      const n = asignarDia(true, d);
      if (n) noche.push(n);
    }

    // Aportación de ESTE mes (para guardar por mes y poder regenerar sin duplicar)
    const delta = {};
    for (const id of Object.keys(hist)) {
      const r = {};
      for (const k of Object.keys(hist[id])) {
        const v = hist[id][k] - ((base[id] && base[id][k]) || 0);
        if (v) r[k] = v;
      }
      if (Object.keys(r).length) delta[id] = r;
    }
    return { diurno, noche, delta, desconocidos: [...desconocidos] };
  }

  // Suma los deltas de los meses anteriores a `claveMes` ("YYYY-MM") => historialBase
  function sumarHistorial(porMes, claveMes) {
    const total = {};
    Object.keys(porMes || {})
      .filter((k) => k < claveMes)
      .forEach((k) => {
        for (const [id, v] of Object.entries(porMes[k])) {
          if (!total[id]) total[id] = {};
          for (const [campo, n] of Object.entries(v)) total[id][campo] = (total[id][campo] || 0) + n;
        }
      });
    return total;
  }

  // Valida y sanea una copia de seguridad antes de importarla. Una copia mal formada (o manipulada)
  // no debe romper la app ni colar campos o HTML. Devuelve {ok, error} o {ok, datos}.
  function validarCopia(d) {
    const mal = (error) => ({ ok: false, error });
    const esObjeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
    if (!esObjeto(d) || d.version !== 1) return mal("versión de copia no reconocida");
    if (!esObjeto(d.masterStaff)) return mal("falta la plantilla");
    if (!esObjeto(d.historialMeses)) return mal("falta el histórico");
    const masterStaff = {};
    for (const [id, p] of Object.entries(d.masterStaff)) {
      if (!esObjeto(p)) return mal(`plantilla no válida: ${id}`);
      masterStaff[id] = {
        nombre: typeof p.nombre === "string" && p.nombre.trim() ? p.nombre : id,
        esp_ped: p.esp_ped === true,
        exp_ped: p.exp_ped === true,
        exp_urg: p.exp_urg === true,
        form_trj: p.form_trj === true,
        fijo: ["tri1", "tri2", "obs"].includes(p.fijo) ? p.fijo : "",
        rotar: p.rotar === "no" ? "no" : "si",
      };
    }
    const historialMeses = {};
    for (const [mes, delta] of Object.entries(d.historialMeses)) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return mal(`mes no válido en el histórico: ${mes}`);
      if (!esObjeto(delta)) return mal(`histórico no válido: ${mes}`);
      historialMeses[mes] = {};
      for (const [id, v] of Object.entries(delta)) {
        if (!esObjeto(v)) return mal(`histórico no válido: ${mes} ${id}`);
        const r = {};
        for (const [campo, n] of Object.entries(v)) {
          if (!["_d", ...POSTS].includes(campo) && !/^tarea(Disp)?_[A-Za-z0-9_]+$/.test(campo)) continue; // campos desconocidos fuera
          if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return mal(`valor no válido: ${mes} ${id} ${campo}`);
          if (n) r[campo] = n;
        }
        historialMeses[mes][id] = r;
      }
    }
    let tareasCfg = null;
    if (Array.isArray(d.tareasCfg)) {
      tareasCfg = d.tareasCfg
        .filter((t) => esObjeto(t) && typeof t.id === "string" && typeof t.nombre === "string" && (t.turno === "D" || t.turno === "N"))
        .map((t) => {
          const r = { id: t.id, icono: String(t.icono || ""), nombre: t.nombre, turno: t.turno };
          if (t.tipo === "caducidad") return { ...r, tipo: "caducidad", activa: t.activa !== false };
          r.dias = Array.isArray(t.dias) ? t.dias.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6) : [];
          if (t.personas) r.personas = Math.max(1, Math.min(6, parseInt(t.personas, 10) || 1));
          if (t.franja) r.franja = t.franja;
          return r;
        });
      tareasCfg = migrarTareas(tareasCfg); // copias de versiones anteriores (farmacia, carro del viernes)
    }
    return { ok: true, datos: { masterStaff, historialMeses, tareasCfg } };
  }

  // Comprueba que el cuadrante importado cuadra con el mes. Si no, lo más probable es que aTurnos haya
  // cambiado su estructura (columnas desplazadas, cabecera del mes no encontrada...). Avisos legibles.
  function validarImport(personal, year, month) {
    const lista = (personal || []).filter((p) => p && typeof p.nombre === "string" && !p.nombre.startsWith("XXX"));
    if (!lista.length) return ["no se ha leído a nadie del grupo"];
    const avisos = [];
    const dias = new Date(year, month, 0).getDate();
    const malLargo = lista.filter((p) => (p.turnos || []).length !== dias);
    if (malLargo.length) {
      const largos = [...new Set(malLargo.map((p) => (p.turnos || []).length))].join("/");
      avisos.push(`${malLargo.length} persona(s) con ${largos} columnas de día y el mes tiene ${dias}: revisa el mes o si aTurnos cambió`);
    }
    let conCodigo = 0;
    let raros = 0;
    const ejemplos = new Set();
    for (const p of lista) {
      for (const t of (p.turnos || []).slice(0, dias)) {
        if (!String(t || "").trim()) continue;
        conCodigo++;
        if (clasificarTurno(t).tipo === "desconocido") {
          raros++;
          if (ejemplos.size < 5) ejemplos.add(String(t).trim());
        }
      }
    }
    if (conCodigo && raros / conCodigo > 0.1) {
      avisos.push(`${Math.round((raros / conCodigo) * 100)} % de códigos desconocidos (${[...ejemplos].join(", ")}): ¿columnas desplazadas?`);
    }
    const sinDia = [];
    const sinNoche = [];
    for (let d = 0; d < dias; d++) {
      const tipos = lista.map((p) => clasificarTurno((p.turnos || [])[d]).tipo);
      if (!tipos.includes("dia")) sinDia.push(d + 1);
      if (!tipos.includes("noche")) sinNoche.push(d + 1);
    }
    if (sinDia.length) avisos.push(`días sin nadie de día: ${sinDia.join(", ")}`);
    if (sinNoche.length) avisos.push(`noches sin nadie: ${sinNoche.join(", ")}`);
    return avisos;
  }

  return {
    VERANO_MESES, MINIMOS, TAREAS_DEFECTO, FRANJAS_TAREA, migrarTareas, POSTS,
    esVerano, minimosNoche, clasificarTurno, minimizarCodigo, nombreCorto, nombresCortos, faltaAptitud,
    escaparHTML, pasosMinimos, generarMes, sumarHistorial, validarCopia, validarImport,
  };
});

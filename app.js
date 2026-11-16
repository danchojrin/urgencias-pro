// Urgencias Pro - interfaz (pestaña completa). El algoritmo vive en core.js (UrgenciasCore).
const Core = UrgenciasCore;
const $ = (id) => document.getElementById(id);
const DIAS_SEMANA = [
  { n: 1, l: "L" }, { n: 2, l: "M" }, { n: 3, l: "X" }, { n: 4, l: "J" }, { n: 5, l: "V" }, { n: 6, l: "S" }, { n: 0, l: "D" },
];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

let masterStaff = {};
let historialMeses = {}; // { "2026-11": { id: {_d, tri1, ...} } }
let tareasCfg = JSON.parse(JSON.stringify(Core.TAREAS_DEFECTO));
let currentData = [];
let mesActual = { year: new Date().getFullYear(), month: new Date().getMonth() + 1, label: "" };
let resultado = null;
const confirmaciones = {}; // botones de "pulsa otra vez para confirmar"

const claveMes = () => `${mesActual.year}-${String(mesActual.month).padStart(2, "0")}`;
const nombreMes = (clave) => {
  const [y, m] = clave.split("-");
  return `${MESES[parseInt(m, 10) - 1]} ${y}`;
};

function setStatus(msg, tipo) {
  const el = $("status");
  el.textContent = msg;
  el.className = tipo || "";
}

// Se recuerda lo que escribe ESTA pestaña para distinguirlo de cambios hechos en otra (ver onChanged)
const propias = {};
const guardar = (obj) => {
  for (const [k, v] of Object.entries(obj)) (propias[k] = propias[k] || new Set()).add(JSON.stringify(v));
  return chrome.storage.local.set(obj);
};
const esc = Core.escaparHTML;
// Solo se guarda que alguien no acude, nunca la causa (RGPD: minimización)
const minimizar = (personal) => personal.map((p) => ({ nombre: p.nombre, turnos: (p.turnos || []).map(Core.minimizarCodigo) }));
const guardarStaff = () => guardar({ masterStaff });
const guardarTareas = () => guardar({ tareasCfg });

// Botón de doble pulsación (evita confirm()/alert())
function confirmar(btn, clave, textoConfirm, accion) {
  if (confirmaciones[clave]) {
    clearTimeout(confirmaciones[clave].t);
    btn.textContent = confirmaciones[clave].orig;
    delete confirmaciones[clave];
    accion();
    return;
  }
  confirmaciones[clave] = { orig: btn.textContent, t: setTimeout(() => { btn.textContent = confirmaciones[clave].orig; delete confirmaciones[clave]; }, 4000) };
  btn.textContent = textoConfirm;
}

// ---------- Arranque ----------
(async function init() {
  const r = await chrome.storage.local.get(["masterStaff", "historialMeses", "tareasCfg", "ultimoImport"]);
  masterStaff = r.masterStaff || {};
  historialMeses = r.historialMeses || {};
  if (r.tareasCfg) {
    // Config de versiones anteriores (farmacia, carro del viernes): se actualiza y se vuelve a guardar
    tareasCfg = Core.migrarTareas(r.tareasCfg);
    guardarTareas();
  }
  if (r.ultimoImport) {
    const original = r.ultimoImport.personal || [];
    currentData = minimizar(original);
    mesActual = r.ultimoImport.mes || mesActual;
    // Migración: imports antiguos guardaban la causa de las ausencias (dato de salud); se borra
    if (JSON.stringify(original) !== JSON.stringify(currentData)) await guardar({ ultimoImport: { personal: currentData, mes: mesActual } });
  }
  renderTodo();
  setStatus(currentData.length ? `Último import: ${mesActual.label} (${currentData.length} personas)` : "Importa el cuadrante desde aTurnos para empezar");
})();

function renderTodo() {
  renderDB();
  renderTareas();
  renderMinimos();
  renderMes();
  renderHistorial();
}

// Dos pestañas de la app abiertas: si la otra guarda, esta se actualiza en vez de pisarle los cambios
chrome.storage.onChanged.addListener((cambios, area) => {
  if (area !== "local") return;
  let repintar = false;
  for (const k of ["masterStaff", "historialMeses", "tareasCfg"]) {
    if (!cambios[k]) continue;
    const j = JSON.stringify(cambios[k].newValue);
    if (propias[k] && propias[k].delete(j)) continue; // eco de lo que escribió esta misma pestaña
    if (k === "masterStaff") masterStaff = cambios[k].newValue || {};
    if (k === "historialMeses") historialMeses = cambios[k].newValue || {};
    if (k === "tareasCfg") tareasCfg = Core.migrarTareas(cambios[k].newValue);
    repintar = true;
  }
  if (repintar) {
    renderTodo();
    setStatus("🔄 Datos actualizados desde otra pestaña de Urgencias Pro", "warn");
  }
});

// ---------- Navegación ----------
document.querySelectorAll(".step").forEach((el) => {
  el.onclick = () => {
    document.querySelectorAll(".step").forEach((s) => s.classList.toggle("active", s === el));
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + el.dataset.page));
    if (el.dataset.page === "hist") renderHistorial();
  };
});

// ---------- 1. Plantilla ----------
function renderDB() {
  const tbody = $("dbBody");
  tbody.innerHTML = "";
  Object.keys(masterStaff)
    .filter((id) => !id.startsWith("XXX"))
    .sort((a, b) => masterStaff[a].nombre.localeCompare(masterStaff[b].nombre))
    .forEach((id) => {
      const p = masterStaff[id];
      const tr = document.createElement("tr");
      const checks = ["esp_ped", "exp_ped", "exp_urg", "form_trj"]
        .map((k) => `<td><input type="checkbox" ${p[k] ? "checked" : ""} data-key="${k}"></td>`)
        .join("");
      const op = (v, t) => `<option value="${v}" ${p.fijo === v ? "selected" : ""}>${t}</option>`;
      tr.innerHTML = `<td class="nombre"></td>${checks}
        <td><select data-key="fijo"><option value="">-</option>${op("tri1", "Tr1")}${op("tri2", "Tr2")}${op("obs", "Obs")}</select></td>
        <td><select data-key="rotar"><option value="si" ${p.rotar === "si" ? "selected" : ""}>Si</option><option value="no" ${p.rotar === "no" ? "selected" : ""}>No</option></select></td>`;
      tr.firstChild.textContent = p.nombre;
      // El id (nombre de aTurnos) se asigna por DOM, no dentro del HTML: un nombre con comillas no rompe nada
      tr.querySelectorAll("[data-key]").forEach((el) => (el.dataset.id = id));
      tbody.appendChild(tr);
    });
  tbody.querySelectorAll("input, select").forEach((el) => {
    el.onchange = (e) => {
      const { id, key } = e.target.dataset;
      masterStaff[id][key] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      guardarStaff().then(() => setStatus("✅ Cambios guardados", "ok"));
    };
  });
}

// ---------- Importar de aTurnos ----------
// Muestra una pestaña (y su ventana) en primer plano
async function mostrarPestana(tab) {
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tab.id, { active: true });
}

async function importar() {
  const btn = $("btnSinc");
  btn.disabled = true;
  let pestanaApp = null;
  try {
    const tabs = await chrome.tabs.query({ url: "https://*.aturnos.com/*" });
    if (!tabs.length) throw new Error("Abre el cuadrante mensual de aTurnos en otra pestaña y vuelve a pulsar Importar.");
    const tab = tabs.find((t) => /table_fusion/.test(t.url)) || tabs[0];
    setStatus("⏳ Se muestra aTurnos mientras carga todo el personal (hasta 2 min). Al terminar vuelves aquí sola.");
    pestanaApp = await chrome.tabs.getCurrent();
    // Chrome frena las pestañas en segundo plano y aTurnos deja de cargar filas: se muestra mientras se extrae
    await mostrarPestana(tab);
    // El extractor se inyecta solo ahora (no vive en las páginas de aTurnos ni escucha mensajes)
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extractor.js"] });
    const [inyeccion] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__urgenciasPro.extraer() });
    const resp = inyeccion && inyeccion.result;
    if (!resp || !resp.exito) throw new Error((resp && resp.error) || "No se pudo leer el cuadrante. ¿Estás en la vista Cuadrante (table_fusion)?");
    if (!resp.personal.length) {
      throw new Error("No se encontró personal del grupo Urgencias. Grupos vistos: " + Object.keys(resp.grupos || {}).join(" | "));
    }
    currentData = minimizar(resp.personal);
    const parcial = !!(resp.esperados && currentData.length < resp.esperados);
    const dudoso = !resp.mes_num;
    const m = resp.mes_num || mesActual.month;
    const y = resp.anio || mesActual.year;
    mesActual = { year: y, month: m, label: `${MESES[m - 1].toUpperCase()} ${y}`, dudoso, parcial };
    currentData.forEach((p) => {
      if (!masterStaff[p.nombre]) {
        masterStaff[p.nombre] = { nombre: p.nombre, esp_ped: false, exp_ped: false, exp_urg: false, form_trj: false, fijo: "", rotar: "si" };
      }
    });
    resultado = null;
    await guardar({ masterStaff, ultimoImport: { personal: currentData, mes: mesActual } });
    renderTodo();
    $("resultZone").style.display = "none";
    const avisos = [];
    if (dudoso) avisos.push("no se detectó el mes: elígelo en «3. Generar» antes de generar");
    if (resp.homonimos && resp.homonimos.length) avisos.push(`nombres repetidos guardados aparte: ${resp.homonimos.join(", ")}`);
    avisos.push(...Core.validarImport(currentData, y, m)); // detecta si aTurnos cambió su estructura
    if (parcial) {
      setStatus(`⚠️ Solo se leyeron ${currentData.length} de ${resp.esperados} personas de ${mesActual.label}. aTurnos no terminó de cargar: pulsa Importar otra vez (así no se guarda en el histórico).`, "warn");
    } else if (avisos.length) {
      setStatus(`⚠️ ${currentData.length} importados — ${mesActual.label}. Atención: ${avisos.join(" · ")}`, "warn");
    } else {
      setStatus(`✅ ${currentData.length}${resp.esperados ? ` de ${resp.esperados}` : ""} enfermeros/as importados — ${mesActual.label}`, "ok");
    }
  } catch (e) {
    setStatus("❌ " + e.message, "error");
  } finally {
    if (pestanaApp) await mostrarPestana(pestanaApp).catch(() => {});
    btn.disabled = false;
  }
}
$("btnSinc").onclick = importar;

// ---------- 2. Tareas y mínimos ----------
function renderTareas() {
  const cont = $("tareasBody");
  cont.innerHTML = "";
  tareasCfg.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "tarea-row";
    const turno = t.turno === "N" ? "Noche" : "Diurno";
    let controles = "";
    if (t.tipo === "caducidad") {
      controles = `<button class="btn ${t.activa !== false ? "btn-primary" : "btn-ghost"}" data-i="${i}" data-act="caducidad">${t.activa !== false ? "Activa" : "Desactivada"}</button>
        <span class="hint">Fecha automática: cerca de fin de mes (depende del trimestre)</span>`;
    } else {
      controles = DIAS_SEMANA.map((d) => `<button class="dia-btn ${(t.dias || []).includes(d.n) ? "on" : ""}" data-i="${i}" data-dia="${d.n}">${d.l}</button>`).join("");
      if (t.personas) controles += `<label class="hint" style="margin-left:10px">personas <input type="number" min="1" max="6" value="${t.personas}" data-i="${i}" data-act="personas" style="width:44px"></label>`;
      if (t.personas && t.turno === "D") {
        const opciones = [["D", "Todo el día"], ["M", "Solo mañana"], ["T", "Solo tarde"]];
        controles += `<select data-i="${i}" data-act="franja" style="margin-left:10px;font-size:0.75rem">${opciones.map(([v, l]) => `<option value="${v}" ${(t.franja || "D") === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
      }
    }
    row.innerHTML = `<span class="nombre">${esc(t.icono)} ${esc(t.nombre)}</span><span class="turno">${turno}</span><span>${controles}</span>`;
    cont.appendChild(row);
  });
  cont.querySelectorAll("button[data-dia]").forEach((b) => {
    b.onclick = () => {
      const t = tareasCfg[+b.dataset.i];
      const n = +b.dataset.dia;
      t.dias = (t.dias || []).includes(n) ? t.dias.filter((x) => x !== n) : [...(t.dias || []), n];
      guardarTareas();
      b.classList.toggle("on");
      invalidarResultado("Tareas cambiadas: pulsa Generar para ver el cuadrante actualizado");
    };
  });
  cont.querySelectorAll("[data-act=caducidad]").forEach((b) => {
    b.onclick = () => {
      const t = tareasCfg[+b.dataset.i];
      t.activa = t.activa === false;
      guardarTareas();
      renderTareas();
      invalidarResultado("Tareas cambiadas: pulsa Generar para ver el cuadrante actualizado");
    };
  });
  cont.querySelectorAll("[data-act=franja]").forEach((sel) => {
    sel.onchange = () => {
      tareasCfg[+sel.dataset.i].franja = sel.value;
      guardarTareas();
      invalidarResultado("Tareas cambiadas: pulsa Generar para ver el cuadrante actualizado");
    };
  });
  cont.querySelectorAll("[data-act=personas]").forEach((inp) => {
    inp.onchange = () => {
      tareasCfg[+inp.dataset.i].personas = Math.max(1, Math.min(6, parseInt(inp.value, 10) || 1));
      guardarTareas();
      invalidarResultado("Tareas cambiadas: pulsa Generar para ver el cuadrante actualizado");
    };
  });
}

$("btnTareasDefecto").onclick = () => {
  tareasCfg = JSON.parse(JSON.stringify(Core.TAREAS_DEFECTO));
  guardarTareas();
  renderTareas();
  invalidarResultado("Tareas restauradas: pulsa Generar para ver el cuadrante actualizado");
};

function renderMinimos() {
  const M = Core.MINIMOS;
  const fila = (n, m) => `<div><b>${n}</b> ${m.tri} triage · ${m.val} valoración · ${m.obs} observación</div>`;
  const verano = Core.VERANO_MESES.map((m) => MESES[m - 1]).join(" y ");
  $("minimosInfo").innerHTML =
    fila("Mañana", M.manana) + fila("Tarde", M.tarde) + fila("Noche", M.noche) + fila(`Noche (${verano})`, M.nocheVerano) +
    `<div class="hint">Si falta personal se cubre en este orden: T1 › V2 › OBS › V1 › OBS › T2 (con 5 personas: 1 triage, 2 valoración, 2 observación; con 4: 1 · 2 · 1).
    Lo que queda sin cubrir sale en amarillo. Configurados en core.js (MINIMOS y VERANO_MESES).</div>`;
}

function invalidarResultado(msg) {
  if (resultado) setStatus(msg, "warn");
}

// ---------- 3. Generar ----------
function renderMes() {
  $("mesLabel").textContent = mesActual.label || "-";
  $("mesPersonas").textContent = currentData.length ? `(${currentData.length} personas)` : "";
  $("mesInput").value = `${mesActual.year}-${String(mesActual.month).padStart(2, "0")}`;
  $("mesDudoso").style.display = mesActual.dudoso ? "inline" : "none";
}

// Corregir el mes a mano (si aTurnos no lo dejó claro o se detectó mal)
$("mesInput").onchange = async (e) => {
  const [y, m] = (e.target.value || "").split("-").map((x) => parseInt(x, 10));
  if (!y || !m) return;
  mesActual = { ...mesActual, year: y, month: m, label: `${MESES[m - 1].toUpperCase()} ${y}`, dudoso: false };
  await guardar({ ultimoImport: { personal: currentData, mes: mesActual } });
  resultado = null;
  $("resultZone").style.display = "none";
  renderMes();
  const avisos = Core.validarImport(currentData, y, m);
  setStatus(avisos.length ? `⚠️ Mes cambiado a ${mesActual.label}. Atención: ${avisos.join(" · ")}` : `Mes cambiado a ${mesActual.label}`, avisos.length ? "warn" : "ok");
};

function generar() {
  if (!currentData.length) {
    setStatus("Primero importa el cuadrante desde aTurnos.", "error");
    return;
  }
  if (mesActual.dudoso) {
    setStatus("⚠️ No se detectó el mes del cuadrante: elígelo en el selector de mes y vuelve a pulsar Generar.", "warn");
    return;
  }
  const clave = claveMes();
  const base = Core.sumarHistorial(historialMeses, clave);
  resultado = Core.generarMes({
    personal: currentData,
    perfiles: masterStaff,
    year: mesActual.year,
    month: mesActual.month,
    historialBase: base,
    tareas: tareasCfg,
  });
  // Un import incompleto no se guarda: contaría como si los que faltan no hubieran trabajado
  if (!mesActual.parcial) {
    historialMeses[clave] = resultado.delta; // sustituye la aportación de este mes (no duplica)
    guardar({ historialMeses });
  }
  $("resultZone").style.display = "block";
  pintarTabla();
  renderHistorial();
  if (mesActual.parcial) {
    setStatus("⚠️ Cuadrante generado pero NO guardado en el histórico: el import estaba incompleto. Vuelve a importar.", "warn");
  } else if (resultado.desconocidos.length) {
    setStatus(`⚠️ Guardado en el histórico. Códigos no reconocidos (ignorados): ${resultado.desconocidos.join(", ")}`, "warn");
  } else {
    setStatus(`✅ Cuadrante generado y guardado en el histórico (${nombreMes(clave)}). Pasa el ratón por un nombre para ver por qué está ahí.`, "ok");
  }
}
$("btnGenerar").onclick = generar;
$("turnoSel").onchange = pintarTabla;

function pintarTabla() {
  if (resultado) $("tablaDiv").innerHTML = htmlTabla($("turnoSel").value === "NOCHE");
}

let cortos = new Map(); // nombre -> nombre impreso sin ambigüedad (se calcula al pintar la tabla)

// avisar: el puesto entero carece de la aptitud requerida (Core.faltaAptitud). Se marca a quien no la tiene.
function renderP(p, post, avisar) {
  if (!p) return "-";
  const c = masterStaff[p.id] || {};
  let warn = "";
  if (avisar && post === "tri1" && (!c.exp_urg || !c.form_trj)) warn = '<span class="alert-skill">⚠️ !Skill</span>';
  if (avisar && (post === "tri2" || post === "v2") && !c.esp_ped && !c.exp_ped) warn = '<span class="alert-skill">⚠️ !Esp</span>';
  const b = document.createElement("b");
  if (warn) b.style.color = "var(--danger)";
  b.textContent = cortos.get(p.nombre) || Core.nombreCorto(p.nombre);
  // "Por qué esta persona aquí": criterio que la separó de la siguiente candidata (al pasar el ratón)
  if (p.motivo) b.title = `${p.nombre} — ${p.motivo}`;
  return `<div>${b.outerHTML}${warn}</div>`;
}

function htmlTabla(modoNoche) {
  const dias = modoNoche ? resultado.noche : resultado.diurno;
  const etiqueta = modoNoche ? "TURNO NOCHE" : "MAÑANA / TARDE";
  cortos = Core.nombresCortos(currentData.filter((p) => !p.nombre.startsWith("XXX")).map((p) => masterStaff[p.nombre]?.nombre || p.nombre));
  const celda = (M, T, post, flagM, flagT) => {
    const cls = flagM || flagT ? ' class="shortage-cell"' : "";
    const pinta = (v) => {
      const avisar = Core.faltaAptitud(post, v, masterStaff);
      return Array.isArray(v) ? v.map((x) => renderP(x, post, avisar)).join("") : renderP(v, post, avisar);
    };
    if (!T) return `<td${cls}><div class="morning-content">${pinta(M)}</div></td>`;
    return `<td${cls}><div class="morning-content">${pinta(M)}</div><div class="rotation-box"><span class="time-mark">15:00h ➔</span>${pinta(T)}</div></td>`;
  };
  let html = `<div style="text-align:center;font-weight:bold;font-size:0.85rem;margin-bottom:6px;letter-spacing:0.05em">${mesActual.label} — ${etiqueta}</div>
    <table class="res-table"><thead><tr><th class="dia-col">D</th><th class="num-col">N</th><th>T1</th><th>V1</th><th>V2</th><th>OBS</th>${modoNoche ? "" : "<th>T2</th>"}<th>ACTIVIDADES</th></tr></thead><tbody>`;
  for (const d of dias) {
    const T = d.T;
    const f = (post) => [d.corto.M[post], T ? d.corto.T[post] : false];
    let row = `<tr><td class="dia-col">${d.dia}</td><td class="num-col${d.corto.alguno ? " shortage-num" : ""}">${d.n}</td>`;
    row += celda(d.M.tri1, T && T.tri1, "tri1", ...f("tri1"));
    row += celda(d.M.v1, T && T.v1, "v1", ...f("v1"));
    row += celda(d.M.v2, T && T.v2, "v2", ...f("v2"));
    row += celda(d.M.obs, T && T.obs, "obs", ...f("obs"));
    if (!modoNoche) row += celda(d.M.tri2, T && T.tri2, "tri2", ...f("tri2"));
    row += `<td>${d.tareas.length ? `<div class="task-box">${d.tareas.join("<br>")}</div>` : ""}</td></tr>`;
    html += row;
  }
  return html + "</tbody></table>";
}

$("btnImprimir").onclick = () => {
  if (!resultado) return;
  const label = mesActual.label || "Cuadrante";
  // Un solo documento con diurno y noche, cada uno en su hoja. Antes eran dos pestañas y la de
  // diurno, en segundo plano, no llegaba a imprimirse: la noche se perdía.
  const html = htmlTabla(false) + '<div class="salto-pagina"></div>' + htmlTabla(true);
  guardar({ print_payload: { titulo: `Cuadrante — ${label}`, html } }).then(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL("print.html?type=payload"), active: true });
  });
};

// ---------- 4. Histórico ----------
function totalesHistorial() {
  const tot = {};
  Object.values(historialMeses).forEach((delta) => {
    for (const [id, v] of Object.entries(delta)) {
      const t = (tot[id] = tot[id] || { _d: 0, tri: 0, val: 0, obs: 0 });
      t._d += v._d || 0;
      t.tri += (v.tri1 || 0) + (v.tri2 || 0);
      t.val += (v.v1 || 0) + (v.v2 || 0);
      t.obs += v.obs || 0;
    }
  });
  return tot;
}

function renderHistorial() {
  // Repintar crea botones nuevos: se anulan las confirmaciones pendientes (evita borrar con un solo clic)
  for (const k of Object.keys(confirmaciones)) {
    if (k.startsWith("del")) {
      clearTimeout(confirmaciones[k].t);
      delete confirmaciones[k];
    }
  }
  const claves = Object.keys(historialMeses).sort();
  const cont = $("mesesGuardados");
  cont.innerHTML = claves.length ? "<div class='hint'>Meses en el histórico:</div>" : "<div class='hint'>Aún no hay meses guardados. Se guardan al generar el cuadrante.</div>";
  claves.forEach((k) => {
    const chip = document.createElement("span");
    chip.className = "mes-chip";
    chip.innerHTML = `<span>${esc(nombreMes(k))}</span><button title="Quitar este mes del histórico">✕</button>`;
    const btn = chip.querySelector("button");
    btn.onclick = () =>
      confirmar(btn, "del" + k, "¿Seguro?", () => {
        delete historialMeses[k];
        guardar({ historialMeses });
        renderHistorial();
        setStatus(`Mes ${nombreMes(k)} quitado del histórico`, "warn");
      });
    cont.appendChild(chip);
  });
  const tot = totalesHistorial();
  const tbody = $("histBody");
  tbody.innerHTML = "";
  Object.keys(tot)
    .sort((a, b) => (masterStaff[a]?.nombre || a).localeCompare(masterStaff[b]?.nombre || b))
    .forEach((id) => {
      const t = tot[id];
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="nombre"></td><td>${t._d}</td><td>${t.tri}</td><td>${t.val}</td><td>${t.obs}</td><td>${(t.tri / Math.max(1, t._d)).toFixed(2)}</td>`;
      tr.firstChild.textContent = masterStaff[id]?.nombre || id;
      tbody.appendChild(tr);
    });
}

// ---------- Copia de seguridad ----------
$("btnExportar").onclick = () => {
  const data = { version: 1, exportado: new Date().toISOString(), masterStaff, historialMeses, tareasCfg };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `urgencias-pro-copia-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus("✅ Copia exportada. Guárdala en un sitio seguro: contiene nombres de la plantilla.", "ok");
};

$("fileImportar").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const v = Core.validarCopia(JSON.parse(await file.text()));
    if (!v.ok) throw new Error(v.error);
    masterStaff = v.datos.masterStaff;
    historialMeses = v.datos.historialMeses;
    if (v.datos.tareasCfg) tareasCfg = v.datos.tareasCfg;
    await guardar({ masterStaff, historialMeses, tareasCfg });
    renderTodo();
    setStatus("✅ Copia importada", "ok");
  } catch (err) {
    setStatus("❌ No se pudo importar la copia: " + err.message, "error");
  }
  e.target.value = "";
};

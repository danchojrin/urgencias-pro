// Extractor v15.0 - mes robusto, carga completa y filtro por grupo (Urgencias)
// Se inyecta solo al pulsar "Importar" (app.js, chrome.scripting): no vive en las páginas de aTurnos
// ni escucha mensajes. Deja window.__urgenciasPro.extraer() en el mundo aislado de la extensión.
(function () {
  // Solo se importan las filas bajo la cabecera de grupo que termine en "Urg <n>"
  // (ej. "URGENCIAS Y CONSULTAS EXTERNAS Urg 43"). Cambiar si el grupo se llama distinto.
  const GRUPO_OBJETIVO = /\sUrg\s*\d*\s*$/i;

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  function limpiarNombre(n) {
    if (!n) return "";
    const partes = n.split("\n").map((p) => p.trim()).filter((p) => p.length >= 2);
    let limpio = partes[partes.length - 1] || "";
    const palabras = limpio.split(" ");
    if (palabras.length > 2 && palabras[0].length <= 2 && /^[A-Z0-9]+$/.test(palabras[0])) {
      palabras.shift();
      limpio = palabras.join(" ");
    }
    return limpio;
  }

  function esNombreValido(n) {
    if (!n || n.length < 5) return false;
    if (/\d{1,2}:\d{2}/.test(n)) return false;
    const descartar = ["TOTAL", "HORAS", "TURNO", "LEYENDA", "DÍAS"];
    if (descartar.some((d) => n.toUpperCase().includes(d))) return false;
    return /[a-zA-Z]/.test(n);
  }

  // Código del turno = primera línea de la celda. Si la causa de ausencia "(-XXX)" aparece en otra
  // línea, se añade: perderla haría asignar a alguien que no acude.
  function codigoCelda(texto) {
    const lineas = String(texto || "").split("\n").map((l) => l.trim()).filter(Boolean);
    let cod = lineas[0] || "";
    if (!cod.includes("(-")) {
      const aus = lineas.slice(1).map((l) => l.match(/\(-[^)]*\)?/)).find(Boolean);
      if (aus) cod += aus[0];
    }
    return cod;
  }

  // Dos filas con el mismo nombre: con turnos idénticos es la misma fila repetida (se ignora);
  // con turnos distintos son homónimos y se conservan ambos ("Nombre (2)").
  // Devuelve la clave usada, o null si se ignoró.
  function agregarPersona(mapa, nombre, turnos) {
    let clave = nombre;
    let i = 2;
    while (mapa.has(clave)) {
      if (mapa.get(clave).turnos.join("|") === turnos.join("|")) return null;
      clave = `${nombre} (${i++})`;
    }
    mapa.set(clave, { nombre: clave, turnos });
    return clave;
  }

  // Año del cuadrante: 1) año escrito en la cabecera del mes; 2) data-date si es del MISMO mes;
  // 3) el año más cercano a hoy para ese mes (diciembre visto en enero = año anterior, y al revés).
  function resolverAnio(textoMes, fecha, mesNum, hoy) {
    const m = String(textoMes || "").match(/\b(20\d{2})\b/);
    if (m) return parseInt(m[1], 10);
    if (fecha && /^\d{4}-\d{2}/.test(fecha) && (!mesNum || parseInt(fecha.substring(5, 7), 10) === mesNum)) {
      return parseInt(fecha.substring(0, 4), 10);
    }
    const y = hoy.getFullYear();
    const mh = hoy.getMonth() + 1;
    if (!mesNum) return y;
    if (mesNum - mh > 6) return y - 1;
    if (mh - mesNum > 6) return y + 1;
    return y;
  }

  // En Node (tests) solo se exportan las funciones puras; en el navegador sigue el extractor.
  if (typeof module === "object" && module.exports) {
    module.exports = { GRUPO_OBJETIVO, limpiarNombre, esNombreValido, codigoCelda, agregarPersona, resolverAnio };
    return;
  }

  // Personas ya cargadas del grupo objetivo y nº esperado, que aTurnos indica en la cabecera
  // del grupo (ej. "... Urg 43").
  function contarGrupoObjetivo() {
    let esperado = null;
    let encontrado = 0;
    let grupoActual = "";
    document.querySelectorAll("tr").forEach((fila) => {
      const celdas = fila.querySelectorAll("td, th");
      if (celdas.length < 3) {
        const txt = fila.innerText.trim().replace(/\s+/g, " ");
        if (txt) grupoActual = txt;
        if (GRUPO_OBJETIVO.test(txt)) {
          const m = txt.match(/(\d+)\s*$/);
          if (m) esperado = parseInt(m[1], 10);
        }
        return;
      }
      if (celdas.length >= 15 && GRUPO_OBJETIVO.test(grupoActual) && esNombreValido(celdas[0].innerText.trim())) {
        encontrado++;
      }
    });
    return { esperado, encontrado };
  }

  // aTurnos carga el cuadrante por tramos al hacer scroll. Se baja hasta ver todas las personas
  // esperadas; si no se conoce el total, hasta 15 s sin ninguna fila nueva.
  async function cargarTodo() {
    const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
    const SIN_PROGRESO_MS = 15000;
    const MAX_MS = 120000;
    const t0 = Date.now();
    let mejor = -1;
    let ultimoProgreso = Date.now();
    let estado = contarGrupoObjetivo();
    while (Date.now() - t0 < MAX_MS) {
      estado = contarGrupoObjetivo();
      if (estado.encontrado > mejor) {
        mejor = estado.encontrado;
        ultimoProgreso = Date.now();
      }
      if (estado.esperado !== null && estado.encontrado >= estado.esperado) break;
      if (Date.now() - ultimoProgreso > SIN_PROGRESO_MS) break;
      // bajar al final y "sacudir" para que se disparen los eventos de scroll aunque no cambie la posición
      window.scrollTo(0, document.scrollingElement.scrollHeight);
      await dormir(500);
      window.scrollBy(0, -400);
      await dormir(200);
      window.scrollTo(0, document.scrollingElement.scrollHeight);
      await dormir(500);
    }
    window.scrollTo(0, 0);
    return estado;
  }

  function extraerMes() {
    // Cabecera del mes: th con colspan = días del mes (28-31)
    const thMes = Array.from(document.querySelectorAll("th[colspan]")).find((t) => {
      const c = parseInt(t.getAttribute("colspan"), 10);
      return c >= 28 && c <= 31 && MESES.some((m) => t.innerText.toLowerCase().includes(m));
    });
    const fechas = Array.from(document.querySelectorAll("[data-date]")).map((e) => e.dataset.date || "");
    let mesNum = fechas[0] ? parseInt(fechas[0].substring(5, 7), 10) : 0;
    if (thMes) {
      const idx = MESES.findIndex((m) => thMes.innerText.toLowerCase().includes(m));
      if (idx >= 0) mesNum = idx + 1;
    }
    // data-date del mismo mes que la cabecera (el primero puede ser de otro mes o de un widget)
    const fecha = fechas.find((f) => parseInt(f.substring(5, 7), 10) === mesNum) || fechas[0] || "";
    const anio = resolverAnio(thMes ? thMes.innerText : "", fecha, mesNum, new Date());
    return {
      mes: mesNum ? `${MESES[mesNum - 1].toUpperCase()} ${anio}` : document.title,
      mes_num: mesNum || null,
      anio,
      dias: thMes ? parseInt(thMes.getAttribute("colspan"), 10) : null,
    };
  }

  async function extraerDatos() {
    const carga = await cargarTodo();

    const info = extraerMes();
    const personal = new Map();
    const grupos = {};
    const homonimos = [];
    let grupoActual = "";

    // Recorrido en orden de DOM: las cabeceras de grupo (<3 celdas) preceden a sus filas
    document.querySelectorAll("tr").forEach((fila) => {
      const celdas = Array.from(fila.querySelectorAll("td, th"));
      if (celdas.length < 3) {
        const txt = fila.innerText.trim().replace(/\s+/g, " ");
        if (txt) grupoActual = txt;
        return;
      }
      if (celdas.length < 15) return;

      let colNombre = -1;
      for (let i = 0; i < 3; i++) {
        if (celdas[i] && esNombreValido(celdas[i].innerText.trim())) {
          colNombre = i;
          break;
        }
      }
      if (colNombre < 0) return;

      grupos[grupoActual] = (grupos[grupoActual] || 0) + 1;
      if (!GRUPO_OBJETIVO.test(grupoActual)) return;

      const nombre = limpiarNombre(celdas[colNombre].innerText.trim());
      if (!nombre) return;

      const ndias = info.dias || celdas.length - colNombre - 1;
      // No se quitan los paréntesis: core.js los usa para detectar bajas/permisos
      const turnos = celdas.slice(colNombre + 1, colNombre + 1 + ndias).map((c) => codigoCelda(c.innerText));

      const clave = agregarPersona(personal, nombre, turnos);
      if (clave && clave !== nombre) homonimos.push(clave);
    });

    return {
      exito: true,
      personal: Array.from(personal.values()),
      grupos, // recuento por grupo, para diagnóstico
      homonimos, // nombres repetidos con turnos distintos (se guardan como "Nombre (2)")
      esperados: carga.esperado, // nº de personas que indica la cabecera del grupo
      cargados: carga.encontrado, // nº realmente cargados en la tabla
      ...info,
    };
  }

  // Reinyectar el archivo solo sustituye la función (sin guard que pueda dejarla bloqueada tras recargar
  // la extensión). Si ya hay una extracción en marcha, se reutiliza en vez de lanzar otra en paralelo.
  window.__urgenciasPro = {
    version: "15.0",
    extraer() {
      if (!window.__urgenciasProEnCurso) {
        const p = extraerDatos()
          .catch((err) => ({ error: err.message }))
          .finally(() => {
            if (window.__urgenciasProEnCurso === p) window.__urgenciasProEnCurso = null;
          });
        window.__urgenciasProEnCurso = p;
      }
      return window.__urgenciasProEnCurso;
    },
  };
})();

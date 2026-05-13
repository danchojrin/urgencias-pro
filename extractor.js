// Extractor v12.7 - Soporte para Bajas e Incidencias
console.log("Urgencias Pro: Extractor v12.7 activado");

async function extraerDatos() {
  console.log("Iniciando extracción...");
  const listaFinal = new Map();
  const scrollContainer = document.scrollingElement || document.documentElement;
  let ultimaAltura = 0;
  let intentosSinNuevos = 0;

  function limpiarNombre(n) {
    if (!n) return "";
    let partes = n
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length >= 2);
    let limpio = partes[partes.length - 1] || "";
    let palabras = limpio.split(" ");
    if (
      palabras.length > 2 &&
      palabras[0].length <= 2 &&
      /^[A-Z0-9]+$/.test(palabras[0])
    ) {
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

  function capturarVisibles() {
    const filas = Array.from(document.querySelectorAll("tr"));
    let encontrados = 0;

    filas.forEach((fila) => {
      const celdas = Array.from(fila.querySelectorAll("td, th"));
      if (celdas.length < 15) return;

      let nombreRaw = "";
      let colNombre = 0;
      for (let i = 0; i < 3; i++) {
        if (celdas[i] && esNombreValido(celdas[i].innerText.trim())) {
          nombreRaw = celdas[i].innerText.trim();
          colNombre = i;
          break;
        }
      }

      if (!nombreRaw) return;
      let nombreLimpio = limpiarNombre(nombreRaw);

      if (!listaFinal.has(nombreLimpio)) {
        // IMPORTANTE: No quitamos los paréntesis aquí para que popup.js detecte las bajas
        const turnos = celdas.slice(colNombre + 1, colNombre + 32).map((c) => {
          return c.innerText.trim().split("\n")[0];
        });

        listaFinal.set(nombreLimpio, {
          nombre: nombreLimpio,
          turnos: turnos,
        });
        encontrados++;
      }
    });
    return encontrados;
  }

  while (intentosSinNuevos < 4) {
    const nuevos = capturarVisibles();
    window.scrollBy(0, 800);
    await new Promise((r) => setTimeout(r, 800));
    let alturaActual = scrollContainer.scrollTop;
    if (alturaActual === ultimaAltura) {
      intentosSinNuevos++;
    } else {
      intentosSinNuevos = 0;
      ultimaAltura = alturaActual;
    }
    if (listaFinal.size > 150) break;
  }

  window.scrollTo(0, 0);
  return {
    exito: true,
    personal: Array.from(listaFinal.values()),
    mes: document.title,
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "get_data") {
    extraerDatos()
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
  }
  return true;
});

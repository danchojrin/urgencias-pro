// Un único documento: diurno y noche (ver btnImprimir en app.js)
chrome.storage.local.get(['print_payload'], (result) => {
    const data = result.print_payload;
    if (data) {
        document.getElementById('titulo').innerText = data.titulo;
        document.getElementById('contenido').innerHTML = data.html;
        
        // Pausa para asegurar renderizado antes de imprimir
        setTimeout(() => {
            window.print();
        }, 500);
    } else {
        document.getElementById('titulo').innerText = "Error: No se encontraron datos para imprimir.";
    }
});
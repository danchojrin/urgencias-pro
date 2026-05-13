const urlParams = new URLSearchParams(window.location.search);
const payloadKey = urlParams.get('type') === 'payload_noche' ? 'print_payload_noche' : 'print_payload';

chrome.storage.local.get([payloadKey], (result) => {
    const data = result[payloadKey];
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
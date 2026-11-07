# 🏥 Urgencias Pro - Extractor y Distribuidor de Cuadrantes

**Urgencias Pro** es una extensión de Chrome diseñada para optimizar la gestión de personal de enfermería en servicios de urgencias. Permite extraer automáticamente los turnos desde la plataforma **aTurnos** y generar una propuesta de distribución de puestos (Triage, Observación, Valoración, etc.) basada en las competencias y especialidades de cada trabajador.

## 🚀 Características principales

- **Extracción Inteligente**: Obtiene los datos del cuadrante mensual de aTurnos automáticamente, incluyendo la detección de bajas y licencias.
- **Gestión de Plantilla**: Permite configurar perfiles de personal indicando:
  - Especialidad en Pediatría.
  - Experiencia en Urgencias/Triage.
  - Puestos fijos o rotativos.
- **Algoritmo de Distribución**: Genera un cuadrante diario equilibrado:
  - Asigna Triage y puestos críticos según formación específica.
  - Gestiona rotaciones automáticas para el turno de tarde (15:00h).
  - Incluye recordatorios de tareas sistemáticas (Farmacia, Revisión de Carros, Caducidades).
- **Modo Impresión**: Genera vistas limpias y profesionales listas para imprimir tanto para el turno diurno como nocturno.

## ⚙️ Cómo reparte los puestos

- **Mínimos** (en `core.js`, `MINIMOS`): mañana y tarde 2 triage · 2 valoración · 2 observación; noche 1 · 2 · 2; noche de julio y agosto 1 · 2 · 1.
- **Si falta personal** se cubre en este orden: T1 › V2 › OBS › V1 › OBS › T2. Con 5 personas: 1 triage, 2 valoración, 2 observación; con 4: 1 · 2 · 1. Lo que queda sin cubrir sale en amarillo.
- **Para cada puesto** se elige por este orden: puesto fijo › aptitud (T1: urgencias + formación en triage; T2/V2: pediatría) › en V2, especialista antes que solo experiencia › la pediatría se reserva para V2/T2 (a adultos solo si no hay alternativa) › regla D/D1 (ningún puesto de varias personas todo con "D", que entra a las 10) › **equidad** (menor proporción histórica de ese grupo de puesto) › desempate reproducible.
- **Rotación de las 15 h**: quien hizo triage por la mañana no repite por la tarde. "Rotar = No" mantiene a la persona en su puesto todo el día.
- **Histórico**: se guarda por mes y se usa los meses siguientes. Los días con puesto fijo no cuentan (al dejar el fijo se vuelve a la media). Un import incompleto no se guarda.
- **Por qué**: al pasar el ratón por un nombre del cuadrante se ve el criterio que decidió esa asignación.
- **Carro de paradas** (y tareas con personas): sale quien menos veces lo ha hecho respecto a los días que estaba disponible.

El código es abierto: los puestos, mínimos y tareas se pueden adaptar en `core.js`.

## 🔒 Privacidad

Todo se guarda solo en tu navegador (`chrome.storage.local`); no hay servidor. De las bajas y permisos solo se guarda que la persona no acude, nunca la causa. La copia de seguridad contiene nombres y experiencia de la plantilla: guárdala en un sitio seguro y no la subas al repositorio.

## 🧪 Tests (sin dependencias)

```
node test/core.test.js && node test/extractor.test.js && node test/app.test.js
```

## 🛠️ Instalación

Dado que esta es una herramienta de código abierto para profesionales, puedes instalarla siguiendo estos pasos:

1. Descarga o clona este repositorio.
2. Abre tu navegador Google Chrome y ve a `chrome://extensions/`.
3. Activa el **"Modo de desarrollador"** en la esquina superior derecha.
4. Haz clic en **"Cargar descomprimida"** y selecciona la carpeta de esta extensión.
5. ¡Listo! Ya verás el icono en tu barra de herramientas.

## 📋 Cómo usar

1. Entra en tu cuadrante mensual de **aTurnos** (vista Cuadrante).
2. Pulsa el icono de la extensión y haz clic en **"⚡ Importar de aTurnos"**. Se mostrará aTurnos mientras carga a todo el personal y después volverás a la app. Si el mes no se detecta, elígelo en "3. Generar".
3. En la pestaña **"Mi Plantilla"**, configura por única vez las habilidades de tus compañeros (esto se guarda localmente en tu navegador).
4. Ve a **"Generar Distribución"** y pulsa el botón para obtener el cuadrante.
5. Revisa y pulsa **"Imprimir"**.

## ⚖️ Licencia

Este proyecto está bajo la [Licencia MIT](LICENSE), lo que significa que es software libre y puedes usarlo, modificarlo y compartirlo libremente.

---
## ✍️ Autor

Proyecto diseñado y desarrollado por **Dan Chojrin**.

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Si tienes ideas para mejorar el algoritmo, añadir nuevos puestos o mejorar la interfaz, no dudes en abrir un *Issue* o enviar un *Pull Request*.

---
*Desarrollado para facilitar el día a día de los profesionales de enfermería en urgencias.*

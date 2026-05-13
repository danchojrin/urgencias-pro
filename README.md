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

## ⚙️ Configuración del Algoritmo

Esta extensión ha sido diseñada para cubrir una **casuística específica** común en servicios de urgencias de gran volumen, pero es totalmente adaptable:

- **Configuración por defecto**: El algoritmo distribuye el personal en **2 puestos de Triage, 2 puestos de Valoración y 2 puestos de Observación**.
- **Adaptabilidad**: El código es abierto y modular; otros desarrolladores o usuarios avanzados pueden añadir o modificar los campos y puestos en `popup.js` para adaptarlos a las necesidades de su centro específico.

## 🛠️ Instalación

Dado que esta es una herramienta de código abierto para profesionales, puedes instalarla siguiendo estos pasos:

1. Descarga o clona este repositorio.
2. Abre tu navegador Google Chrome y ve a `chrome://extensions/`.
3. Activa el **"Modo de desarrollador"** en la esquina superior derecha.
4. Haz clic en **"Cargar descomprimida"** y selecciona la carpeta de esta extensión.
5. ¡Listo! Ya verás el icono en tu barra de herramientas.

## 📋 Cómo usar

1. Entra en tu cuadrante mensual de **aTurnos**.
2. Abre la extensión y haz clic en **"⚡ Importar de aTurnos"**.
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

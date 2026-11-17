# Vistas diédricas · 1º ESO

Aplicación para practicar las vistas (alzado, planta y perfil izquierdo, sistema europeo) de piezas de hasta 3×3×3 bloques.

**En línea:** https://dibujo.daviddiaz.es

**Uso local:** abre `index.html` con doble clic. Funciona sin conexión: Three.js r147 está copiado en `js/lib/`.

## Modos
- **Editor libre**: se construye la pieza (clic en 3D o en las capas) y las vistas se actualizan en tiempo real.
- **Vistas → Pieza**: se muestran las vistas y hay que construir la pieza. Cualquier pieza con las mismas tres vistas se da por buena.
- **Identificar vista**: elegir la vista correcta entre 4 opciones (los distractores son errores típicos).
- **Dibujar vistas**: trazar las vistas sobre la cuadrícula con línea continua o discontinua y corregir.

**Rayos X** (en la barra de cámara): hace translúcidas las caras y dibuja con línea discontinua las aristas que no se ven desde la posición actual de la cámara. Con «Orto» y «Frente», «Arriba» o «Izq.», la pieza en 3D se ve exactamente como la vista correspondiente.

## Compartir
Cada figura tiene un código de hasta 6 caracteres. El enlace guarda el modo y la figura (`#m=dibujar&f=CÓDIGO`); el profesor puede preparar una pieza en el editor y pasar el código o el enlace.

## Estructura
- `js/voxels.js`: modelo de la pieza y cálculo de aristas vistas y ocultas (sin dependencias).
- `js/scene3d.js`: escena 3D y edición.
- `js/views-svg.js`: dibujo de las vistas en SVG.
- `js/app.js`: interfaz y modos.
- `tests/voxels.test.js`: pruebas del cálculo de vistas (`node tests/voxels.test.js`).
- `staticwebapp.config.json`: cabeceras de seguridad y caché para Azure Static Web Apps.

## Despliegue

Se publica en Azure Static Web Apps (plan gratuito) desde el repositorio de infraestructura `azure`:

```bash
./infra/scripts/deploy-static.sh orthographic-views ~/workspace/orthographic-views
```

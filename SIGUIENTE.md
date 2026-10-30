# Instrucciones para la IA que continúe

Objetivo: que Gestión-Future (nómina Colombia multiempresa para outsourcing) quede **mejor que Buk, Siigo, Alegra y Factorial**. La comparación está en `MEJORAS.md` y el issue #11; el historial, en `BITACORA.md`.

## Reglas del dueño (obligatorias)

1. Terminar cada tarea completa antes de pasar a la siguiente; no volver sobre trabajos cerrados.
2. Probar en **un solo navegador: Firefox** (`npm run e2e`). No repetir en Chrome.
3. Bitácora corta: 2 o 3 líneas por tarea al final de `BITACORA.md`. **Nunca borrar ni vaciar `BITACORA.md`** ("vaciar la bitácora" significa resolver sus pendientes).
4. Un commit por tarea, con push a `feat/employee-leaves`. Commits y mensajes en español.
5. No gastar tiempo en revisiones largas: probar, subir, seguir.

## Cómo verificar cada cambio

```bash
npx tsc --noEmit
npx jest --runInBand --watchman=false --forceExit   # hoy: 26 suites, 258 pruebas
npm run e2e                                         # Firefox, hoy 25/25 pasos
```

## Pendientes, en este orden

1. [x] **`src/dashboard/components/requests.jsx`**: guarda de respuestas fuera de orden en `RequestsSection.load`, igual a `loadSeq` de `activity.jsx`.
2. **E2E con fechas relativas a hoy** (`tests/e2e/run.mjs`). Hoy las fechas están fijas en 2026, y los pasos del panel de empresas y de solicitudes fallan desde noviembre de 2026.
3. **SheetJS empaquetado** en el proyecto en vez de cargarlo desde cdnjs; la importación de Excel no debe depender de un CDN.
4. **Rama `wip/logos-accesibilidad`** (`4dcaec0`): logos fuera del listado de empresas (migración 0012), etiquetas de formulario accesibles (issue #15) y detalles de interfaz (issue #16). Revisar el diff archivo por archivo y no fusionarlo a ciegas: la rama es vieja.
5. **Rama `wip/dian-firma-envio`** (`53f61bd`): CUNE según el anexo técnico, firma XAdES y envío SOAP (issue #10). El envío real necesita el certificado digital del dueño (issue #17). Dejarlo probado con un certificado de prueba.

Al terminar cada uno, marcarlo como hecho en esta lista y en el issue correspondiente.

## Lo que sólo puede hacer el dueño

Está en el issue #17: pago de GitHub Actions (el CI queda en cola), Firebase de producción (#6), certificado digital y habilitación DIAN, y validación del contador (#9).

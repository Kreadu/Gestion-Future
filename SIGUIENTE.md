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
2. [x] **E2E con fechas relativas a hoy** (`tests/e2e/run.mjs`): calendario de Colombia, mes actual/siguiente y año actual sin fechas de 2026 fijas.
3. [x] **SheetJS empaquetado** en el proyecto en vez de cargarlo desde cdnjs; la importación de Excel no debe depender de un CDN.
4. [x] **Rama `wip/logos-accesibilidad`** (`4dcaec0`): portadas a la base actual las funciones de logos, etiquetas accesibles y ajustes de interfaz; no se fusionó la rama vieja completa.
5. **Rama `wip/dian-firma-envio`** (`53f61bd`): revisar y portar por partes sobre `main` (también es una rama WIP vieja; no fusionarla entera). Completar CUNE según anexo, firma XAdES y SOAP (issue #10). No se puede probar el envío DIAN sin certificado digital, Software ID/PIN y test set del dueño (issue #17); pedirlos sólo cuando la implementación local esté lista.

Al terminar cada uno, marcarlo como hecho en esta lista y en el issue correspondiente.

## Lo que sólo puede hacer el dueño

Está en el issue #17: pago de GitHub Actions (el CI queda en cola), Firebase de producción (#6), certificado digital y habilitación DIAN, y validación del contador (#9).

Estado para la siguiente IA (2026-10-30): #1–#4 implementados localmente/en PRs hasta el #3 fusionado; #4 está en el PR siguiente, pendiente de CI y merge. Issue #16: aviso PILA, pie móvil, toast y validación empresa/empleado corregidos; queda revisar el aviso de worker de Jest (no apareció en CI; local con --forceExit sólo mostró el aviso estándar de handles abiertos).


## Actualización CI PR #22 (2026-10-30)

- Primer CI: typecheck, nómina Python, Jest y descarga de Firefox pasaron; falló el último paso del E2E por `404 GET /api/pila-verifications?engagementId=...` (los otros 24 pasos pasaron).
- Corregido en el commit `ee23501`: añadido GET autenticado, valida rol, vinculación activa y acceso a empresa, y devuelve los periodos verificados.
- **No fusionar PR #22 hasta que el CI de este último commit quede verde.** Revisar el E2E completo y después seguir con DIAN, issue #10/#17.

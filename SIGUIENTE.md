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
npx jest --runInBand --watchman=false --forceExit   # hoy: 27 suites, 264 pruebas
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

GitHub Actions y despliegue ya funcionan (run 88). El dueño aún debe confirmar el acceso real con Firebase y revisar el dominio autorizado; facilitar certificado DIAN, Software ID/PIN y TestSetId para pruebas; coordinar con su contador la revisión del issue #9; y completar datos faltantes de empleados para PILA. Ver issue #17.

Estado al 30-oct-2026: tareas #1–#4 fusionadas y desplegadas en `main`; PR #22/run 88 pasó CI, incluida migración D1 0015 y Cloudflare Worker. Los commits de documentación también pasaron CI/deploy (run 90). Issue #15 cerrado. Issue #16 conserva únicamente la investigación del aviso local de Jest sobre handles abiertos; no aparece en CI.


## Resultado PR #22

El primer E2E remoto detectó `404 GET /api/pila-verifications`; se añadió la ruta GET protegida por rol, vinculación activa y acceso a empresa. La corrida final pasó 25/25 pasos. PR #22 se fusionó y la migración D1 y el despliegue de Cloudflare pasaron en run 88.


## Continuación prioritaria para la siguiente IA

1. Revisar `wip/dian-firma-envio` frente a `main` y portar sólo cambios vigentes (no fusionar la rama WIP completa).
2. Auditar CUNE conforme al anexo DIAN; completar firma XAdES y envío SOAP. No declarar integración real lista hasta obtener credenciales y probar en set de habilitación.
3. El dueño debe facilitar el certificado digital, Software ID/PIN y test set DIAN; no pegar secretos en issues ni commits.
4. Investigar el aviso local de worker Jest que issue #16 menciona. El issue queda abierto por ese único punto; CI del PR #22 sí pasó.
5. Confirmar con el dueño la prueba real de acceso Firebase para `raipimo36@gmail.com`: en la conversación previa se actualizó el correo en D1, pero no se confirmó un login exitoso.

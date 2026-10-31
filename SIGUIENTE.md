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
npx jest --runInBand --watchman=false              # hoy: 35 suites, 322 pruebas (ya sin --forceExit)
npm run e2e                                         # Firefox, hoy 29/29 pasos
```

## Pendientes, en este orden

1. [x] **`src/dashboard/components/requests.jsx`**: guarda de respuestas fuera de orden en `RequestsSection.load`, igual a `loadSeq` de `activity.jsx`.
2. [x] **E2E con fechas relativas a hoy** (`tests/e2e/run.mjs`): calendario de Colombia, mes actual/siguiente y año actual sin fechas de 2026 fijas.
3. [x] **SheetJS empaquetado** en el proyecto en vez de cargarlo desde cdnjs; la importación de Excel no debe depender de un CDN.
4. [x] **Rama `wip/logos-accesibilidad`** (`4dcaec0`): portadas a la base actual las funciones de logos, etiquetas accesibles y ajustes de interfaz; no se fusionó la rama vieja completa.
5. [x] **Rama `wip/dian-firma-envio`** (`53f61bd`): revisar y portar por partes sobre `main` (también es una rama WIP vieja; no fusionarla entera). Completar CUNE según anexo, firma XAdES y SOAP (issue #10). No se puede probar el envío DIAN sin certificado digital, Software ID/PIN y test set del dueño (issue #17); pedirlos sólo cuando la implementación local esté lista.
   Hecho el 30-oct: CUNE/SoftwareSC del anexo, firma XAdES-EPES, envío SOAP con WS-Security, consulta de estado y panel en el dashboard (nómina mensual y jornada parcial). Falta sólo la prueba real en habilitación con los datos del dueño.

Al terminar cada uno, marcarlo como hecho en esta lista y en el issue correspondiente.

## Estado al 30-oct-2026 (noche)

Todo está fusionado en `main` y desplegado (PR #23–#26; producción: https://gestion-future-api.raipimo37.workers.dev). Secreto `DIAN_CONFIG_KEY` creado en Cloudflare. Firebase confirmado. Pendientes del dueño: certificados y habilitación DIAN de cada empresa (botón "🏛️ DIAN"), revisión del contador (#9), datos PILA de empleados, cerrar issues #8, #13, #16 y #18 (ya resueltos; el sistema de permisos no dejó cerrarlos). Cuando cargue una habilitación: enviar el set de pruebas y corregir lo que rechace la DIAN.

## Por estudiar con el dueño (NO implementar todavía)

El dueño pidió estudiarlos antes; no programarlos hasta que él decida cómo deben funcionar:

1. [x] **Liquidación en lote**: decidido el 31-oct: se paga **por mes** (el cliente paga mensual). Hecho: botón "Liquidar el mes" en Clientes → Cobro; liquida a todos los trabajadores del cliente con planilla y lista a quien no la tiene para pedírsela al cliente. Una planilla no puede cruzar de un mes a otro.
2. [x] **XML DIAN con recargos y extras detallados**: hecho el 30-oct (HED, HEN, HRN, HEDDF, HRDDF, HENDF, HRNDF, incapacidades, licencias, vacaciones y retención). Confirmar en habilitación que la DIAN acepta los porcentajes con el dominical vigente (90 %).
3. **PILA por semanas** para quien gana menos de un SMMLV en el mes (Decreto 2616 de 2013): definir con el contador (issue #9).

## Lo que sólo puede hacer el dueño

Lista completa y al día en el issue #17 (actualizado el 31-oct-2026). En resumen:

1. **Nómina electrónica**: certificado digital (.p12 y contraseña) y registro como software propio (Software ID, PIN, TestSetId) de cada empresa empleadora; se cargan en Empresas → "🏛️ DIAN".
2. **Documento soporte** (contratistas): habilitación aparte (Software ID, PIN, TestSetId), resolución de numeración (número, vigencia, prefijo y rango) y responsabilidades fiscales del RUT; mismo botón, sección "Documento soporte".
3. **Contador** (issue #9): retención, dominicales, prestaciones con incapacidad, IBC de jornada parcial, honorarios, liquidación definitiva y la PILA por semanas.
4. **Datos para la PILA**: fecha de ingreso y códigos EPS/AFP/CCF de cada empleado, ARL de la empresa.

Cuando el dueño cargue una habilitación: enviar el set de pruebas desde el dashboard y corregir lo que la DIAN rechace.

## Resultado PR #22

El primer E2E remoto detectó `404 GET /api/pila-verifications`; se añadió la ruta GET protegida por rol, vinculación activa y acceso a empresa. La corrida final pasó 25/25 pasos. PR #22 se fusionó y la migración D1 y el despliegue de Cloudflare pasaron en run 88.


## Continuación prioritaria para la siguiente IA

0. Modelo de negocio (30-oct): (a) servicio de RRHH externo: cada empresa cliente se registra como empresa con sus empleados y es su propio empleador; (b) EST: trabajadores en misión a empresas usuarias; (c) servicios (aseo, meseros) con personal propio. En (b) y (c) el empleador es la empresa del dueño, se paga **por horas, mensual** (decidido el 31-oct), con horas por tipo desde la planilla del cliente, y se cobra al cliente por tarifa por hora o costo + % administración. Lo pendiente de este modelo está en "Por estudiar con el dueño".

1. Negocio: el dueño es una empresa de RRHH que pone personal en misión en otras empresas (él es el empleador) y además lleva la nómina de empresas clientes (cada una es su propio empleador). Cada empresa tiene su habilitación DIAN (botón "🏛️ DIAN"; secreto global sólo `DIAN_CONFIG_KEY`). Cuando el dueño cargue la de su empresa, generar y enviar el set de pruebas de habilitación desde el dashboard y corregir lo que la DIAN rechace (reglas NIE...). Puntos a confirmar con la DIAN: hash de la política de firma v2, nombre del emisor del certificado y `ClaimedRole`.
2. [x] Notas de ajuste de nómina (TipoXML 103, prefijo NA, 31-oct): reemplazar con la nómina corregida o eliminar, sobre lo que la DIAN ya aceptó (`routes/dianAdjustments.ts`). Confirmar en habilitación: CUNE de la eliminación (valores 0.00 y documento 0) y que el nombre del .zip (consecutivo del documento) no choque entre la serie NE y la NA.
3. [x] Documento soporte de contratistas independientes (31-oct): UBL 2.1 Invoice del anexo (CustomizationID 10, tipo 05, CUDS SHA-384), numeración autorizada y habilitación propias por empresa (Empresas → DIAN → "Documento soporte", migración 0022), firma y envío por las rutas de /api/hourly/settlements (SendTestSetAsync / SendBillSync). Confirmar en habilitación: TaxScheme y responsabilidades del adquiriente, unidad HUR, prefijo de archivo `ds`, ClaimedRole de la firma y dirección/municipio del contratista (hoy usa la ciudad del profesional y el código DANE de la empresa).
3. [x] Acceso Firebase con `raipimo36@gmail.com` confirmado por el dueño (30-oct).

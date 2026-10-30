# Bitácora de continuidad

Última actualización: 2026-10-29

Repositorio: `Kreadu/Gestion-Future`

Rama de trabajo: `feat/employee-leaves`

Este archivo resume el estado comprobable del repositorio para que una persona u otra IA pueda retomar el trabajo. Los pendientes inferidos de ramas WIP no se deben tratar como prioridades acordadas hasta revisar el issue correspondiente.

## Estado actual

- El portal del empleado, la importación Excel/CSV, su cobertura y el disparador de CI están en GitHub en `feat/employee-leaves`, hasta `e753b20` (confirmado el 2026-10-29).
- La importación se implementó en `dd69b6c` (`feat: importar empleados desde Excel`).
- La cobertura de importación se añadió en `de4e613` (`test: cubrir importación de empleados`).
- El commit `e753b20` habilita el workflow para `feat/employee-leaves`.
- La rama local y `origin/feat/employee-leaves` están sincronizadas; el árbol de trabajo estaba limpio antes de esta actualización de bitácora.

## Importación implementada localmente

- Botón **Importar desde Excel** en la sección de empleados y modal con vista previa.
- Lectura de `.xlsx` y `.xls` mediante SheetJS 0.18.5 cargado desde cdnjs; también acepta CSV separado por coma o punto y coma.
- Plantilla descargable con instrucciones y los campos generales del empleado y de PILA disponibles en el formulario actual.
- Valida filas en el navegador y otra vez en el servidor; muestra filas inválidas, permite importar las válidas y limita cada lote a 500 filas.
- Ruta nueva `POST /api/employees/import`, restringida a administradores de empresa y al ámbito de su empresa. Detecta documentos duplicados entre empleados activos, retirados y filas del mismo archivo, y registra la importación en auditoría.
- Los errores por fila no cancelan las demás filas válidas. La importación puede ser parcial.

## Verificación

- `npm run build:dashboard`: pasó.
- `npx tsc --noEmit`: pasó.
- `git diff --check`: pasó en los cambios actuales.
- `npx jest --runInBand --roots tests --watchman=false --forceExit`: 20 suites y 208 pruebas pasaron.
- `tests/employeeImport.test.ts`: 8 pruebas de importación pasaron; cubren validación, serial de Excel, duplicados, autorización y límite de filas.
- El fixture XLSX tiene ZIP/XML válidos y `node --check tests/e2e/run.mjs` pasó.
- El workflow YAML pasó validación sintáctica.
- Firefox está instalado para Playwright 1.56.1 y también hay `/usr/bin/firefox`.
- `npm run e2e` no llegó a abrir Firefox: el sandbox rechazó el `listen()` del servidor E2E con `EPERM` tanto en `0.0.0.0` como en `127.0.0.1`. No se observó un fallo de la aplicación; este entorno no permite el puerto local que necesita la suite.
- Se añadió a `tests/e2e/run.mjs` un caso que sube un XLSX, revisa la vista previa e importa una fila; todavía no se pudo ejecutar en Firefox en este sandbox.
- `.github/workflows/test.yml` corre Jest y Firefox en `pull_request` y en `push` a `main` y `feat/employee-leaves`.
- No se pudo leer el resultado de GitHub Actions desde esta sesión: la consulta de `gh run list` no pudo resolver `api.github.com`.

## Próximos pasos

1. **Revisar la ejecución de GitHub Actions** asociada al push de `e753b20`; el caso XLSX está añadido, pero no se ha confirmado su resultado en Firefox.
2. Si CI falla, revisar los logs y corregir el paso concreto. El sandbox local no permite abrir el puerto que requiere `npm run e2e`.
3. **Revisar el texto vigente de los issues #18 y #11** antes de declarar todo el encargo terminado. No se pudo consultar su contenido en esta sesión; la rama `wip/importar-excel` dice que el alcance completo está en el issue #18. Enlaces: <https://github.com/Kreadu/Gestion-Future/issues/18> y <https://github.com/Kreadu/Gestion-Future/issues/11>.
4. **Revisar, sin integrar a ciegas, los otros avances WIP locales** si los issues los confirman como trabajo pendiente:
   - `wip/dian-firma-envio` en `53f61bd`: avance parcial de canonicalización XML y dependencias para firma/envío DIAN; marcado como incompleto y sin probar.
   - `wip/logos-accesibilidad` en `4dcaec0`: avance parcial en logos/accesibilidad, con cambios de API, migración `0012_company_logos.sql` y pruebas; marcado como incompleto y sin probar.
5. **Actualizar README**: `README.md` todavía dice que el rol `EMPLOYEE` y el portal están pendientes (alrededor de la línea 89), lo cual contradice el portal que ya está en `6041e1d`.

## Revisión funcional y comparación de producto (2026-10-29)

### Alcance y evidencia

Se revisó la rama actual `feat/employee-leaves` en el commit `8e052cb`, su bitácora previa, README, pantallas del dashboard y las pruebas existentes. Se ejecutaron las comprobaciones locales disponibles:

- `npx tsc --noEmit` y `npm run build:dashboard`: pasaron.
- `npx jest --runInBand --roots tests --watchman=false --forceExit`: 20 suites, 208 pruebas pasaron.
- `python3 tests/test_colombia_payroll_and_dian.py`: 4 pruebas pasaron.
- `npm run e2e`: no alcanzó a iniciar Firefox. El servidor de prueba falló en `listen` con `EPERM` al enlazar `0.0.0.0:8859`, antes de abrir el navegador.
- Se intentó Chrome/Chromium con Playwright. La revisión encontró Chromium en caché, pero Playwright 1.56.1 esperaba otra revisión; al indicar el ejecutable disponible, Chromium terminó con `SIGTRAP` y un error de socket restringido (`setsockopt: Operation not permitted`). Por tanto tampoco hubo una sesión de interfaz en Chrome.
- `git diff --check`: pasó con la bitácora actualizada.

En esta sesión aislada la aplicación no pudo probarse interactivamente en Firefox ni Chrome por restricciones del entorno. Después se recibió una ejecución parcial de Firefox realizada en el equipo del usuario, documentada a continuación. No se verificó producción ni una base de datos real.

### Ejecución de Firefox en el equipo del usuario

Después de lo anterior, el usuario ejecutó `npm run e2e` en su equipo. Esta ejecución sí abrió Firefox y avanzó por el flujo visual:

- Pasaron 16 pasos: carga del dashboard, empresa/empleado/periodo, incapacidad y cálculo, desprendible, generación XML, archivo bancario, resumen, archivo PILA, cierre, personal por horas, prima, vacaciones y liquidación definitiva.
- Falló el paso `Certificados del retirado: ingresos y retenciones (220) y laboral`, en `page.getByLabel('Ver retirados').check()`, con `locator.check: Timeout 30000ms exceeded`.
- La captura está en `tests/e2e/e2e-fallo.png`. En ella el retiro sí quedó guardado; la lista muestra `0 activo(s)` y el texto “Ver retirados”, pero no se aprecia el checkbox. La regla CSS general en `src/dashboard.ts` aplica `width: 100%`, padding, borde y fondo a todos los `input`, incluidos los de tipo checkbox. Esto es una causa probable del control que no se puede accionar/visualizar correctamente; requiere corregir estilo y repetir el E2E para confirmarlo.
- Por el fallo temprano no se ejecutaron los pasos posteriores de portal del empleado e importación XLSX. No se deben considerar aprobados en Firefox.

### Hallazgos nuevos

1. **Transmisión a DIAN: acción que aparenta estar completa.** En `src/components/Dashboard.tsx`, el botón “Transmitir a DIAN (XML)” únicamente muestra un `alert()` con el texto “Documento Soporte preparado para transmisión a la DIAN”. No se evidencia una llamada de red en ese manejador. Hay que confirmar si esta pantalla/component está montada en el flujo entregado y, si sí, cambiar el texto/acción o implementar y probar el envío real antes de ofrecerlo como transmisión.
2. **README desactualizado.** En la sección Modelo de acceso todavía se lee que `EMPLOYEE` está “pendiente de implementar”, aunque el portal está implementado en esta rama. Actualizar la descripción y los pasos de acceso.
3. **Hay dos piezas de importación con distinto estado aparente.** El flujo de importación conectado desde `src/dashboard/app.jsx` y su endpoint son los cubiertos por la implementación descrita arriba. `src/components/BulkEmployeeImportExport.tsx` conserva un botón que sólo presenta un `alert()` (“Importar N empleados válidos”). Confirmar si el componente está en uso; si lo está, conectarlo a la API o retirarlo para evitar mostrar una importación que no se ejecuta.
4. **Prueba de aceptación del navegador sigue sin evidencia.** La cobertura E2E ya incluye importación desde XLSX y portal del empleado, pero no se pudo ejecutar ningún paso visual por las restricciones de este entorno. El Excel generado sí tiene comprobación estructural ZIP/XML anotada previamente; eso no confirma que SheetJS lo abra en Firefox/Chrome.

### Comparación funcional, limitada a documentación pública

La comparación es de funciones anunciadas por los proveedores y capacidades demostradas por el repositorio/pruebas; no se accedió a cuentas demo ni se midió usabilidad, precio, soporte o cumplimiento integral.

| Área | Gestión-Future (evidencia local) | Buk Colombia (documentación pública) | Siigo Nómina (documentación pública) | Oportunidad para Gestión-Future |
|---|---|---|---|---|
| Nómina Colombia | Motor de nómina, periodos, novedades y pruebas de cálculo; salida DIAN existe en el flujo de generación, pero el envío real no está confirmado por la interfaz revisada. | Anuncia nómina, liquidaciones y automatización del proceso de remuneraciones. | Anuncia liquidación de nómina y envío de documentos electrónicos. | Distinguir generación XML de transmisión/acuse DIAN y cubrir el ciclo completo con evidencia de sandbox/producción. |
| PILA / pagos | Genera archivo PILA y archivo bancario según pruebas E2E definidas; el recorrido visual no pudo ejecutarse aquí. | La página consultada promociona módulos de nómina y gestión de personas; no se usa aquí como afirmación de formato PILA concreto. | Documenta cálculo/aplanado para operador PILA y archivos planos bancarios. | Mantener pruebas con archivos de salida reales y operadores/formato objetivo; la bitácora no certifica aceptación externa. |
| Prestaciones y retiro | Hay funciones y pruebas para prima, vacaciones, cesantías/beneficios y liquidación, más certificaciones según módulos y pruebas del repositorio. | Documenta vacaciones en modalidades disfrutadas, compensadas y definitivas, además de liquidaciones. | Anuncia prima, cesantías, liquidación de contratos y libro de vacaciones. | Revisar cálculos y reportes con casos legales de borde y datos históricos antes de operación real. |
| Portal del empleado | Portal con ficha, desprendibles, certificados y acceso limitado a los datos del empleado; existe suite E2E, aún sin ejecución Firefox/Chrome en esta máquina. | El portal describe solicitudes/workflows (vacaciones, permisos, documentos), ficha, liquidaciones y app móvil. | La página de nómina menciona envío de desprendibles y certificado laboral; no se toma como portal integral. | Evaluar solicitudes/autoservicio (vacaciones, permisos, documentos), experiencia móvil y notificaciones; validar primero qué necesita la operación outsourcing. |
| Importación de datos | Importación XLS/XLSX/CSV y plantilla implementadas en el dashboard; servidor valida y limita lotes, pero falta verificación real de archivo en navegador. | No se compara aquí una función equivalente. | No se compara aquí una función equivalente. | Probar archivos reales y casos de codificación, fórmulas, encabezados, duplicados y reintentos en navegador y API. |
| Operación multiempresa de outsourcing | La arquitectura declara aislamiento por empresa y roles SUPER_ADMIN/TENANT_ADMIN/EMPLOYEE; las pruebas cubren autorización multi-tenant. | La información pública revisada describe una plataforma de RR. HH. general, no prueba un flujo de outsourcing de terceros. | La información pública revisada describe nómina/contabilidad, no prueba dicho flujo de outsourcing. | Diferenciar como posible ventaja: administración central de múltiples clientes, aislamiento, operación por lotes e informes consolidados, después de validarlos en escenarios completos. |

Fuentes de proveedor consultadas el 2026-10-29:

- Buk Colombia, [Portal Colaborador](https://supportcenter.buk.co/hc/es-419/articles/57149175935387-Portal-Colaborador) y [módulos de producto](https://www.buk.co/productos?section=atrae).
- Siigo, [planes y funciones de nómina](https://www.siigo.com/precios-siigo?cta=FunCobranzaVerPlanes) y [generación PILA](https://siigopyme.portaldeclientes.siigo.com/basedeconocimiento/generacion-de-pila-nomina-rrhh/).

### Comparación con la bitácora previa

- **Resueltos/confirmados ahora:** la rama local y `origin/feat/employee-leaves` apuntan a `8e052cb`; el árbol estaba limpio al iniciar la revisión. Typecheck, build, 208 pruebas Jest y 4 pruebas Python pasan.
- **Sigue pendiente:** completar el E2E en Firefox (la corrida del usuario pasó 16 pasos y falló en el checkbox “Ver retirados”; portal e importación no se ejecutaron); probar Chrome; confirmar estado de GitHub Actions de `e753b20`; revisar el contenido vigente de issues #18 y #11; decidir qué hacer con ramas `wip/dian-firma-envio` y `wip/logos-accesibilidad`; corregir el README.
- **Añadido por esta evaluación:** aclarar si la transmisión DIAN de `Dashboard.tsx` y la importación de `BulkEmployeeImportExport.tsx` son interfaces activas; la revisión estática encontró que esos manejadores son alertas, no acciones de servidor. Confirmar montaje antes de asignarles prioridad de usuario.
- **Mejora de producto sugerida por comparación:** evaluar autoservicio de solicitudes y experiencia móvil observados en el portal público de Buk. Esto es una oportunidad, no un compromiso aprobado ni un cambio iniciado.

### Orden sugerido para continuar

1. Ajustar/verificar estilo y activación del checkbox “Ver retirados”, repetir Firefox y ejecutar los escenarios restantes, especialmente certificados, portal e importación XLSX; luego probar Chrome.
2. Verificar/ajustar las dos acciones que parecen simuladas (transmisión DIAN e importación del componente alterno), después de confirmar que forman parte de la UI en uso.
3. Corregir la documentación del rol EMPLOYEE.
4. Revisar los issues y estado de CI, y sólo entonces decidir cuáles ramas WIP son pendientes vigentes.
5. Priorizar con el usuario mejoras comparativas de solicitudes/autoservicio y móvil.

## Notas para quien retome

- El archivo generado `src/dashboard/app.generated.ts` está ignorado por Git. `npm run build:dashboard` lo regenera a partir de `src/dashboard/app.jsx` y `src/dashboard/components/*.jsx`.
- Las ramas WIP se basan en revisiones anteriores. Algunos diffs completos eliminan módulos que sí existen en `feat/employee-leaves`; revisar commits/archivos puntuales y no fusionar esos diffs completos sin comprobarlos.
- La lectura `.xlsx/.xls` depende de que el navegador pueda cargar SheetJS desde cdnjs. Si el producto debe funcionar sin ese CDN, evaluar empaquetar la librería dentro de la aplicación.

## Continuación de revisión (2026-10-29)

- El usuario pidió abrir el programa en Firefox/Chrome. La causa del bloqueo local era un ciclo de rebuild: Wrangler vigila `src` y `scripts/build-dashboard.mjs` reescribía `src/dashboard/app.generated.ts` aunque su contenido no cambiara. El generador ahora compara el contenido antes de escribir. Wrangler quedó listo en `http://127.0.0.1:8787`.
- Se corrigió el CSS global de controles en `src/dashboard.ts`: los checkbox ya no reciben ancho y padding de campos de texto; tienen tamaño compacto, margen cero y color de acento.
- E2E Firefox repetido después de las correcciones: **20 pasos pasaron**, incluidos certificados del retirado, gestión de usuarios, portal del empleado, importación Excel y revisión de errores inesperados de consola/JavaScript/HTTP. Comando: `npm run e2e`.
- Un primer intento sin permisos falló antes del navegador porque el entorno bloqueó `listen` en `0.0.0.0:8801` (`EPERM`). La repetición autorizada pudo abrir el servidor y completar Firefox.
- No se ejecutó el E2E de Chrome ni el conjunto Jest/Python en esta continuación. La aplicación no se verificó en producción.

## Chrome y limpieza de acciones simuladas (2026-10-30)

- `tests/e2e/browser.mjs` acepta `E2E_BROWSER=chromium` (y `CHROMIUM_PATH` para un Chrome instalado). **E2E en Chromium 1228: 21/21 pasos pasaron.** El único fallo inicial era un falso positivo: Chromium escribe en consola "Failed to load resource: 400" para el 400 esperado del bloqueo Ley 1955; ese mensaje se ignora porque la respuesta ya se registra (con URL) en el manejador de `response`.
- E2E Firefox repetido: 21/21 pasos pasaron.
- Se eliminaron `src/components/Dashboard.tsx`, `BulkEmployeeImportExport.tsx` y `EmployeePortal.tsx`: ningún archivo los importaba (la UI real es `src/dashboard/app.jsx`). Eran los que mostraban `alert()` de "Transmitir a DIAN" e "Importar" sin hacer nada.
- README: rol `EMPLOYEE` descrito como portal implementado; comandos E2E de Firefox y Chrome.
- `jest.config.js` ignora `.claude/` (las copias en `.claude/worktrees` hacían fallar `npm test` con suites viejas).
- Verificación: `tsc --noEmit` OK; Jest 20 suites / 208 pruebas OK; Python 4 pruebas OK.

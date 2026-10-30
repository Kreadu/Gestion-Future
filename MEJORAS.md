# Mejoras propuestas para Gestión-Future

Actualizado: 2026-10-29  
Rama revisada: `feat/employee-leaves` (`4620a9e`)

Este documento guarda hallazgos y un orden sugerido para mejorar el producto. Es una revisión estática del código y documentación pública de competidores; no equivale a una auditoría legal, de seguridad ni a validar la aplicación en producción.

## Prioridad inmediata: evitar que la interfaz prometa acciones que no ocurren

- [x] (2026-10-30: componente sin uso, eliminado) Revisar `src/components/Dashboard.tsx`: el botón “Transmitir a DIAN (XML)” sólo presenta un `alert`; no se encontró envío de red en ese manejador. Confirmar si ese componente se usa en producción; conectar la acción a un flujo real con estados de envío, respuesta/rechazo y trazabilidad, o cambiar claramente el texto a “Generar/descargar XML”.
- [x] (2026-10-30: componente sin uso, eliminado) Revisar `src/components/BulkEmployeeImportExport.tsx`: su botón de importar sólo presenta un `alert`. Confirmar si el componente está montado; si sí, conectarlo al endpoint de importación o quitar esa acción simulada. El dashboard tiene un flujo de importación distinto que sí aparece conectado a API.
- [x] Corregir el `README.md`: indica que el rol `EMPLOYEE` y su portal están pendientes, aunque el repositorio contiene portal y rutas asociados.
- [x] Corregir el checkbox “Ver retirados” (el estilo general de campos lo expandía como un input de texto) y completar el E2E en Firefox: pasaron los 20 pasos, incluidos certificados, portal e importación Excel.

## Prioridad alta: operación de nómina confiable y trazable

- [ ] Documentar y completar el ciclo de nómina electrónica: configuración/habilitación, generación, firma/transmisión, consulta de estado, respuesta DIAN, rechazo, reintento y notas de ajuste. Mostrar claramente cuáles pasos están implementados y cuáles requieren intervención externa.
- [ ] Persistir una bitácora consultable por empresa de cálculos, cierres, documentos DIAN, archivos descargados y acciones de usuarios, con fecha, actor y resultado.
- [x] (2026-10-30, `close-review`) Añadir una vista de cierre que reúna pendientes/errores antes de cerrar el periodo: novedades sin validar, datos bancarios faltantes, afiliaciones PILA incompletas, documentos electrónicos no aceptados y totales de control.
- [ ] Asegurar que los periodos cerrados sean reproducibles: guardar versión de reglas/constantes usadas, valores de entrada y resultados; definir un flujo explícito de reapertura o ajuste.
- [ ] Ampliar reportes y exportaciones operativas (contabilidad, centros de costo, pagos, novedades y conciliación) según los formatos reales solicitados por los clientes y operadores.

## Prioridad media: flujos de RR. HH. y autoservicio

- [ ] Evaluar solicitudes de vacaciones, permisos e incapacidades desde el portal, con aprobación, saldo visible, estado y notificaciones.
- [ ] Mejorar acceso móvil y la descarga masiva de comprobantes/certificados; incluir filtros por empresa, periodo, estado y empleado.
- [ ] Añadir gestión documental por empleado: documentos requeridos, vencimientos, carga segura y seguimiento de firma.
- [ ] Valorar asistencia/turnos y novedades de horas extra conectadas al cálculo de nómina; hacerlo sólo si encaja con la oferta y operación de la empresa.
- [ ] Crear indicadores y reportes para la outsourcing: empresas y periodos pendientes, novedades, costos, ausentismo y estado de transmisión.

## Calidad de producto e ingeniería

- [x] Corregir el ciclo de rebuild de `wrangler dev` en `scripts/build-dashboard.mjs`: el archivo generado ahora sólo se escribe cuando cambia. Firefox quedó listo tras un rebuild inicial.
- [x] Ejecutar E2E en Firefox: 20 pasos pasaron, incluidos cierre, certificados, acceso de usuarios, portal, importación XLSX y ausencia de errores inesperados de consola/JavaScript/HTTP.
- [x] Repetir el recorrido E2E en Chrome: 21/21 pasos en Chromium 1228 (2026-10-30).
- [ ] Verificar en CI que los flujos de cierre, certificados, portal, importación XLSX/CSV y permisos multiempresa pasan en navegadores reales.
- [ ] Revisar dependencias de CDN en producción (la bitácora menciona SheetJS desde cdnjs); evaluar empaquetarlas para evitar que la importación dependa de un servicio externo durante el uso.
- [ ] Revisar navegación por teclado, foco visible, etiquetas y estilos de controles de formulario; el checkbox de retirados ya dio una señal concreta para esta revisión.
- [ ] Actualizar guía de configuración, recuperación de cuenta, roles y procedimiento de puesta en marcha; documentar de forma explícita las capacidades del portal.

## Comparación de mercado y brecha observada

La comparación se basa en páginas públicas de producto/soporte y evidencia del repositorio, no en demos privadas. No compara precios ni calidad de soporte.

| Capacidad | Evidencia en Gestión-Future | Referencia pública de mercado | Mejora recomendada |
|---|---|---|---|
| Nómina electrónica DIAN | Hay generación XML y lógica relacionada, pero la pantalla `Dashboard.tsx` revisada muestra un `alert` en la acción de transmitir; el estado real de integración necesita confirmación. | Siigo publica un flujo de crear, liquidar, contabilizar y pagar, transmisión y consulta de estados/rechazos. [Producto de nómina electrónica](https://www.siigo.com/nomina-electronica//), [informe de comprobantes electrónicos](https://ilimitada.portaldeclientes.siigo.com/generar-informe-nomina-electronica/). | Completar y evidenciar el ciclo de transmisión, acuses, errores y reintentos. |
| PILA, pagos y archivos | El repositorio incluye generador de archivo PILA y archivo bancario, con pruebas; no se validó aceptación por operadores externos en esta revisión. | Buk anuncia nómina, aportes/PILA y archivos de cierre. [Nómina Buk Colombia](https://info.buk.co/software-de-nomina). | Mantener fixtures de salida y validar periódicamente con los operadores/formato que usa la outsourcing. |
| Prestaciones y certificados | Hay módulos y pruebas para beneficios, vacaciones, liquidación y certificados. | Siigo documenta certificados laborales, certificados de ingresos y retenciones y reportes consolidados de prestaciones. [Certificados laborales](https://siigopyme2.portaldeclientes.siigo.com/generar-certificados-laborales-nomina-y-rrhh/), [consolidado de prestaciones](https://siigopyme.portaldeclientes.siigo.com/basedeconocimiento/consolidado-prestaciones-sociales-nomina-rrhh/). | Mejorar reportes por periodo/empresa y validar resultados con casos de nómina contabilizada y cierres históricos. |
| Autoservicio del empleado | Existe portal con acceso a información del empleado; la cobertura E2E quedó pendiente de completar según `BITACORA.md`. | Buk describe consulta de comprobantes y seguimiento/solicitud de vacaciones e incapacidades desde su portal. [Portal del colaborador](https://www.buk.co/hubfs/2025/buk-llego-a-tu-empresa/co/Nomina_CO.pdf). | Extender portal a solicitudes con aprobación, estado y notificaciones, después de completar la validación visual actual. |
| Administración multiempresa | El producto está diseñado para una outsourcing multi-tenant con roles por empresa. | Las páginas consultadas enfatizan suites de nómina/RR. HH.; no se halló evidencia suficiente para comparar sus flujos de outsourcing directamente. | Fortalecer como diferenciador la vista central de clientes, operación por lotes y seguimiento de cierres sin perder aislamiento entre empresas. |
| Integración de RR. HH. | Hay empleados, licencias/beneficios y portal; no se observó módulo de marcación/turnos conectado al cálculo. | Buk presenta asistencia, turnos, permisos, vacaciones, horas extras, firma y gestión documental como módulos integrados. [Módulos Buk](https://www.buk.co/productos?section=atrae). | Priorizar novedades y solicitudes que reduzcan recaptura manual; medir demanda antes de construir asistencia completa. |

## Comparación por proveedor

Comparación funcional basada en el repositorio de Gestión-Future y páginas públicas de producto/soporte consultadas el 2026-10-29. Las funciones de los proveedores son las que ellos publican; no se probaron sus demos. En particular, la página pública de Factorial consultada no basta para confirmar el alcance de su transmisión DIAN en Colombia.

| Producto | Enfoque y funciones publicadas | Frente a Gestión-Future |
|---|---|---|
| **Gestión-Future** | Nómina con reglas de Colombia; periodos, licencias/vacaciones, prestaciones y retiro; personal por horas y contratistas independientes; generación XML DIAN, archivo PILA y archivo bancario; importación de empleados; portal de empleado; roles y aislamiento multiempresa. El E2E Firefox de esta revisión cubrió los flujos principales. | Su encaje más distintivo es servir a una outsourcing que lleva nómina de varios clientes desde un solo sistema. Falta confirmar/terminar la transmisión DIAN real, la contabilidad integrada y los flujos operativos más amplios. |
| **Buk** | Suite de RR. HH. con nómina, asistencia, turnos, licencias, vacaciones, firma y gestión documental, onboarding y otros módulos; portal para consulta de liquidaciones, vacaciones y asistencia. [Módulos Buk](https://www.buk.co/productos?section=atrae), [portal del trabajador](https://supportcenter.buk.co/hc/es-419/articles/55257438654107-Portal-del-Trabajador-en-Buk). | Buk publica una cobertura mucho más amplia del ciclo de RR. HH. y autoservicio. Gestión-Future ya ofrece una nómina vertical y operación multiempresa orientada a outsourcing; debe reforzar solicitudes/aprobaciones, documentos y asistencia si son necesidades reales de clientes. |
| **Siigo Nómina** | Nómina electrónica dirigida a pymes: crear, liquidar, contabilizar y pagar; transmisión electrónica, reportes, importación Excel y funciones de PILA según plan. [Producto Siigo](https://www.siigo.com/nomina-electronica//), [guía de transmisión y gestión](https://siigonube.portaldeclientes.siigo.com/preguntas-frecuentes-habilitar-y-transmitir-en-nomina-pro-plus/). | Siigo publica más integración con contabilidad y un proceso explícito de transmisión/consulta. Gestión-Future debe mostrar estados y respuestas DIAN, notas de ajuste y opciones contables para acercarse a esa operación cerrada. |
| **Alegra Nómina** | Emisión DIAN, liquidación, contabilización, importación Excel, novedades, pagos mensuales/quincenales, prestaciones, PILA, colillas, certificados y reportes; la oferta combina capacidades según planes. [Producto Alegra](https://www.alegra.com/colombia/nomina-electronica/), [centro de ayuda](https://ayuda.alegra.com/col/alegra-n%C3%B3mina). | Alegra publica un ciclo más completo de liquidación, emisión y contabilización, con importación y reportes. Gestión-Future cuenta con importación y prestaciones, pero conviene cerrar la transmisión DIAN y ampliar reportes/contabilidad antes de competir por nóminas pyme generales. |
| **Factorial** | Plataforma amplia de RR. HH. que publica control horario, ausencias, horarios/turnos, documentos, gastos y automatización/preparación de nóminas. [Producto RR. HH.](https://factorialhr.co/software-recursos-humanos), [nóminas](https://factorialhr.co/nominas). | Factorial cubre más operaciones de personas que las que muestra Gestión-Future. La evidencia pública revisada no permite comparar con precisión su cumplimiento y transmisión DIAN colombiana; hay que validar en demo antes de considerarlo equivalente en nómina legal local. |

### Lectura práctica

- **Dónde está bien posicionado Gestión-Future:** reglas y casos de nómina colombiana, prestaciones/retiro, PILA y pagos, contratistas por horas, importación y servicio a varias empresas desde la operación de outsourcing.
- **Brechas más visibles frente a las páginas de producto revisadas:** transmisión DIAN con estados y notas de ajuste demostrables; integración contable; reportes de cierre y conciliación; solicitudes y aprobaciones del empleado; asistencia/turnos y gestión documental.
- **Prioridad sugerida:** primero completar y hacer transparente la cadena DIAN y la contabilidad/reportes del cierre; luego autoservicio de solicitudes y documentos. La asistencia completa y otras funciones de suite pueden esperar hasta confirmar demanda.
- No es una recomendación de compra ni una comparación de precios, facilidad de uso o calidad de soporte.

## Cómo continuar

Resolver primero los cuatro pendientes inmediatos y verificar los flujos en navegador. Después abordar transmisión DIAN y trazabilidad antes de sumar módulos de RR. HH. más amplios. La lista queda como propuesta: la comparación sugiere oportunidades, no confirma que todas sean necesarias para el negocio.

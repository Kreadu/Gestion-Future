/**
 * Términos de uso y Política de tratamiento de datos personales.
 *
 * Fuente única del texto legal: se sirve como página pública en
 * /legal (sin autenticación, para que cualquier titular pueda
 * consultarla, como exige la Ley 1581 de 2012) y el dashboard la
 * muestra al crear una empresa, donde su aceptación es obligatoria.
 *
 * Cada vez que cambie el contenido sustancial, sube LEGAL_VERSION:
 * la aceptación guardada en `companies.termsVersion` queda atada a
 * la versión que la empresa realmente aceptó.
 *
 * Este texto es una base razonable, no una asesoría jurídica:
 * debe revisarlo un abogado antes de usarlo frente a clientes.
 */

export const LEGAL_VERSION = '2026-10-28';

const CONTROLLER = {
  name: 'KREADU S.A.S.',
  domicile: 'Popayán, Cauca, Colombia',
  email: 'is@kreadu.com',
  phones: '(+57) 3235297951; (+57) 3225832662',
};

function section(title: string, body: string): string {
  return `<section><h2>${title}</h2>${body}</section>`;
}

const TERMS = [
  section(
    '1. Objeto y aceptación',
    `<p>Estos Términos regulan el uso de la plataforma Gestion-Future
    (la "Plataforma"), operada por ${CONTROLLER.name} ("Kreadu"), para
    la administración de nómina, seguridad social, novedades de
    personal, personal por horas y documentos electrónicos ante la
    DIAN de las empresas clientes (cada una, la "Empresa").</p>
    <p>Al crear una Empresa o usar la Plataforma, el usuario declara
    que tiene facultades para obligar a la Empresa y que acepta estos
    Términos y la Política de Tratamiento de Datos Personales. La
    aceptación por medios electrónicos tiene plena validez (Ley 527 de
    1999). Kreadu conserva registro de la fecha, el usuario y la
    versión aceptada.</p>`
  ),
  section(
    '2. Naturaleza del servicio: herramienta de apoyo',
    `<p>La Plataforma es una herramienta tecnológica que aplica reglas
    de cálculo sobre la información que suministra la Empresa. <strong>No
    constituye asesoría legal, laboral, contable ni tributaria</strong>,
    ni sustituye el criterio de un contador o abogado.</p>
    <p>Algunos cálculos usan simplificaciones advertidas en la propia
    Plataforma (por ejemplo, la depuración de la retención en la fuente
    no incluye deducciones por dependientes ni intereses de vivienda).
    La Empresa debe revisar y aprobar cada liquidación antes de pagarla,
    reportarla o transmitirla.</p>`
  ),
  section(
    '3. Responsabilidades de la Empresa',
    `<ul>
      <li>Suministrar información veraz, completa y actualizada
      (salarios, novedades, incapacidades, datos bancarios, clase de
      riesgo ARL, condición de exonerada del art. 114-1 ET, etc.).
      Los resultados dependen de esa información.</li>
      <li>Cumplir sus obligaciones como empleador: pago oportuno de
      salarios, prestaciones, aportes a seguridad social (PILA) y
      parafiscales, y presentación de la nómina electrónica ante la DIAN.
      Estas obligaciones son de la Empresa y no se trasladan a Kreadu
      por el uso de la Plataforma.</li>
      <li>Contar con la autorización previa, expresa e informada de sus
      trabajadores y contratistas para que sus datos sean tratados en la
      Plataforma, incluida la autorización explícita para datos sensibles
      (salud) cuando registre incapacidades o licencias.</li>
      <li>Custodiar las credenciales de acceso de sus usuarios y
      notificar de inmediato cualquier uso no autorizado.</li>
      <li>Verificar los archivos de pago bancario y los documentos DIAN
      generados antes de cargarlos en su banco o en la DIAN.</li>
    </ul>`
  ),
  section(
    '4. Usos prohibidos',
    `<p>No está permitido: usar la Plataforma con fines ilícitos o para
    simular relaciones laborales; cargar datos de personas sin su
    autorización; intentar acceder a información de otras empresas;
    vulnerar, probar o sobrecargar la seguridad de la Plataforma; o
    revender el acceso sin autorización escrita de Kreadu. Kreadu podrá
    suspender el acceso ante un uso indebido.</p>`
  ),
  section(
    '5. Limitación de responsabilidad',
    `<p>Kreadu presta el servicio con diligencia profesional y obligación
    de medios, no de resultado. En la máxima medida permitida por la ley
    colombiana, Kreadu no responde por: (a) errores derivados de
    información incompleta o inexacta suministrada por la Empresa;
    (b) sanciones, intereses o reclamaciones laborales originados en
    decisiones de la Empresa, en pagos o reportes que la Empresa no
    revisó, o en cambios normativos posteriores a la última
    actualización de la Plataforma; (c) interrupciones causadas por
    terceros proveedores (hosting, autenticación, bancos, DIAN, operadores
    PILA) o por fuerza mayor; (d) lucro cesante o daños indirectos.</p>
    <p>En todo caso, la responsabilidad total de Kreadu frente a la
    Empresa se limita al valor efectivamente pagado por el servicio en
    los tres (3) meses anteriores al hecho que la origine. Esta
    limitación no aplica en casos de dolo o culpa grave.</p>`
  ),
  section(
    '6. Disponibilidad, respaldo y cambios',
    `<p>Kreadu procurará la disponibilidad continua de la Plataforma, sin
    garantizar que esté libre de interrupciones. La Empresa debe conservar
    sus propios soportes de nómina (desprendibles, archivos de pago,
    documentos DIAN), que la Plataforma le permite descargar. Kreadu
    puede actualizar la Plataforma y estos Términos; los cambios
    sustanciales se informarán y se pedirá una nueva aceptación cuando
    corresponda.</p>`
  ),
  section(
    '7. Propiedad intelectual, imágenes y confidencialidad',
    `<p>El software, su diseño y su código son de Kreadu. Los datos que
    carga la Empresa son de la Empresa (y de sus titulares). Ambas partes
    mantendrán confidencial la información de la otra a la que accedan
    con ocasión del servicio.</p>
    <p>La Plataforma no usa fotografías ni imágenes de terceros: sus
    íconos son emojis del sistema operativo. El logo que cargue la Empresa
    es de su responsabilidad; al cargarlo declara que tiene derecho a
    usarlo.</p>`
  ),
  section(
    '8. Precios, pagos, cancelación y reembolsos',
    `<p>La Plataforma no procesa pagos ni guarda datos de tarjetas. El
    valor del servicio, su periodicidad y la forma de pago se pactan por
    escrito con cada Empresa antes de empezar; <strong>no hay cargos,
    comisiones ni renovaciones adicionales</strong> a lo pactado.</p>
    <p>La Empresa puede terminar el servicio en cualquier momento
    escribiendo a ${CONTROLLER.email}, sin penalidades distintas a las del
    acuerdo escrito. Si pagó por anticipado un periodo que no se prestará,
    Kreadu le reembolsará la parte proporcional no prestada dentro de los
    treinta (30) días siguientes. Los periodos ya prestados no son
    reembolsables. Antes de la terminación, la Empresa puede descargar su
    información.</p>`
  ),
  section(
    '9. Comunicaciones',
    `<p>La Plataforma no envía correos publicitarios. Kreadu sólo envía
    comunicaciones del servicio (soporte, cambios en estos documentos,
    incidentes). Si en el futuro envía boletines o publicidad, lo hará sólo
    con autorización previa y cada mensaje incluirá un enlace para darse de
    baja en un clic.</p>`
  ),
  section(
    '10. Ley aplicable',
    `<p>Estos Términos se rigen por la ley colombiana. Las controversias
    se intentarán resolver primero de forma directa; de no lograrse, serán
    competentes los jueces de la República de Colombia.</p>`
  ),
].join('');

const PRIVACY = [
  section(
    '1. Roles en el tratamiento',
    `<p><strong>Datos de los usuarios de la Plataforma</strong> (nombre,
    correo, rol, registros de acceso): el Responsable es ${CONTROLLER.name},
    con domicilio en ${CONTROLLER.domicile}, correo ${CONTROLLER.email},
    teléfonos ${CONTROLLER.phones}.</p>
    <p><strong>Datos de los trabajadores y contratistas de cada
    Empresa</strong>: el Responsable es la Empresa cliente, y Kreadu actúa
    como <strong>Encargado del tratamiento</strong>, por cuenta y según
    instrucciones de la Empresa (art. 3 Ley 1581 de 2012). La aceptación
    de esta Política al crear la Empresa constituye el contrato de
    transmisión de datos previsto en el art. 2.2.2.25.5.2 del Decreto
    1074 de 2015.</p>`
  ),
  section(
    '2. Datos tratados',
    `<ul>
      <li>Identificación y contacto: nombres, documento, dirección,
      ciudad, teléfono, WhatsApp, correo.</li>
      <li>Laborales y contractuales: cargo, tipo de contrato, fecha de
      ingreso, salario, tarifa por hora, horas, novedades, clase de
      riesgo ARL.</li>
      <li>Financieros: banco, tipo y número de cuenta, para el pago de
      nómina.</li>
      <li><strong>Sensibles (salud)</strong>: incapacidades y licencias
      (tipo, fechas, días). Su suministro es facultativo para el titular
      y sólo se tratan para liquidar la nómina y gestionar recobros ante
      EPS/ARL (art. 6 Ley 1581 de 2012).</li>
      <li>Técnicos: registros de auditoría de quién creó o modificó cada
      información y cuándo.</li>
    </ul>
    <p>La Plataforma no está diseñada para tratar datos de niños, niñas o
    adolescentes; si la Empresa vincula menores trabajadores autorizados,
    sólo se tratarán los datos estrictamente necesarios y respetando su
    interés superior.</p>`
  ),
  section(
    '3. Finalidades',
    `<ul>
      <li>Liquidar nómina, prestaciones, aportes, retenciones,
      incapacidades y licencias.</li>
      <li>Generar documentos de nómina electrónica y documento soporte
      para la DIAN, archivos de pago bancario y desprendibles.</li>
      <li>Gestionar el personal por horas y su vinculación con las
      Empresas.</li>
      <li>Autenticar usuarios, controlar accesos por empresa y mantener
      registros de auditoría.</li>
      <li>Cumplir obligaciones legales y atender requerimientos de
      autoridades competentes.</li>
    </ul>
    <p>Los datos no se venden ni se usan para publicidad.</p>`
  ),
  section(
    '4. Derechos de los titulares',
    `<p>Todo titular puede: conocer, actualizar y rectificar sus datos;
    solicitar prueba de la autorización; ser informado del uso dado a sus
    datos; revocar la autorización o pedir la supresión cuando no exista
    un deber legal o contractual de conservarlos; acceder gratuitamente a
    sus datos; y presentar quejas ante la Superintendencia de Industria y
    Comercio (art. 8 Ley 1581 de 2012).</p>`
  ),
  section(
    '5. Cómo ejercer los derechos',
    `<p>Los trabajadores y contratistas deben dirigirse primero a su
    empleador o contratante (la Empresa), que es el Responsable. También
    pueden escribir a ${CONTROLLER.email}; Kreadu dará traslado a la
    Empresa y la apoyará en la respuesta.</p>
    <p>Las <strong>consultas</strong> se atienden en máximo diez (10) días
    hábiles, prorrogables cinco (5) más. Los <strong>reclamos</strong>
    (corrección, actualización, supresión o incumplimiento) se atienden en
    máximo quince (15) días hábiles, prorrogables ocho (8) más (arts. 14 y
    15 Ley 1581 de 2012). La solicitud debe incluir la identificación del
    titular, la descripción de lo pedido, la dirección de respuesta y los
    documentos que quiera hacer valer.</p>`
  ),
  section(
    '6. Seguridad, proveedores y ubicación de los datos',
    `<p>Kreadu aplica medidas razonables de seguridad: acceso sólo con
    cuenta autenticada, aislamiento de la información de cada Empresa,
    roles y permisos, conexiones cifradas (HTTPS) y registro de
    auditoría.</p>
    <p>La Plataforma usa proveedores de infraestructura en la nube
    (Cloudflare para el alojamiento y la base de datos, Google Firebase
    para la autenticación), cuyos servidores pueden estar fuera de
    Colombia. Esa transmisión internacional se hace con proveedores que
    ofrecen estándares de protección adecuados y sólo para prestar el
    servicio. Al aceptar esta Política, la Empresa la autoriza y declara
    contar con la autorización de sus titulares para ello.</p>
    <p>Servicios de terceros que carga la Plataforma, y para qué:</p>
    <ul>
      <li><strong>Cloudflare</strong> (EE. UU.): alojamiento y base de datos.</li>
      <li><strong>Google Firebase Authentication</strong> (EE. UU.): inicio
      de sesión con Google; recibe el correo y el identificador de la
      cuenta.</li>
      <li><strong>unpkg.com</strong>: entrega las librerías React y Babel en
      versiones fijas; como cualquier servidor web, ve la dirección IP del
      navegador, pero no recibe datos de la nómina.</li>
    </ul>
    <p>No se usan herramientas de analítica, publicidad, píxeles de
    seguimiento ni redes sociales.</p>
    <p>Ante un incidente de seguridad que afecte datos personales, Kreadu
    informará a la Empresa sin demora injustificada para que, como
    Responsable, lo reporte a la Superintendencia de Industria y
    Comercio.</p>`
  ),
  section(
    '7. Cookies y almacenamiento local',
    `<p id="cookies">La Plataforma no usa cookies de analítica, publicidad
    ni seguimiento. Sólo usa almacenamiento técnico estrictamente necesario
    en el navegador: la sesión de Google Firebase (IndexedDB/localStorage),
    para no pedirte iniciar sesión en cada visita, y una marca que recuerda
    que ya cerraste el aviso de almacenamiento. Sin ese almacenamiento la
    Plataforma no puede funcionar. Puedes borrarlo en cualquier momento
    desde la configuración de tu navegador o cerrando sesión.</p>`
  ),
  section(
    '8. Datos mínimos',
    `<p>Sólo son obligatorios los datos que exigen la liquidación, la
    nómina electrónica o el pago: nombres, documento, salario, tipo de
    contrato y, para pagar, la cuenta bancaria. Dirección, teléfono y
    WhatsApp son opcionales y la Empresa no debe cargarlos si no los
    necesita.</p>`
  ),
  section(
    '9. Conservación, acceso y eliminación',
    `<p>Para pedir acceso, corrección o eliminación de tus datos escribe a
    <a href="mailto:${CONTROLLER.email}?subject=Solicitud%20de%20datos%20personales">${CONTROLLER.email}</a>
    con el asunto "Solicitud de datos personales".</p>
    <p>Los datos se conservan mientras la Empresa mantenga el servicio y,
    después, durante los plazos que exigen las normas laborales,
    tributarias y contables para los soportes de nómina. Al terminar el
    servicio, la Empresa puede solicitar la exportación de su información;
    vencidos los plazos legales, los datos se suprimen o anonimizan.</p>`
  ),
  section(
    '10. Obligaciones de la Empresa como Responsable',
    `<p>La Empresa declara y garantiza que: (a) obtuvo la autorización
    previa, expresa e informada de sus trabajadores y contratistas,
    incluida la autorización explícita para datos de salud; (b) les
    informó que sus datos serán tratados por un Encargado; (c) sólo
    cargará datos pertinentes y necesarios para las finalidades
    descritas; y (d) mantendrá indemne a Kreadu frente a reclamaciones
    derivadas del incumplimiento de estas obligaciones.</p>`
  ),
  section(
    '11. Vigencia',
    `<p>Esta Política rige desde el ${LEGAL_VERSION} (versión
    ${LEGAL_VERSION}). Los cambios sustanciales se comunicarán a las
    Empresas antes de aplicarse.</p>`
  ),
].join('');

export function getLegalHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Términos y Política de Datos | Gestion-Future</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    line-height: 1.6;
    background: #07111f;
    color: #dbe5f1;
  }
  main { max-width: 820px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 26px; margin: 0 0 6px; }
  h2 { font-size: 16px; margin: 26px 0 6px; color: #93c5fd; }
  .doc-title { font-size: 21px; margin-top: 40px; padding-top: 18px; border-top: 1px solid #1d3047; }
  .meta { color: #8193aa; font-size: 13px; }
  a { color: #93c5fd; }
  ul { padding-left: 20px; }
  nav a { margin-right: 14px; }
</style>
</head>
<body>
<main>
  <h1>Términos de uso y Política de tratamiento de datos personales</h1>
  <p class="meta">${CONTROLLER.name} · Versión ${LEGAL_VERSION} ·
  Contacto: ${CONTROLLER.email}</p>
  <nav><a href="#terminos">Términos de uso</a><a href="#datos">Política de datos</a></nav>

  <h1 class="doc-title" id="terminos">Términos y condiciones de uso</h1>
  ${TERMS}

  <h1 class="doc-title" id="datos">Política de tratamiento de datos personales</h1>
  <p class="meta">Ley 1581 de 2012 y Decreto 1074 de 2015 (Capítulo 25).</p>
  ${PRIVACY}
</main>
</body>
</html>`;
}

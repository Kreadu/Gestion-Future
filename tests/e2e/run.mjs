/**
 * Prueba end-to-end del dashboard en Firefox o Chromium (Playwright).
 *
 * Levanta tests/e2e/server.mjs en un puerto libre (base nueva en
 * memoria), recorre los flujos principales como lo haría una persona
 * y falla si algún paso no muestra lo esperado o si hubo errores de
 * consola/JavaScript o respuestas HTTP inesperadas.
 *
 * Uso: npm run e2e        (HEADED=1 para ver el navegador)
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDashboard, fill } from './browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const port = 8800 + Math.floor(Math.random() * 100);
const baseUrl = `http://localhost:${port}`;

function formatDate(date) {
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-');
}

function colombiaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftMonth(date, amount) {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + amount, 1));
}

function monthEnd(date) {
  const [year, month] = date.split('-').map(Number);
  return formatDate(new Date(Date.UTC(year, month, 0)));
}

function shiftDays(date, amount) {
  const [year, month, day] = date.split('-').map(Number);
  return formatDate(new Date(Date.UTC(year, month - 1, day + amount)));
}

const today = colombiaToday();
const [testYear, testMonth] = today.split('-');
const currentPeriodStart = `${testYear}-${testMonth}-01`;
const currentPeriodEnd = monthEnd(currentPeriodStart);
const nextPeriodStart = formatDate(shiftMonth(today, 1));
const nextPeriodEnd = monthEnd(nextPeriodStart);
const illnessStart = `${testYear}-${testMonth}-10`;
const illnessEnd = `${testYear}-${testMonth}-14`;
const vacationStart = nextPeriodStart;
const vacationEnd = shiftDays(vacationStart, 17);
const hireDate = `${Number(testYear) - 1}-01-01`;

const server = spawn(process.execPath, [join(here, 'server.mjs'), String(port)], {
  stdio: ['ignore', 'pipe', 'inherit'],
});

await new Promise((resolve, reject) => {
  server.stdout.on('data', d => { if (String(d).includes('E2E listo')) resolve(); });
  server.on('exit', code => reject(new Error('El servidor E2E terminó con código ' + code)));
});

const results = [];
let browser;
let page;

async function step(name, fn) {
  try {
    await fn();
    results.push(['✓', name]);
  } catch (error) {
    results.push(['✗', name, error.message.split('\n')[0]]);
    throw error;
  }
}

async function expectText(page, text) {
  await page.getByText(text).first().waitFor({ timeout: 10000 });
}

function modal(page) {
  return page.locator('.modal').last();
}

// Errores HTTP que el propio escenario provoca a propósito.
const expectedHttp = [/hourly\/settlements\/calculate .*Ley 1955/];

try {
  const opened = await openDashboard({ baseUrl, headless: !process.env.HEADED });
  browser = opened.browser;
  page = opened.page;
  const { problems } = opened;
  page.on('dialog', d => d.accept());

  await step('El dashboard carga en menos de 15 s', async () => {
    await page.getByText('Entendido').waitFor({ timeout: 15000 });
    await page.getByText('Entendido').click();
  });

  await step('Crear empresa (con aceptación de términos)', async () => {
    await page.getByRole('button', { name: /Crear Empresa/ }).click();
    const m = modal(page);
    await m.locator('input[type=checkbox]').first().check();
    await fill(m, 'Razón social', 'Panadería La Espiga S.A.S.');
    await fill(m, 'NIT', '900123456');
    await fill(m, 'Dígito verificación', '1');
    await m.getByRole('button', { name: 'Guardar empresa' }).click();
    await expectText(page, 'Empresa creada correctamente.');
  });

  await step('Crear empleado', async () => {
    await page.getByRole('button', { name: '+ Empleado' }).click();
    const m = modal(page);
    await fill(m, 'Primer nombre', 'Ana');
    await fill(m, 'Primer apellido', 'Gómez');
    await fill(m, 'Documento', '1012345678');
    await fill(m, 'Cargo', 'Panadera');
    await fill(m, 'Salario mensual', '2000000');
    await fill(m, 'Fecha ingreso', hireDate);
    await fill(m, 'Banco', 'Bancolombia');
    await fill(m, 'Número de cuenta', '12345678901');
    await fill(m, 'Código fondo de pensiones', '230301');
    await m.getByRole('button', { name: 'Guardar empleado' }).click();
    await expectText(page, /Ana.*Gómez/);
  });

  await step('Crear periodo de nómina', async () => {
    await page.getByRole('button', { name: '+ Nuevo periodo' }).click();
    const m = modal(page);
    await fill(m, 'Periodo desde', currentPeriodStart);
    await fill(m, 'Periodo hasta', currentPeriodEnd);
    await m.getByRole('button', { name: 'Crear periodo' }).click();
    await page.getByRole('button', { name: /Cerrar periodo/ }).waitFor();
  });

  await step('Registrar incapacidad y ajustar días trabajados', async () => {
    await page.getByText(/Ana.*Gómez/).first().click();
    await page.getByRole('button', { name: /Registrar incapacidad/ }).click();
    const m = modal(page);
    await fill(m, 'Tipo', 'GENERAL_INCAPACITY');
    await fill(m, 'Fecha inicio', illnessStart);
    await fill(m, 'Fecha fin', illnessEnd);
    await m.getByRole('button', { name: 'Registrar' }).click();
    await expectText(page, 'Se detectó 1 incapacidad/licencia');
  });

  await step('Calcular nómina (incapacidad al piso de 1 SMMLV/día)', async () => {
    await page.getByRole('button', { name: /Calcular nómina/ }).click();
    await expectText(page, 'Nómina calculada correctamente.');
    await expectText(page, 'son recobrables');
  });

  await step('Ver hoja de nómina', async () => {
    await page.getByRole('button', { name: /Ver hoja de nómina/ }).click();
    await expectText(page, 'Nómina Individual');
    await page.getByRole('button', { name: /^\W*Cerrar$/ }).first().click();
  });

  await step('Habilitación DIAN de la empresa (certificado de prueba)', async () => {
    const cert = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'dian-test-cert.json'), 'utf8'));
    await page.getByRole('button', { name: 'Habilitación DIAN de la empresa' }).click();
    const m = modal(page);
    await expectText(m, 'Sin configurar');
    await m.locator('#dian-software-id').fill('software-e2e');
    await m.locator('#dian-pin').fill('13579');
    await m.locator('#dian-test-set').fill('set-e2e');
    await m.getByLabel('Certificado digital (.p12 / .pfx)').setInputFiles({
      name: 'certificado.p12', mimeType: 'application/x-pkcs12', buffer: Buffer.from(cert.p12Base64, 'base64'),
    });
    await m.getByLabel('Contraseña del certificado').fill(cert.password);
    await m.getByRole('button', { name: 'Guardar habilitación' }).click();
    await expectText(m, 'Habilitación DIAN guardada.');
    await expectText(m, 'Empresa de prueba');

    // Documento soporte de los contratistas: su propio software y numeración.
    const ds = {
      softwareId: 'software-ds-e2e', pin: '24680', testSetId: 'set-ds-e2e', resolutionNumber: '18764000001',
      resolutionStartDate: `${testYear}-01-01`, resolutionEndDate: `${Number(testYear) + 1}-12-31`,
      prefix: 'DSE', rangeFrom: '1', rangeTo: '5000',
    };
    for (const [field, value] of Object.entries(ds)) await m.locator('#ds-' + field).fill(value);
    await m.getByRole('button', { name: 'Guardar documento soporte' }).click();
    await expectText(m, 'Habilitación de documento soporte guardada.');
    await m.getByRole('button', { name: 'Cerrar' }).last().click();
  });

  await step('Generar XML DIAN', async () => {
    await page.getByRole('button', { name: /Generar XML DIAN/ }).click();
    await expectText(page, 'XML de nómina generado.');
  });

  await step('Firmar y enviar a la DIAN (habilitación simulada)', async () => {
    await page.getByRole('button', { name: /Firmar y enviar a la DIAN/ }).click();
    await expectText(page, 'En proceso en la DIAN');
    await page.getByRole('button', { name: /Consultar estado/ }).click();
    await expectText(page, 'Aceptado por la DIAN');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /XML firmado/ }).click();
    const name = (await download).suggestedFilename();
    if (!name.endsWith('-firmada.xml')) throw new Error('Descarga inesperada: ' + name);
  });

  await step('Nota de ajuste: reemplazar la nómina aceptada por la DIAN', async () => {
    await page.getByRole('button', { name: /Corregir \(reemplazar\)/ }).click();
    // Llega con los valores liquidados; sin cambiarlos, el resto del recorrido no varía.
    if (await page.locator('#adj-daysWorked').inputValue() === '') throw new Error('Sin días precargados');
    await page.locator('#adj-reason').fill('Corrección de prueba');
    await page.getByRole('button', { name: 'Preparar nota de ajuste' }).click();
    await expectText(page, 'Nota de ajuste NA00000001 lista');
    await page.getByRole('button', { name: /📤 Enviar$/ }).click();
    await expectText(page, 'NA00000001: ⏳ En proceso en la DIAN');
    await page.getByRole('button', { name: /🔄 Consultar$/ }).click();
    await expectText(page, 'NA00000001: ✅ Aceptado por la DIAN');
  });

  await step('Descargar archivo bancario', async () => {
    await page.getByRole('button', { name: /Archivo bancario del periodo/ }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Descargar CSV/ }).click();
    const name = (await download).suggestedFilename();
    if (!name.endsWith('.csv')) throw new Error('Descarga inesperada: ' + name);
  });

  await step('Resumen del periodo', async () => {
    await page.getByRole('button', { name: /Resumen del periodo/ }).click();
    await expectText(page, 'TOTAL (1)');
    await page.keyboard.press('Escape');
  });

  await step('Archivo PILA: avisos de datos faltantes y descarga', async () => {
    await page.getByRole('button', { name: /Archivo PILA/ }).click();
    const m = modal(page);
    await expectText(m, 'Total a pagar');
    await expectText(m, 'falta el código de la EPS');
    const download = page.waitForEvent('download');
    await m.getByRole('button', { name: /Descargar archivo PILA/ }).click();
    const name = (await download).suggestedFilename();
    if (name !== `PILA_900123456_${testYear}-${testMonth}.txt`) throw new Error('Descarga inesperada: ' + name);
    await page.keyboard.press('Escape');
  });

  await step('Comprobante contable: cuadrado y descarga', async () => {
    await page.getByRole('button', { name: /Comprobante contable/ }).click();
    const m = page.getByRole('dialog', { name: 'Comprobante contable' });
    await m.getByText('✅ Cuadrado').waitFor();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      m.getByRole('button', { name: /Descargar comprobante/ }).click(),
    ]);
    const name = download.suggestedFilename();
    if (name !== `COMPROBANTE_NOMINA_900123456_${currentPeriodStart}_${currentPeriodEnd}.csv`) throw new Error('Descarga inesperada: ' + name);
    await page.keyboard.press('Escape');
  });

  await step('Revisión antes de cerrar y cerrar periodo', async () => {
    await page.getByRole('button', { name: /Cerrar periodo/ }).click();
    const m = page.getByRole('dialog', { name: 'Revisión antes de cerrar' });
    await m.getByText('Neto a pagar').waitFor();
    await m.getByText(/falta código de .*para la PILA/).waitFor();
    await m.getByRole('button', { name: 'Cerrar de todos modos' }).click();
    await expectText(page, 'cerrado correctamente.');
  });

  await step('Personal por horas: profesional y vinculación', async () => {
    await page.getByRole('button', { name: /Personal por horas/ }).click();
    await page.getByRole('button', { name: '+ Nuevo profesional' }).click();
    let m = modal(page);
    await fill(m, 'Primer nombre', 'Carlos');
    await fill(m, 'Primer apellido', 'Ruiz');
    await fill(m, 'Documento', '79876543');
    await fill(m, 'Profesión', 'Contador');
    await fill(m, 'Tarifa por hora (por defecto, opcional)', '80000');
    await m.getByRole('button', { name: 'Guardar y vincular' }).click();
    m = modal(page);
    await fill(m, 'Modalidad', 'INDEPENDENT_SERVICES');
    await fill(m, 'Fecha inicio', currentPeriodStart);
    await fill(m, 'Objeto / entregable del contrato', 'Asesoría contable mensual');
    await m.getByRole('button', { name: 'Crear vinculación' }).click();
    await page.locator('.modal').waitFor({ state: 'detached' });
    await page.getByText(/Carlos.*Ruiz/).first().click();
    await page.getByRole('button', { name: /Registrar horas/ }).waitFor();
  });

  await step('Personal por horas: horas, bloqueo sin PILA, PILA y liquidación', async () => {
    await page.getByRole('button', { name: /Registrar horas/ }).click();
    let m = modal(page);
    await fill(m, 'Periodo desde', currentPeriodStart);
    await fill(m, 'Periodo hasta', currentPeriodEnd);
    await fill(m, 'Horas trabajadas', '20');
    await m.getByRole('button').last().click();
    await expectText(page, 'Horas registradas correctamente.');

    await page.getByRole('button', { name: /Liquidar periodo/ }).click();
    m = modal(page);
    await fill(m, 'Periodo desde', currentPeriodStart);
    await fill(m, 'Periodo hasta', currentPeriodEnd);
    await m.getByRole('button', { name: 'Calcular liquidación' }).click();
    await expectText(page, /Debes verificar el pago de seguridad social/);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /Verificar PILA/ }).click();
    m = modal(page);
    await fill(m, 'Periodo (AAAA-MM)', `${testYear}-${testMonth}`);
    await fill(m, 'IBC declarado por el contratista', '1750905');
    await m.getByRole('button', { name: 'Registrar verificación' }).click();
    await expectText(page, 'Verificación de PILA registrada.');

    await page.getByRole('button', { name: /Liquidar periodo/ }).click();
    m = modal(page);
    await fill(m, 'Periodo desde', currentPeriodStart);
    await fill(m, 'Periodo hasta', currentPeriodEnd);
    await m.getByRole('button', { name: 'Calcular liquidación' }).click();
    await expectText(page, 'Liquidación calculada correctamente.');
    await expectText(page, '$ 1.504.000');

    // Documento soporte del contratista, firmado y enviado (DIAN simulada).
    await page.getByRole('button', { name: /Firmar y enviar a la DIAN/ }).click();
    await expectText(page, 'En proceso en la DIAN');
    await page.getByRole('button', { name: /Consultar estado/ }).click();
    await expectText(page, 'Aceptado por la DIAN');
  });

  await step('Temporales y servicios: cliente, camarero por horas, liquidación del mes y cobro', async () => {
    const weekEnd = shiftDays(currentPeriodStart, 6);
    await page.getByRole('button', { name: /Clientes/ }).click();
    let m = modal(page);
    await m.getByRole('button', { name: '+ Nuevo cliente' }).click();
    await fill(m, 'Nombre del cliente', 'Hotel Andino');
    await fill(m, 'Forma de cobro', 'HOURLY_RATE');
    await fill(m, 'Clase de riesgo ARL del sitio', '2');
    await m.getByRole('button', { name: 'Guardar cliente' }).click();
    await expectText(m, 'Cliente creado.');
    await m.getByRole('button', { name: 'Cerrar' }).click();

    await page.getByRole('button', { name: '+ Nuevo profesional' }).click();
    m = modal(page);
    await fill(m, 'Primer nombre', 'Iván');
    await fill(m, 'Primer apellido', 'Lara');
    await fill(m, 'Documento', '1061000777');
    await fill(m, 'Profesión', 'Camarero');
    await m.getByRole('button', { name: 'Guardar y vincular' }).click();
    m = modal(page);
    await fill(m, 'Modalidad', 'PART_TIME_EMPLOYEE');
    await m.getByLabel('Cliente donde trabajará').selectOption({ label: 'Hotel Andino · ARL clase 2' });
    await fill(m, 'Cargo', 'Camarero');
    await fill(m, 'Tarifa de cobro por hora al cliente', '20000');
    await fill(m, 'Tarifa por hora', '12000');
    await fill(m, 'Fecha inicio', currentPeriodStart);
    await fill(m, 'Horas semanales (máx. 42)', '42');
    await m.getByRole('button', { name: 'Crear vinculación' }).click();
    await page.locator('.modal').waitFor({ state: 'detached' });
    await page.getByText(/Iván.*Lara/).first().click();

    await page.getByRole('button', { name: /Registrar horas/ }).click();
    m = modal(page);
    await fill(m, 'Periodo desde', currentPeriodStart);
    await fill(m, 'Periodo hasta', weekEnd);
    await fill(m, 'Ordinarias diurnas', '30');
    await fill(m, 'Ordinarias nocturnas (+35%)', '4');
    await fill(m, 'Dominical/festiva diurna (+90%)', '6');
    await m.getByRole('button').last().click();
    await expectText(page, 'Horas registradas correctamente.');

    // El personal del cliente se liquida por mes, todos en un paso.
    await page.getByRole('button', { name: /Clientes/ }).click();
    m = modal(page);
    await m.getByRole('button', { name: /Cobro/ }).first().click();
    await fill(m, 'Mes', `${testYear}-${testMonth}`);
    await m.getByRole('button', { name: 'Liquidar el mes' }).click();
    await expectText(m, 'Liquidados: 1');
    // 20.000 × (30 + 4 × 1,35 + 6 × 1,90) = 936.000
    await expectText(m, '$ 936.000');
    const download = page.waitForEvent('download');
    await m.getByRole('button', { name: /Descargar CSV/ }).click();
    if (!(await download).suggestedFilename().startsWith('cobro-Hotel-Andino')) throw new Error('Descarga inesperada');
    await m.getByRole('button', { name: 'Cerrar' }).click();
  });

  await step('Prestaciones: calcular y registrar la prima del semestre', async () => {
    await page.getByRole('button', { name: /Prestaciones/ }).click();
    await page.locator('#benefit-year').fill(testYear);
    await page.locator('#benefit-semester').selectOption('2');
    await page.getByRole('button', { name: /Calcular/ }).first().click();
    await expectText(page, `${testYear}-07-01 a ${testYear}-12-31`);
    await page.getByRole('button', { name: /Registrar pago/ }).click();
    await expectText(page, 'Pago registrado para 1 empleado(s).');
  });

  await step('Vacaciones y liquidación definitiva', async () => {
    await page.getByRole('button', { name: /Nómina mensual/ }).click();
    await page.getByRole('button', { name: '+ Nuevo periodo' }).click();
    let m = modal(page);
    await fill(m, 'Periodo desde', nextPeriodStart);
    await fill(m, 'Periodo hasta', nextPeriodEnd);
    await m.getByRole('button', { name: 'Crear periodo' }).click();
    await page.getByText(/Ana.*Gómez/).first().click();
    await expectText(page, /días hábiles pendientes/);
    await page.getByRole('button', { name: /Registrar incapacidad, licencia o vacaciones/ }).click();
    m = modal(page);
    await fill(m, 'Tipo', 'VACATION');
    await fill(m, 'Fecha inicio', vacationStart);
    await fill(m, 'Fecha fin', vacationEnd);
    await m.getByRole('button', { name: 'Registrar' }).click();
    await expectText(page, /Vacaciones disfrutadas — 18 días/);

    await page.getByRole('button', { name: /Retiro y liquidación definitiva/ }).click();
    await page.locator('#term-date').fill(nextPeriodEnd);
    await page.locator('#term-reason').selectOption('DESPIDO_SIN_JUSTA_CAUSA');
    await page.getByRole('button', { name: /Calcular liquidación/ }).click();
    await expectText(page, 'Indemnización por despido sin justa causa (art. 64 CST)');
    await page.getByRole('button', { name: 'Retirar y guardar' }).click();
    await expectText(page, 'Empleado retirado.');
  });

  await step('Certificados del retirado: ingresos y retenciones (220) y laboral', async () => {
    await page.getByLabel('Ver retirados').check();
    await expectText(page, 'Retirado el ' + nextPeriodEnd);
    await page.getByRole('button', { name: /Certificados/ }).click();
    const m = modal(page);
    await m.locator('#cert-year').fill(testYear);
    await m.getByRole('button', { name: 'Generar certificado' }).click();
    await expectText(m, 'Año gravable ' + testYear);
    await expectText(m, 'Indemnización por despido');
    await m.getByRole('button', { name: 'Certificado laboral' }).click();
    await expectText(m, 'Representante legal');
    await page.keyboard.press('Escape');
    await page.locator('.modal').waitFor({ state: 'detached' });
  });

  await step('Usuarios: dar y quitar acceso a un administrador de empresa', async () => {
    await page.getByRole('button', { name: /Usuarios/ }).click();
    await page.locator('#user-email').fill('jefe@espiga.co');
    await page.getByRole('button', { name: '+ Dar acceso' }).click();
    await expectText(page, 'Acceso creado.');
    await expectText(page, 'jefe@espiga.co');
    await page.getByRole('button', { name: 'Quitar acceso' }).click();
    await expectText(page, 'Acceso retirado.');

    await page.locator('#user-email').fill('ana@espiga.co');
    await page.locator('#user-role').selectOption('EMPLOYEE');
    await page.locator('#user-employee').selectOption({ label: 'Ana Gómez · 1012345678' });
    await page.getByRole('button', { name: '+ Dar acceso' }).click();
    await expectText(page, 'ana@espiga.co');
  });

  await step('Portal del empleado: desprendible, certificado 220 y solicitud', async () => {
    const portal = await openDashboard({ baseUrl, as: 'ana@espiga.co', headless: !process.env.HEADED });
    try {
      const p = portal.page;
      await p.getByText('Entendido').click({ timeout: 15000 }).catch(() => {});
      await expectText(p, 'Hola, Ana');
      await p.getByRole('tab', { name: /Desprendibles/ }).click();
      await expectText(p, currentPeriodStart);
      await p.getByRole('tab', { name: /Certificados/ }).click();
      await p.locator('#portal-cert-year').fill(testYear);
      await p.getByRole('button', { name: 'Generar' }).last().click();
      await expectText(p, 'Año gravable ' + testYear);

      await p.getByRole('button', { name: '✕ Cerrar' }).click();

      // Solicitud de permiso para hoy; el retiro queda al cierre del próximo mes.
      await p.getByRole('tab', { name: /Solicitudes/ }).click();
      await p.locator('#req-type').selectOption('PERMISSION');
      await p.locator('#req-start').fill(today);
      await p.locator('#req-end').fill(today);
      await p.locator('#req-reason').fill('Cita médica');
      await p.getByRole('button', { name: 'Enviar solicitud' }).click();
      await expectText(p, 'Solicitud enviada');
      await expectText(p, 'Pendiente');
      if (portal.problems.length) throw new Error(portal.problems.join(' || '));
    } finally {
      await portal.browser.close();
    }
  });

  await step('Solicitudes: el administrador aprueba el permiso pedido en el portal', async () => {
    await page.getByRole('button', { name: /Solicitudes/ }).click();
    await expectText(page, 'Cita médica');
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expectText(page, 'Permiso aprobado.');
    await page.locator('#requests-status').selectOption('APPROVED');
    await page.locator('td', { hasText: 'Aprobada' }).waitFor();
  });

  await step('Actividad: cierre y descargas quedan registrados', async () => {
    await page.getByRole('button', { name: /Actividad/ }).click();
    await expectText(page, 'Cerró el periodo de nómina');
    await page.locator('#activity-action').selectOption('EXPORT');
    await expectText(page, 'Descargó el comprobante contable');
    await expectText(page, 'Descargó el archivo PILA');
    await page.locator('#activity-action').selectOption('');
  });

  await step('Panel de empresas: estado del mes y abrir la empresa', async () => {
    await page.getByRole('button', { name: /Panel de empresas/ }).click();
    // El nombre también está en una <option> oculta del selector de empresa.
    await page.locator('td', { hasText: 'Panadería La Espiga S.A.S.' }).waitFor();
    await page.getByRole('button', { name: 'Abrir' }).first().click();
    await page.getByRole('button', { name: /Importar desde Excel/ }).waitFor();
  });

  await step('Importar un empleado desde Excel y validar la vista previa', async () => {
    await page.getByRole('button', { name: /Nómina mensual/ }).click();
    await page.getByRole('button', { name: /Importar desde Excel/ }).click();
    const m = modal(page);
    await m.getByLabel('Archivo de empleados').setInputFiles(
      join(here, 'fixtures', 'importar-empleados.xlsx')
    );
    await expectText(m, '1 fila(s)');
    await expectText(m, '1 válida(s)');
    await m.getByRole('button', { name: /Importar 1 fila/ }).click();
    await expectText(m, '1 empleado(s) creado(s).');
    await expectText(page, '1 empleado(s) importado(s) correctamente.');
    await m.getByRole('button', { name: 'Cerrar' }).click();
    await page.getByText(/Beatriz.*Mora/).waitFor({ timeout: 10000 });
  });

  await step('Sin errores de consola, JavaScript ni HTTP inesperados', async () => {
    const unexpected = problems.filter(p => !expectedHttp.some(re => re.test(p)));
    if (unexpected.length) throw new Error(unexpected.join(' || '));
  });
} catch {
  // El paso que falló ya quedó registrado en `results`.
  if (page) {
    const shot = join(here, 'e2e-fallo.png');
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    console.log('Captura del fallo: ' + shot);
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}

for (const [mark, name, detail] of results) {
  console.log(`${mark} ${name}${detail ? '\n    ' + detail : ''}`);
}

process.exit(results.some(r => r[0] === '✗') ? 1 : 0);

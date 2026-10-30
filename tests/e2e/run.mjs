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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDashboard, fill } from './browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const port = 8800 + Math.floor(Math.random() * 100);
const baseUrl = `http://localhost:${port}`;

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
    await fill(m, 'Fecha ingreso', '2025-02-01');
    await fill(m, 'Banco', 'Bancolombia');
    await fill(m, 'Número de cuenta', '12345678901');
    await fill(m, 'Código fondo de pensiones', '230301');
    await m.getByRole('button', { name: 'Guardar empleado' }).click();
    await expectText(page, /Ana.*Gómez/);
  });

  await step('Crear periodo de nómina', async () => {
    await page.getByRole('button', { name: '+ Nuevo periodo' }).click();
    const m = modal(page);
    await fill(m, 'Periodo desde', '2026-10-01');
    await fill(m, 'Periodo hasta', '2026-10-31');
    await m.getByRole('button', { name: 'Crear periodo' }).click();
    await page.getByRole('button', { name: /Cerrar periodo/ }).waitFor();
  });

  await step('Registrar incapacidad y ajustar días trabajados', async () => {
    await page.getByText(/Ana.*Gómez/).first().click();
    await page.getByRole('button', { name: /Registrar incapacidad/ }).click();
    const m = modal(page);
    await fill(m, 'Tipo', 'GENERAL_INCAPACITY');
    await fill(m, 'Fecha inicio', '2026-10-10');
    await fill(m, 'Fecha fin', '2026-10-14');
    await m.getByRole('button', { name: 'Registrar' }).click();
    await expectText(page, 'Se detectó 1 incapacidad/licencia');
  });

  await step('Calcular nómina (incapacidad al piso de 1 SMMLV/día)', async () => {
    await page.getByRole('button', { name: /Calcular nómina/ }).click();
    await expectText(page, 'Nómina calculada correctamente.');
    await expectText(page, '$ 291.818');
    await expectText(page, '$ 175.091 son recobrables');
  });

  await step('Ver hoja de nómina', async () => {
    await page.getByRole('button', { name: /Ver hoja de nómina/ }).click();
    await expectText(page, 'Nómina Individual');
    await page.getByRole('button', { name: /^\W*Cerrar$/ }).first().click();
  });

  await step('Generar XML DIAN', async () => {
    await page.getByRole('button', { name: /Generar XML DIAN/ }).click();
    await expectText(page, 'XML de nómina generado.');
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
    if (name !== 'PILA_900123456_2026-10.txt') throw new Error('Descarga inesperada: ' + name);
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
    if (!/^COMPROBANTE_NOMINA_900123456_2026-10-01_2026-10-31\.csv$/.test(name)) throw new Error('Descarga inesperada: ' + name);
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
    await fill(m, 'Fecha inicio', '2026-10-01');
    await fill(m, 'Objeto / entregable del contrato', 'Asesoría contable mensual');
    await m.getByRole('button', { name: 'Crear vinculación' }).click();
    await page.locator('.modal').waitFor({ state: 'detached' });
    await page.getByText(/Carlos.*Ruiz/).first().click();
    await page.getByRole('button', { name: /Registrar horas/ }).waitFor();
  });

  await step('Personal por horas: horas, bloqueo sin PILA, PILA y liquidación', async () => {
    await page.getByRole('button', { name: /Registrar horas/ }).click();
    let m = modal(page);
    await fill(m, 'Periodo desde', '2026-10-01');
    await fill(m, 'Periodo hasta', '2026-10-31');
    await fill(m, 'Horas trabajadas', '20');
    await m.getByRole('button').last().click();
    await expectText(page, 'Horas registradas correctamente.');

    await page.getByRole('button', { name: /Liquidar periodo/ }).click();
    m = modal(page);
    await fill(m, 'Periodo desde', '2026-10-01');
    await fill(m, 'Periodo hasta', '2026-10-31');
    await m.getByRole('button', { name: 'Calcular liquidación' }).click();
    await expectText(page, /Debes verificar el pago de seguridad social/);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /Verificar PILA/ }).click();
    m = modal(page);
    await fill(m, 'Periodo (AAAA-MM)', '2026-10');
    await fill(m, 'IBC declarado por el contratista', '1750905');
    await m.getByRole('button', { name: 'Registrar verificación' }).click();
    await expectText(page, 'Verificación de PILA registrada.');

    await page.getByRole('button', { name: /Liquidar periodo/ }).click();
    m = modal(page);
    await fill(m, 'Periodo desde', '2026-10-01');
    await fill(m, 'Periodo hasta', '2026-10-31');
    await m.getByRole('button', { name: 'Calcular liquidación' }).click();
    await expectText(page, 'Liquidación calculada correctamente.');
    await expectText(page, '$ 1.504.000');
  });

  await step('Prestaciones: calcular y registrar la prima del semestre', async () => {
    await page.getByRole('button', { name: /Prestaciones/ }).click();
    await page.locator('#benefit-year').fill('2026');
    await page.locator('#benefit-semester').selectOption('2');
    await page.getByRole('button', { name: /Calcular/ }).first().click();
    await expectText(page, '2026-07-01 a 2026-12-31');
    await page.getByRole('button', { name: /Registrar pago/ }).click();
    await expectText(page, 'Pago registrado para 1 empleado(s).');
  });

  await step('Vacaciones y liquidación definitiva', async () => {
    await page.getByRole('button', { name: /Nómina mensual/ }).click();
    await page.getByRole('button', { name: '+ Nuevo periodo' }).click();
    let m = modal(page);
    await fill(m, 'Periodo desde', '2026-12-01');
    await fill(m, 'Periodo hasta', '2026-12-31');
    await m.getByRole('button', { name: 'Crear periodo' }).click();
    await page.getByText(/Ana.*Gómez/).first().click();
    await expectText(page, /días hábiles pendientes/);
    await page.getByRole('button', { name: /Registrar incapacidad, licencia o vacaciones/ }).click();
    m = modal(page);
    await fill(m, 'Tipo', 'VACATION');
    await fill(m, 'Fecha inicio', '2026-12-14');
    await fill(m, 'Fecha fin', '2026-12-31');
    await m.getByRole('button', { name: 'Registrar' }).click();
    await expectText(page, /Vacaciones disfrutadas — 18 días/);

    await page.getByRole('button', { name: /Retiro y liquidación definitiva/ }).click();
    await page.locator('#term-date').fill('2026-12-31');
    await page.locator('#term-reason').selectOption('DESPIDO_SIN_JUSTA_CAUSA');
    await page.getByRole('button', { name: /Calcular liquidación/ }).click();
    await expectText(page, 'Indemnización por despido sin justa causa (art. 64 CST)');
    await page.getByRole('button', { name: 'Retirar y guardar' }).click();
    await expectText(page, 'Empleado retirado.');
  });

  await step('Certificados del retirado: ingresos y retenciones (220) y laboral', async () => {
    await page.getByLabel('Ver retirados').check();
    await expectText(page, 'Retirado el 2026-12-31');
    await page.getByRole('button', { name: /Certificados/ }).click();
    const m = modal(page);
    await m.locator('#cert-year').fill('2026');
    await m.getByRole('button', { name: 'Generar certificado' }).click();
    await expectText(m, 'Año gravable 2026');
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
      await expectText(p, '2026-10-01');
      await p.getByRole('tab', { name: /Certificados/ }).click();
      await p.locator('#portal-cert-year').fill('2026');
      await p.getByRole('button', { name: 'Generar' }).last().click();
      await expectText(p, 'Año gravable 2026');

      await p.getByRole('button', { name: '✕ Cerrar' }).click();

      // Solicitud de permiso para hoy (Ana se retira el 2026-12-31).
      await p.getByRole('tab', { name: /Solicitudes/ }).click();
      await p.locator('#req-type').selectOption('PERMISSION');
      const today = new Date().toISOString().slice(0, 10);
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

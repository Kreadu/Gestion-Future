/**
 * Prueba end-to-end del dashboard en Firefox (Playwright).
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

  await step('Cerrar periodo', async () => {
    await page.getByRole('button', { name: /Cerrar periodo/ }).click();
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

/**
 * Abre el dashboard en Firefox (o Chromium con E2E_BROWSER=chromium) vía
 * Playwright, con Firebase simulado, y registra errores de consola,
 * excepciones y respuestas >= 400.
 * CHROMIUM_PATH permite usar un Chrome/Chromium ya instalado.
 */
import { firefox, chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const stub = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'firebaseStub.js'), 'utf8');

export async function openDashboard({ baseUrl = 'http://localhost:8788', as = 'super@kreadu.com', headless = true } = {}) {
  const browser = process.env.E2E_BROWSER === 'chromium'
    ? await chromium.launch({ headless, executablePath: process.env.CHROMIUM_PATH || undefined })
    : await firefox.launch({ headless });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-CO' });
  const problems = [];

  await context.route(/gstatic\.com\/firebasejs\//, route =>
    route.fulfill({ contentType: 'application/javascript', body: stub }));
  await context.addInitScript(email => {
    localStorage.setItem('e2e-user', email);
    localStorage.setItem('e2e-login-as', email);
  }, as);

  const page = await context.newPage();
  // Chromium repite en consola cada respuesta >= 400 sin la URL; esas ya
  // quedan registradas (con URL) en el manejador de 'response'.
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) problems.push('console: ' + m.text());
  });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('response', async r => {
    if (r.status() >= 400 && r.url().startsWith(baseUrl)) {
      let body = '';
      try { body = (await r.text()).slice(0, 300); } catch {}
      problems.push(`http ${r.status()} ${r.request().method()} ${r.url().replace(baseUrl, '')} ${body}`);
    }
  });

  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { browser, context, page, problems };
}

/**
 * Campo (input/select/textarea) que sigue a la etiqueta cuyo texto es
 * exactamente `label` (tal como está en el código, sin mayúsculas CSS).
 */
export function field(scope, label) {
  const text = JSON.stringify(label);
  return scope.locator(
    `xpath=.//label[normalize-space(.)=${text}]/following-sibling::*[self::input or self::select or self::textarea][1]`
  ).first();
}

export async function fill(scope, label, value) {
  const el = field(scope, label);
  const tag = await el.evaluate(e => e.tagName);
  if (tag === 'SELECT') await el.selectOption(value);
  else await el.fill(String(value));
}

/** Etiquetas y tipos de los campos visibles dentro de `scope`. */
export async function describeForm(scope) {
  return scope.locator('.form-group').evaluateAll(groups => groups.map(g => {
    const label = g.querySelector('label')?.innerText.trim();
    const el = g.querySelector('input, select, textarea');
    if (!el) return null;
    const opts = el.tagName === 'SELECT' ? ' [' + [...el.options].map(o => o.value).join('|') + ']' : '';
    return `${label} :: ${el.tagName.toLowerCase()} ${el.type || ''}${opts}`;
  }).filter(Boolean));
}

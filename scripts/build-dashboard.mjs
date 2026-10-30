/**
 * Compila src/dashboard/app.jsx (+ components/*.jsx) a JavaScript plano y lo deja en
 * src/dashboard/app.generated.ts (archivo generado, no versionado).
 *
 * Antes el navegador descargaba Babel (~3 MB) y compilaba el JSX en
 * cada carga del dashboard: 25-80 s en un equipo modesto. Ahora se
 * compila una sola vez, al construir.
 */

import { transform } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'dashboard');

// app.jsx + cada pantalla de src/dashboard/components/*.jsx, en un solo
// script: comparten los mismos globales (React, api, formatCOP...).
const componentsDir = join(dir, 'components');
const components = existsSync(componentsDir)
  ? readdirSync(componentsDir).filter(f => f.endsWith('.jsx')).sort()
  : [];

const source = [
  readFileSync(join(dir, 'app.jsx'), 'utf8'),
  ...components.map(f => `\n// ---- components/${f} ----\n` + readFileSync(join(componentsDir, f), 'utf8')),
].join('\n');

const { code } = await transform(source, {
  loader: 'jsx',
  jsx: 'transform',
  target: 'es2019',
  minify: true,
  legalComments: 'none',
  sourcefile: 'app.jsx',
});

// El código va dentro de un <script> inline: "</script" lo cerraría.
const safe = code.replace(/<\/script/gi, '<\\/script');

const outputPath = join(dir, 'app.generated.ts');
const output =
  '// Generado por scripts/build-dashboard.mjs desde app.jsx. No editar.\n' +
  `export const DASHBOARD_APP_JS = ${JSON.stringify(safe)};\n`;

// Wrangler vigila `src` durante `wrangler dev`. Si reescribimos este archivo
// generado aunque el contenido sea idéntico, cada build dispara otro build.
if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== output) {
  writeFileSync(outputPath, output);
}

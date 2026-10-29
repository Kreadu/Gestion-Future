/**
 * Compila src/dashboard/app.jsx a JavaScript plano y lo deja en
 * src/dashboard/app.generated.ts (archivo generado, no versionado).
 *
 * Antes el navegador descargaba Babel (~3 MB) y compilaba el JSX en
 * cada carga del dashboard: 25-80 s en un equipo modesto. Ahora se
 * compila una sola vez, al construir.
 */

import { transform } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'dashboard');
const source = readFileSync(join(dir, 'app.jsx'), 'utf8');

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

writeFileSync(
  join(dir, 'app.generated.ts'),
  '// Generado por scripts/build-dashboard.mjs desde app.jsx. No editar.\n' +
    `export const DASHBOARD_APP_JS = ${JSON.stringify(safe)};\n`
);

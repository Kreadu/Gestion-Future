/**
 * Servidor local para pruebas end-to-end en navegador.
 *
 * Empaqueta src/index.ts con esbuild y lo sirve con Node sobre una
 * base SQLite en memoria con TODAS las migraciones aplicadas (igual
 * que tests/apiIntegration.test.ts). Lo único simulado es Firebase:
 * el módulo src/auth/firebaseToken.ts se reemplaza por uno que acepta
 * como token el correo del usuario. Nunca se usa en producción.
 *
 * Uso: node tests/e2e/server.mjs [puerto]
 */

import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readdirSync, readFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.argv[2] || 8788);

export const SUPER_ADMIN_EMAIL = 'super@kreadu.com';

const fakeFirebaseToken = `
export class TokenVerificationError extends Error {}
export async function verifyFirebaseIdToken(token) {
  if (!token || !token.includes('@')) throw new TokenVerificationError('Token inválido o expirado.');
  return { uid: 'uid-' + token, email: token, emailVerified: true };
}
`;

const outdir = mkdtempSync(join(tmpdir(), 'gf-e2e-'));

await build({
  entryPoints: [join(root, 'src/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  outfile: join(outdir, 'worker.mjs'),
  logLevel: 'warning',
  // node-forge usa require('crypto') cuando detecta Node (en Workers no).
  external: ['crypto'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  plugins: [{
    name: 'fake-firebase-token',
    setup(b) {
      b.onResolve({ filter: /firebaseToken$/ }, () => ({ path: 'fake-firebase-token', namespace: 'fake' }));
      b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: fakeFirebaseToken, loader: 'js' }));
    },
  }],
});

const worker = (await import(pathToFileURL(join(outdir, 'worker.mjs')).href)).default;

function createD1(db) {
  const toSqlite = value => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  };

  const statement = (sql, args = []) => ({
    bind: (...next) => statement(sql, next),
    async first() {
      return db.prepare(sql).get(...args.map(toSqlite)) ?? null;
    },
    async all() {
      return { results: db.prepare(sql).all(...args.map(toSqlite)), success: true };
    },
    async run() {
      const info = db.prepare(sql).run(...args.map(toSqlite));
      return { success: true, meta: { changes: Number(info.changes) } };
    },
  });

  return { prepare: sql => statement(sql) };
}

const db = new DatabaseSync(':memory:');
const migrations = join(root, 'migrations');

for (const file of readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) {
  db.exec(readFileSync(join(migrations, file), 'utf8'));
}

db.prepare(
  `INSERT INTO users (id, email, role, active, createdAt)
   VALUES ('USR-super', ?, 'SUPER_ADMIN', 1, '2026-01-01')`
).run(SUPER_ADMIN_EMAIL);

// Certificado autofirmado de prueba (tests/fixtures) y datos de
// habilitación ficticios. La DIAN también se simula: ninguna petición
// sale a sus servidores.
const dianCert = JSON.parse(readFileSync(join(root, 'tests/fixtures/dian-test-cert.json'), 'utf8'));

const env = {
  DB: createD1(db),
  ENVIRONMENT: 'development',
  FIREBASE_PROJECT_ID: 'e2e-project',
  FIREBASE_API_KEY: 'e2e-key',
  FIREBASE_AUTH_DOMAIN: 'e2e.firebaseapp.com',
  DIAN_CERT_P12: dianCert.p12Base64,
  DIAN_CERT_PASSWORD: dianCert.password,
  DIAN_SOFTWARE_ID: 'software-e2e',
  DIAN_SOFTWARE_PIN: '13579',
  DIAN_TEST_SET_ID: 'set-e2e',
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes('dian.gov.co')) return realFetch(input, init);
  const body = String(init && init.body || '');
  const result = body.includes('SendTestSetAsync')
    ? '<SendTestSetAsyncResult xmlns:b="b"><b:ZipKey>zip-e2e</b:ZipKey></SendTestSetAsyncResult>'
    : '<GetStatusZipResult xmlns:b="b"><b:DianResponse><b:IsValid>true</b:IsValid><b:StatusCode>00</b:StatusCode>' +
      '<b:StatusDescription>Procesado Correctamente.</b:StatusDescription></b:DianResponse></GetStatusZipResult>';
  return new Response(
    `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body>${result}</s:Body></s:Envelope>`,
    { headers: { 'Content-Type': 'application/soap+xml' } }
  );
};

createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value);
    }
    headers.set('CF-Connecting-IP', '127.0.0.1');

    const response = await worker.fetch(
      new Request(`http://localhost:${port}${req.url}`, {
        method: req.method,
        headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
      }),
      env,
      { waitUntil() {}, passThroughOnException() {} }
    );

    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(String(error && error.stack || error));
  }
}).listen(port, () => {
  console.log(`E2E listo en http://localhost:${port}`);
});

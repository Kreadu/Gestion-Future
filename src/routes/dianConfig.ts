/**
 * Habilitación DIAN por empresa empleadora:
 *
 *   GET /api/companies/:id/dian-config → estado (nunca devuelve PIN, certificado ni contraseña)
 *   PUT /api/companies/:id/dian-config { softwareId, pin?, testSetId?, environment,
 *                                        certificateP12Base64?, certificatePassword? }
 *
 * Cada empresa reporta su nómina con su NIT: la propia (trabajadores
 * en misión) y cada cliente a la que se le lleva la nómina. El PIN, el
 * .p12 y su contraseña se guardan cifrados (ver secretBox.ts).
 */

import { sendJson } from '../http';
import { HttpError, audit, requireCompanyAccess, requireRole, type AuthEnv, type AuthUser } from '../auth/authz';
import type { DianEnvironment } from '../services/dianNominaXmlService';
import { DianCertificateError, loadPkcs12, type DianCertificate } from '../services/dianSigner';
import { SecretBoxError, openSecret, sealSecret } from '../services/secretBox';

export interface DianConfigEnv extends AuthEnv {
  DIAN_CONFIG_KEY?: string;
}

/** Credenciales de software con que se genera el XML (sin el certificado). */
export interface DianSoftware {
  softwareId: string;
  pin: string;
  environment: DianEnvironment;
  testSetId: string | null;
  /** false = la empresa no está habilitada: valores de prueba, no sirven para enviar. */
  configured: boolean;
}

/** Valores de relleno mientras la empresa no tenga su habilitación DIAN. */
const PLACEHOLDER: DianSoftware = {
  softwareId: 'SOFT-KREADU-2026',
  pin: '12345',
  environment: '2',
  testSetId: null,
  configured: false,
};

async function configRow(env: DianConfigEnv, companyId: string): Promise<any | null> {
  return env.DB
    .prepare(`SELECT * FROM company_dian_config WHERE companyId = ?1`)
    .bind(companyId)
    .first<any>();
}

export async function dianSoftwareFor(env: DianConfigEnv, companyId: string): Promise<DianSoftware> {
  const row = await configRow(env, companyId);
  if (!row) return PLACEHOLDER;
  let pin: string;
  try {
    pin = await openSecret(env.DIAN_CONFIG_KEY, String(row.pinSealed));
  } catch (error) {
    if (error instanceof SecretBoxError) throw new HttpError(409, error.message);
    throw error;
  }
  return {
    softwareId: String(row.softwareId),
    pin,
    environment: row.environment === '1' ? '1' : '2',
    testSetId: row.testSetId ? String(row.testSetId) : null,
    configured: true,
  };
}

// Abrir un .p12 (PBKDF + 3DES en JS) tarda cientos de ms: se reutiliza
// mientras el isolate siga vivo y la configuración no cambie.
const certificateCache = new Map<string, Promise<DianCertificate>>();

/** Certificado de la empresa, o null si no lo ha cargado. */
export async function dianCertificateFor(env: DianConfigEnv, companyId: string): Promise<DianCertificate | null> {
  const row = await configRow(env, companyId);
  if (!row?.certP12Sealed) return null;

  const key = `${companyId}|${row.updatedAt}`;
  let value = certificateCache.get(key);
  if (!value) {
    value = (async () => loadPkcs12(
      await openSecret(env.DIAN_CONFIG_KEY, String(row.certP12Sealed)),
      await openSecret(env.DIAN_CONFIG_KEY, String(row.certPasswordSealed || ''))
    ))();
    for (const old of certificateCache.keys()) if (old.startsWith(`${companyId}|`)) certificateCache.delete(old);
    certificateCache.set(key, value);
    value.catch(() => certificateCache.delete(key));
  }
  return value;
}

function publicView(row: any | null) {
  return {
    configured: !!row,
    softwareId: row?.softwareId ?? null,
    testSetId: row?.testSetId ?? null,
    environment: row?.environment ?? '2',
    hasCertificate: !!row?.certP12Sealed,
    certSubject: row?.certSubject ?? null,
    certIssuer: row?.certIssuer ?? null,
    certNotAfter: row?.certNotAfter ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function handleDianConfigRoutes(
  request: Request,
  url: URL,
  env: DianConfigEnv,
  user: AuthUser
): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/companies\/([^/]+)\/dian-config$/);
  if (!match || (request.method !== 'GET' && request.method !== 'PUT')) return null;

  const companyId = decodeURIComponent(match[1]);
  requireRole(user, ['TENANT_ADMIN']);
  requireCompanyAccess(user, companyId);

  const company = await env.DB
    .prepare(`SELECT id, nit FROM companies WHERE id = ?1`)
    .bind(companyId)
    .first<any>();
  if (!company) throw new HttpError(404, 'Empresa no encontrada.');

  const existing = await configRow(env, companyId);
  if (request.method === 'GET') {
    return sendJson({ success: true, data: publicView(existing) });
  }

  const body = (await request.json().catch(() => ({}))) as any;
  const softwareId = String(body.softwareId || '').trim();
  const pin = String(body.pin || '').trim();
  const testSetId = String(body.testSetId || '').trim() || null;
  const environment = body.environment === '1' ? '1' : '2';
  const p12 = String(body.certificateP12Base64 || '').replace(/\s+/g, '');
  const password = String(body.certificatePassword || '');

  if (!softwareId) throw new HttpError(400, 'El Software ID es obligatorio.');
  if (!pin && !existing) throw new HttpError(400, 'El PIN del software es obligatorio.');
  if (p12.length > 200_000) throw new HttpError(400, 'El certificado es demasiado grande.');

  const warnings: string[] = [];
  let cert: DianCertificate | null = null;
  if (p12) {
    try {
      cert = await loadPkcs12(p12, password);
    } catch (error) {
      if (error instanceof DianCertificateError) throw new HttpError(400, error.message);
      throw new HttpError(400, 'El archivo no es un certificado .p12/.pfx válido.');
    }
    if (cert.notAfter.getTime() < Date.now()) throw new HttpError(400, 'El certificado está vencido.');
    const nit = String(company.nit || '').replace(/\D/g, '');
    if (nit && !cert.subjectName.replace(/\D/g, '').includes(nit)) {
      warnings.push('El certificado no menciona el NIT de esta empresa: confirma que sea el de la empresa empleadora.');
    }
  }

  try {
    const pinSealed = pin ? await sealSecret(env.DIAN_CONFIG_KEY, pin) : String(existing.pinSealed);
    const certP12Sealed = cert ? await sealSecret(env.DIAN_CONFIG_KEY, p12) : existing?.certP12Sealed ?? null;
    const certPasswordSealed = cert ? await sealSecret(env.DIAN_CONFIG_KEY, password) : existing?.certPasswordSealed ?? null;

    await env.DB
      .prepare(`
        INSERT INTO company_dian_config (
          companyId, softwareId, pinSealed, testSetId, environment,
          certP12Sealed, certPasswordSealed, certSubject, certIssuer, certNotAfter, updatedAt
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        ON CONFLICT(companyId) DO UPDATE SET
          softwareId = excluded.softwareId,
          pinSealed = excluded.pinSealed,
          testSetId = excluded.testSetId,
          environment = excluded.environment,
          certP12Sealed = excluded.certP12Sealed,
          certPasswordSealed = excluded.certPasswordSealed,
          certSubject = excluded.certSubject,
          certIssuer = excluded.certIssuer,
          certNotAfter = excluded.certNotAfter,
          updatedAt = excluded.updatedAt
      `)
      .bind(
        companyId,
        softwareId,
        pinSealed,
        testSetId,
        environment,
        certP12Sealed,
        certPasswordSealed,
        cert ? cert.subjectName : existing?.certSubject ?? null,
        cert ? cert.issuerName : existing?.certIssuer ?? null,
        cert ? cert.notAfter.toISOString() : existing?.certNotAfter ?? null,
        new Date().toISOString()
      )
      .run();
  } catch (error) {
    if (error instanceof SecretBoxError) throw new HttpError(409, error.message);
    throw error;
  }

  await audit(env, user, 'UPDATE', 'dian_config', companyId, companyId);

  const saved = await configRow(env, companyId);
  return sendJson({ success: true, data: { ...publicView(saved), warnings } });
}

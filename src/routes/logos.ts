/**
 * Logos de empresa (issue #13).
 *
 * El logo ya no viaja dentro de `companies.logo` (data URL de hasta
 * 2 MB en cada listado): vive en la tabla `company_logos` y se sirve
 * aparte, con caché, en
 *
 *   GET /api/companies/:id/logo   imagen binaria (autenticado)
 *
 * El listado de empresas sólo devuelve `hasLogo` y `logoVersion`; el
 * dashboard pide la imagen con el token y la muestra con un blob URL.
 */

import { sendJson } from '../http';
import {
  requireCompanyAccess,
  HttpError,
  type AuthUser,
} from '../auth/authz';

interface RouteEnv {
  DB: D1Database;
}

/** Tamaño máximo del archivo ya decodificado (el navegador lo reduce a 400 px). */
export const MAX_LOGO_BYTES = 512 * 1024;

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

const DATA_URL = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]*)$/i;

/** Metadatos del logo que acompañan a la empresa en las respuestas JSON. */
export interface LogoMeta {
  hasLogo: boolean;
  logoVersion: string | null;
}

/**
 * Subconsulta para el SELECT de empresas: devuelve la fecha de
 * actualización del logo (o NULL) como `logoUpdatedAt`.
 */
export const LOGO_UPDATED_AT_SQL =
  '(SELECT cl.updatedAt FROM company_logos cl WHERE cl.companyId = companies.id) AS logoUpdatedAt';

/** Convierte `logoUpdatedAt` de una fila en `hasLogo`/`logoVersion`. */
export function logoMetaFromRow(row: any): LogoMeta {
  const updatedAt = row?.logoUpdatedAt ?? null;
  return {
    hasLogo: !!updatedAt,
    logoVersion: updatedAt ? versionOf(String(updatedAt)) : null,
  };
}

/** Lee los metadatos del logo de una empresa. */
export async function getLogoMeta(env: RouteEnv, companyId: string): Promise<LogoMeta> {
  const row = await env.DB
    .prepare('SELECT updatedAt AS logoUpdatedAt FROM company_logos WHERE companyId = ?1')
    .bind(companyId)
    .first<any>();

  return logoMetaFromRow(row);
}

function versionOf(updatedAt: string): string {
  const ms = Date.parse(updatedAt);
  return Number.isFinite(ms) ? String(ms) : updatedAt.replace(/[^0-9A-Za-z]/g, '');
}

export interface ParsedLogo {
  contentType: string;
  data: string;
}

/**
 * Valida el campo `logo` del cuerpo de POST/PUT /api/companies:
 *
 *   undefined          no cambia nada            -> undefined
 *   null o ''          elimina el logo           -> null
 *   'data:image/...'   reemplaza el logo         -> { contentType, data }
 *
 * Lanza HttpError 400 si el formato, el tipo o el tamaño no son
 * válidos. Se llama ANTES de escribir la empresa para no dejarla a
 * medias.
 */
export function parseCompanyLogo(logo: unknown): ParsedLogo | null | undefined {
  if (logo === undefined) return undefined;
  if (logo === null || logo === '') return null;

  const match = typeof logo === 'string' ? logo.match(DATA_URL) : null;
  const contentType = match ? match[1].toLowerCase() : '';

  if (!match || !ALLOWED_TYPES.has(contentType)) {
    throw new HttpError(400, 'El logo debe ser una imagen (PNG, JPG, WEBP, GIF o SVG).');
  }

  const data = match[2].replace(/\s+/g, '');
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((data.length * 3) / 4) - padding;

  if (!data || bytes > MAX_LOGO_BYTES) {
    throw new HttpError(
      400,
      `El logo no puede superar ${Math.round(MAX_LOGO_BYTES / 1024)} KB.`
    );
  }

  return { contentType, data };
}

/** Guarda o borra el logo ya validado con parseCompanyLogo. */
export async function saveCompanyLogo(
  env: RouteEnv,
  companyId: string,
  logo: ParsedLogo | null | undefined
): Promise<void> {
  if (logo === undefined) return;

  if (logo === null) {
    await env.DB
      .prepare('DELETE FROM company_logos WHERE companyId = ?1')
      .bind(companyId)
      .run();
    return;
  }

  await env.DB
    .prepare(`
      INSERT INTO company_logos (companyId, contentType, data, updatedAt)
      VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(companyId) DO UPDATE SET
        contentType = excluded.contentType,
        data = excluded.data,
        updatedAt = excluded.updatedAt
    `)
    .bind(companyId, logo.contentType, logo.data, new Date().toISOString())
    .run();
}

function base64ToBytes(data: string): ArrayBuffer {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function handleLogoRoutes(
  request: Request,
  url: URL,
  env: RouteEnv,
  user: AuthUser
): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/companies\/([^/]+)\/logo$/);

  if (!match || (request.method !== 'GET' && request.method !== 'HEAD')) {
    return null;
  }

  const companyId = decodeURIComponent(match[1]);

  // Cualquier usuario de la empresa (incluido EMPLOYEE, para su
  // comprobante) o SUPER_ADMIN.
  requireCompanyAccess(user, companyId);

  const row = await env.DB
    .prepare(`
      SELECT cl.contentType, cl.data, cl.updatedAt
      FROM company_logos cl
      JOIN companies c ON c.id = cl.companyId
      WHERE cl.companyId = ?1 AND c.active = 1
    `)
    .bind(companyId)
    .first<any>();

  if (!row) {
    return sendJson({ success: false, error: 'La empresa no tiene logo.' }, 404);
  }

  const etag = `"logo-${versionOf(String(row.updatedAt))}"`;
  const headers: Record<string, string> = {
    'Cache-Control': 'private, max-age=86400',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    // Un SVG nunca debe ejecutar scripts aunque se abra directamente.
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };

  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch && ifNoneMatch.split(',').some(t => t.trim().replace(/^W\//, '') === etag)) {
    return new Response(null, { status: 304, headers });
  }

  const bytes = base64ToBytes(String(row.data));
  headers['Content-Type'] = String(row.contentType);
  headers['Content-Length'] = String(bytes.byteLength);

  return new Response(request.method === 'HEAD' ? null : bytes, {
    status: 200,
    headers,
  });
}

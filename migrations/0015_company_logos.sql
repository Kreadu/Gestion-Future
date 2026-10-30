-- Logos de empresa fuera de `companies` (issue #13).
--
-- Antes el logo se guardaba como data URL (hasta 2 MB) en
-- companies.logo y viajaba completo en cada GET /api/companies. Ahora
-- vive en su propia tabla y se sirve en GET /api/companies/:id/logo.
-- `data` es el contenido en base64 (sin el prefijo "data:...;base64,").

CREATE TABLE IF NOT EXISTS company_logos (
    companyId TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    contentType TEXT NOT NULL,
    data TEXT NOT NULL,
    updatedAt TEXT NOT NULL
);

-- Mover los logos existentes ("data:image/png;base64,AAAA...").
INSERT OR REPLACE INTO company_logos (companyId, contentType, data, updatedAt)
SELECT
    id,
    lower(substr(logo, 6, instr(logo, ';base64,') - 6)),
    substr(logo, instr(logo, ';base64,') + 8),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM companies
WHERE logo LIKE 'data:image/%;base64,%';

-- La columna se conserva (SQLite/D1 no la borra sin reconstruir la
-- tabla), pero ya no se usa.
UPDATE companies SET logo = NULL WHERE logo IS NOT NULL;

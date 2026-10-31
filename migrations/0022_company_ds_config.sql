-- Habilitación DIAN del documento soporte en adquisiciones a no
-- obligados a facturar (pagos a contratistas independientes). Es un
-- set de pruebas y un Software ID distintos a los de la nómina, y lleva
-- numeración autorizada por la DIAN (resolución, prefijo y rango). El
-- certificado digital es el de company_dian_config. El PIN va cifrado.
CREATE TABLE IF NOT EXISTS company_ds_config (
    companyId TEXT PRIMARY KEY REFERENCES companies(id),
    softwareId TEXT NOT NULL,
    pinSealed TEXT NOT NULL,
    testSetId TEXT,
    environment TEXT NOT NULL DEFAULT '2' CHECK (environment IN ('1', '2')),
    resolutionNumber TEXT NOT NULL,
    resolutionStartDate TEXT NOT NULL,
    resolutionEndDate TEXT NOT NULL,
    prefix TEXT NOT NULL,
    rangeFrom INTEGER NOT NULL,
    rangeTo INTEGER NOT NULL,
    -- Responsabilidades fiscales de la empresa (casilla 53 del RUT), p. ej. 'O-13;O-15' o 'R-99-PN'.
    taxLevelCode TEXT NOT NULL DEFAULT 'R-99-PN',
    updatedAt TEXT NOT NULL
);

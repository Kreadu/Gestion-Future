-- Habilitación DIAN de cada empresa empleadora (la propia y cada
-- cliente a la que se le lleva la nómina). El certificado .p12, su
-- contraseña y el PIN se guardan cifrados (AES-GCM con DIAN_CONFIG_KEY).
CREATE TABLE IF NOT EXISTS company_dian_config (
    companyId TEXT PRIMARY KEY REFERENCES companies(id),
    softwareId TEXT NOT NULL,
    pinSealed TEXT NOT NULL,
    testSetId TEXT,
    environment TEXT NOT NULL DEFAULT '2' CHECK (environment IN ('1', '2')),
    certP12Sealed TEXT,
    certPasswordSealed TEXT,
    certSubject TEXT,
    certIssuer TEXT,
    certNotAfter TEXT,
    updatedAt TEXT NOT NULL
);

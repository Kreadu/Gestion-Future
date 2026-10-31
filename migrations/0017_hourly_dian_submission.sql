-- Envío a la DIAN de la nómina de jornada parcial (personal por horas),
-- con los mismos campos que payroll_settlements (migración 0016).
ALTER TABLE settlements ADD COLUMN dianSubmissionStatus TEXT
    CHECK (dianSubmissionStatus IN ('SENT', 'ACCEPTED', 'REJECTED'));
ALTER TABLE settlements ADD COLUMN dianTrackId TEXT;
ALTER TABLE settlements ADD COLUMN dianSignedXml TEXT;
ALTER TABLE settlements ADD COLUMN dianResponseJson TEXT;
ALTER TABLE settlements ADD COLUMN dianSentAt TEXT;

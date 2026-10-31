// ------------------------------------------------------------
// ENVÍO A LA DIAN — firma y transmisión de la nómina electrónica
//
//   <DianSubmissionPanel settlement={...} basePath="/api/payroll-settlements" onChanged={fn} />
//
// `settlement` trae id, dianConsecutive y, si ya se envió,
// dianSubmissionStatus, dianErrors y dianSentAt. basePath es
// /api/payroll-settlements (nómina mensual) o /api/hourly/settlements
// (jornada parcial). onChanged (opcional) recarga la lista del padre.
// Cuando la DIAN ya aceptó el documento, muestra las notas de ajuste
// (reemplazar con la nómina corregida o eliminar): <DianAdjustments />.
// ------------------------------------------------------------

const DIAN_SUBMISSION_LABELS = {
  SENT: '⏳ En proceso en la DIAN',
  ACCEPTED: '✅ Aceptado por la DIAN',
  REJECTED: '❌ Rechazado por la DIAN'
};

async function downloadSignedDianXml(basePath, settlement) {
  const currentUser = firebase.auth().currentUser;
  const headers = {};

  if (currentUser) {
    headers.Authorization = 'Bearer ' + await currentUser.getIdToken();
  }

  const response = await fetch(
    basePath + '/' + encodeURIComponent(settlement.id) + '/dian/signed-xml',
    { headers: headers }
  );

  if (!response.ok) {
    throw new Error('No se pudo descargar el XML firmado.');
  }

  downloadText('nomina-' + (settlement.dianConsecutive || settlement.id) + '-firmada.xml', await response.text(), 'application/xml');
}

function DianSubmissionPanel({ settlement, basePath, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // Última respuesta de la DIAN en esta sesión; si no hay, lo que trae la liquidación.
  const [latest, setLatest] = useState(null);

  if (!settlement) {
    return null;
  }

  const path = basePath || '/api/payroll-settlements';
  const status = latest ? latest.dianSubmissionStatus : (settlement.dianSubmissionStatus || null);
  const errors = latest ? (latest.errors || []) : (settlement.dianErrors || []);
  const sentAt = latest ? latest.dianSentAt : settlement.dianSentAt;

  async function run(action) {
    setBusy(true);
    setMessage('');
    setError('');

    try {
      const result = await api(
        path + '/' + encodeURIComponent(settlement.id) + '/dian/' + action,
        { method: 'POST' }
      );
      const data = result.data || {};
      setLatest(data);
      setMessage(DIAN_SUBMISSION_LABELS[data.dianSubmissionStatus] || 'Listo.');
      if (onChanged) await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setError('');

    try {
      await downloadSignedDianXml(path, settlement);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="result-section" style={{marginTop: '18px'}} aria-live="polite">
      <h3>📤 Envío a la DIAN</h3>

      <div className="result-row">
        <span>Estado</span>
        <strong>{DIAN_SUBMISSION_LABELS[status] || 'Sin enviar'}</strong>
      </div>

      {sentAt && (
        <div className="result-row">
          <span>Último envío</span>
          <strong>{new Date(sentAt).toLocaleString('es-CO')}</strong>
        </div>
      )}

      {status === 'REJECTED' && errors.length > 0 && (
        <div className="inline-warning" role="alert" style={{marginTop: '10px'}}>
          <strong>La DIAN informó:</strong>
          <ul style={{margin: '6px 0 0 18px'}}>
            {errors.map(function(item, index) { return <li key={index}>{item}</li>; })}
          </ul>
          <div style={{marginTop: '6px'}}>Corrige los datos, vuelve a generar el XML y envíalo de nuevo.</div>
        </div>
      )}

      <div className="button-row">
        {(status === null || status === 'REJECTED') && (
          <button className="btn btn-success" disabled={busy} onClick={function() { run('send'); }}>
            {busy ? 'Enviando…' : '📤 Firmar y enviar a la DIAN'}
          </button>
        )}

        {status === 'SENT' && (
          <button className="btn" disabled={busy} onClick={function() { run('status'); }}>
            {busy ? 'Consultando…' : '🔄 Consultar estado'}
          </button>
        )}

        {sentAt && (
          <button className="btn" onClick={download}>⬇️ XML firmado</button>
        )}
      </div>

      {message && <div className="alert success" role="status" style={{position: 'static', transform: 'none', width: 'auto', marginTop: '10px'}}>{message}</div>}
      {error && <div className="inline-warning" role="alert" style={{marginTop: '10px'}}>{error}</div>}

      {status === 'ACCEPTED' && <DianAdjustments path={path} settlement={settlement} onChanged={onChanged} />}
    </div>
  );
}

// ------------------------------------------------------------
// NOTAS DE AJUSTE — corrigen lo que la DIAN ya aceptó
//
//   GET|POST {path}/:id/dian/adjustments
//   POST /api/dian-adjustments/:id/dian/send|status
// ------------------------------------------------------------

const ADJUSTMENT_TYPE_LABELS = {
  REPLACE: 'Reemplazo',
  DELETE: 'Eliminación'
};

const MONTHLY_CORRECTION_FIELDS = [
  ['daysWorked', 'Días trabajados'],
  ['extraDiurna', 'Horas extra diurnas'],
  ['extraNocturna', 'Horas extra nocturnas'],
  ['recargoNocturno', 'Horas con recargo nocturno'],
  ['horasDominicalFestivo', 'Horas dominicales/festivas'],
  ['horasExtraDominicalFestivo', 'Horas extra dominicales/festivas']
];

function correctionDefaults(settlement, hourly) {
  const values = {};
  if (hourly) {
    const hours = settlement.hoursByType || {};
    HOUR_TYPE_FIELDS.forEach(function(f) { values[f[0]] = String(hours[f[0]] || 0); });
  } else {
    MONTHLY_CORRECTION_FIELDS.forEach(function(f) {
      values[f[0]] = String(settlement[f[0]] === undefined ? (f[0] === 'daysWorked' ? 30 : 0) : settlement[f[0]]);
    });
  }
  return values;
}

function DianAdjustments({ path, settlement, onChanged }) {
  const hourly = path.indexOf('/hourly/') !== -1;
  const fields = hourly ? HOUR_TYPE_FIELDS : MONTHLY_CORRECTION_FIELDS;
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState(null);
  const [values, setValues] = useState(function() { return correctionDefaults(settlement, hourly); });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const base = path + '/' + encodeURIComponent(settlement.id) + '/dian/adjustments';

  async function load() {
    try {
      const r = await api(base);
      setItems(r.data || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(function() { load(); }, [base]);

  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const body = { type: mode, reason: reason };
      if (mode === 'REPLACE') {
        if (hourly) {
          body.hoursByType = {};
          HOUR_TYPE_FIELDS.forEach(function(f) { body.hoursByType[f[0]] = Number(values[f[0]] || 0); });
        } else {
          body.daysWorked = Number(values.daysWorked);
          body.overtimeHours = {
            extraDiurna: Number(values.extraDiurna || 0),
            extraNocturna: Number(values.extraNocturna || 0),
            recargoNocturno: Number(values.recargoNocturno || 0)
          };
          body.horasDominicalFestivo = Number(values.horasDominicalFestivo || 0);
          body.horasExtraDominicalFestivo = Number(values.horasExtraDominicalFestivo || 0);
        }
      }
      const r = await api(base, { method: 'POST', body: JSON.stringify(body) });
      setMode(null);
      setReason('');
      setMessage('Nota de ajuste ' + r.data.dianNumber + ' lista: fírmala y envíala a la DIAN.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function run(item, action) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const r = await api('/api/dian-adjustments/' + encodeURIComponent(item.id) + '/dian/' + action, { method: 'POST' });
      setMessage(item.dianNumber + ': ' + (DIAN_SUBMISSION_LABELS[r.data.dianSubmissionStatus] || 'Listo.'));
      await load();
      if (r.data.dianSubmissionStatus === 'ACCEPTED' && onChanged) await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const deleted = items.some(function(a) { return a.noteType === 'DELETE' && a.dianSubmissionStatus === 'ACCEPTED'; });
  const inProcess = items.some(function(a) { return a.dianSubmissionStatus === 'SENT'; });

  return (
    <div style={{ marginTop: '14px' }}>
      <h4 style={{ margin: '0 0 8px' }}>📝 Notas de ajuste</h4>

      {items.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '8px' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Nota</th>
              <th style={{ textAlign: 'left' }}>Tipo</th>
              <th style={{ textAlign: 'left' }}>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(function(item) {
              return (
                <tr key={item.id}>
                  <td>{item.dianNumber}{item.reason ? ' · ' + item.reason : ''}</td>
                  <td>{ADJUSTMENT_TYPE_LABELS[item.noteType]}{item.noteType === 'REPLACE' ? ' · neto ' + formatCOP(item.totalComprobante) : ''}</td>
                  <td>
                    {DIAN_SUBMISSION_LABELS[item.dianSubmissionStatus] || 'Sin enviar'}
                    {item.dianSubmissionStatus === 'REJECTED' && item.dianErrors.length > 0 && (
                      <div style={{ fontSize: '12px' }}>{item.dianErrors.join(' · ')}</div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {(item.dianSubmissionStatus === null || item.dianSubmissionStatus === 'REJECTED') && (
                      <button className="btn btn-success" disabled={busy} onClick={function() { run(item, 'send'); }}>📤 Enviar</button>
                    )}
                    {item.dianSubmissionStatus === 'SENT' && (
                      <button className="btn" disabled={busy} onClick={function() { run(item, 'status'); }}>🔄 Consultar</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {deleted && <div className="info-box">La DIAN eliminó este documento.</div>}

      {!deleted && !inProcess && !mode && (
        <div className="button-row">
          <button className="btn" onClick={function() { setMode('REPLACE'); }}>✏️ Corregir (reemplazar)</button>
          <button className="btn" onClick={function() { setMode('DELETE'); }}>🗑️ Eliminar ante la DIAN</button>
        </div>
      )}

      {mode && (
        <form onSubmit={create}>
          <div className="info-box" style={{ marginBottom: '8px' }}>
            {mode === 'REPLACE'
              ? 'Escribe los valores correctos: se recalcula la nómina y se envía a la DIAN en reemplazo de la aceptada.'
              : 'La DIAN dejará sin efecto este documento (por ejemplo, si se reportó por error).'}
          </div>
          {mode === 'REPLACE' && (
            <div className="form-grid">
              {fields.map(function(f) {
                return (
                  <div className="form-group" key={f[0]}>
                    <label htmlFor={'adj-' + f[0]}>{f[1]}</label>
                    <input id={'adj-' + f[0]} type="number" min="0" step="any" value={values[f[0]]}
                      onChange={function(e) { const v = e.target.value; setValues(function(prev) { return { ...prev, [f[0]]: v }; }); }} />
                  </div>
                );
              })}
            </div>
          )}
          <div className="form-group">
            <label htmlFor="adj-reason">Motivo</label>
            <input id="adj-reason" value={reason} maxLength={500} onChange={function(e) { setReason(e.target.value); }} />
          </div>
          <div className="button-row">
            <button type="button" className="btn" onClick={function() { setMode(null); }}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Preparando…' : 'Preparar nota de ajuste'}
            </button>
          </div>
        </form>
      )}

      {message && <div className="alert success" role="status" style={{position: 'static', transform: 'none', width: 'auto', marginTop: '10px'}}>{message}</div>}
      {error && <div className="inline-warning" role="alert" style={{marginTop: '10px'}}>{error}</div>}
    </div>
  );
}

// ------------------------------------------------------------
// HABILITACIÓN DIAN DE LA EMPRESA
//
//   <DianConfigButton company={...} />   botón + modal
//
// Cada empresa empleadora (la propia, con su personal en misión, y
// cada cliente a la que se le lleva la nómina) reporta con su NIT y su
// propia habilitación. PUT/GET /api/companies/:id/dian-config; el PIN,
// el certificado y su contraseña nunca vuelven al navegador.
// ------------------------------------------------------------

function readFileAsBase64(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function() { resolve(String(reader.result).split(',')[1] || ''); };
    reader.onerror = function() { reject(new Error('No se pudo leer el archivo.')); };
    reader.readAsDataURL(file);
  });
}

function DianConfigModal({ company, onClose }) {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({ softwareId: '', pin: '', testSetId: '', environment: '2', password: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [warnings, setWarnings] = useState([]);

  useEffect(function() {
    let cancelled = false;
    api('/api/companies/' + encodeURIComponent(company.id) + '/dian-config')
      .then(function(r) {
        if (cancelled) return;
        setConfig(r.data);
        setForm(function(prev) {
          return {
            ...prev,
            softwareId: r.data.softwareId || '',
            testSetId: r.data.testSetId || '',
            environment: r.data.environment || '2'
          };
        });
      })
      .catch(function(err) { if (!cancelled) setError(err.message); });
    return function() { cancelled = true; };
  }, [company.id]);

  function update(field) {
    return function(event) {
      const value = event.target.value;
      setForm(function(prev) { return { ...prev, [field]: value }; });
    };
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    setWarnings([]);

    try {
      const body = {
        softwareId: form.softwareId,
        pin: form.pin,
        testSetId: form.testSetId,
        environment: form.environment
      };

      if (file) {
        body.certificateP12Base64 = await readFileAsBase64(file);
        body.certificatePassword = form.password;
      }

      const r = await api('/api/companies/' + encodeURIComponent(company.id) + '/dian-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      setConfig(r.data);
      setWarnings(r.data.warnings || []);
      setFile(null);
      setForm(function(prev) { return { ...prev, pin: '', password: '' }; });
      setNotice('Habilitación DIAN guardada.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Habilitación DIAN" style={{ width: 'min(620px, 100%)' }}>
        <div className="modal-header">
          <h3>🏛️ Habilitación DIAN · {company.name}</h3>
          <button className="btn" aria-label="Cerrar" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={save}>
          <div className="modal-body">
            <div className="info-box" style={{ marginBottom: '12px' }}>
              La nómina electrónica de esta empresa se reporta con su NIT ({company.nit}), su certificado
              digital y el Software ID que la DIAN le asignó al habilitarse con "software propio".
            </div>

            {config && (
              <div className="result-section" style={{ marginBottom: '12px' }}>
                <div className="result-row">
                  <span>Estado</span>
                  <strong>{config.configured ? '✅ Configurada' : 'Sin configurar (los XML usan datos de prueba)'}</strong>
                </div>
                {config.hasCertificate && (
                  <>
                    <div className="result-row"><span>Certificado</span><strong>{config.certSubject}</strong></div>
                    <div className="result-row">
                      <span>Vence</span>
                      <strong>{new Date(config.certNotAfter).toLocaleDateString('es-CO')}</strong>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="dian-software-id">Software ID</label>
                <input id="dian-software-id" value={form.softwareId} onChange={update('softwareId')} required />
              </div>

              <div className="form-group">
                <label htmlFor="dian-pin">PIN del software</label>
                <input
                  id="dian-pin"
                  type="password"
                  autoComplete="off"
                  value={form.pin}
                  onChange={update('pin')}
                  placeholder={config && config.configured ? 'Sin cambios' : ''}
                  required={!(config && config.configured)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="dian-environment">Ambiente</label>
                <select id="dian-environment" value={form.environment} onChange={update('environment')}>
                  <option value="2">Habilitación (pruebas)</option>
                  <option value="1">Producción</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="dian-test-set">TestSetId (habilitación)</label>
                <input id="dian-test-set" value={form.testSetId} onChange={update('testSetId')} />
              </div>

              <div className="form-group">
                <label htmlFor="dian-cert">Certificado digital (.p12 / .pfx)</label>
                <input
                  id="dian-cert"
                  type="file"
                  accept=".p12,.pfx,application/x-pkcs12"
                  onChange={function(event) { setFile(event.target.files[0] || null); }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="dian-cert-password">Contraseña del certificado</label>
                <input
                  id="dian-cert-password"
                  type="password"
                  autoComplete="off"
                  value={form.password}
                  onChange={update('password')}
                  disabled={!file}
                />
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="inline-warning" role="alert" style={{ marginTop: '10px' }}>
                {warnings.map(function(w, i) { return <div key={i}>{w}</div>; })}
              </div>
            )}
            {error && <div className="inline-warning" role="alert" style={{ marginTop: '10px' }}>{error}</div>}
            {notice && (
              <div className="alert success" role="status" style={{ position: 'static', transform: 'none', width: 'auto', marginTop: '10px' }}>
                {notice}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>Cerrar</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar habilitación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DianConfigButton({ company }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="btn"
        onClick={function() { setOpen(true); }}
        aria-label="Habilitación DIAN de la empresa"
        title="Habilitación DIAN de la empresa"
      >
        🏛️ DIAN
      </button>
      {open && <DianConfigModal key={company.id} company={company} onClose={function() { setOpen(false); }} />}
    </>
  );
}

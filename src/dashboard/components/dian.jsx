// ------------------------------------------------------------
// ENVÍO A LA DIAN — firma y transmisión de la nómina electrónica
//
//   <DianSubmissionPanel settlement={...} onChanged={fn} />
//
// `settlement` es la fila de GET /api/payroll-settlements (con
// dianSubmissionStatus, dianErrors y dianSentAt). onChanged recarga
// las liquidaciones después de enviar o consultar.
// ------------------------------------------------------------

const DIAN_SUBMISSION_LABELS = {
  SENT: '⏳ En proceso en la DIAN',
  ACCEPTED: '✅ Aceptado por la DIAN',
  REJECTED: '❌ Rechazado por la DIAN'
};

async function downloadSignedDianXml(settlement) {
  const currentUser = firebase.auth().currentUser;
  const headers = {};

  if (currentUser) {
    headers.Authorization = 'Bearer ' + await currentUser.getIdToken();
  }

  const response = await fetch(
    '/api/payroll-settlements/' + encodeURIComponent(settlement.id) + '/dian/signed-xml',
    { headers: headers }
  );

  if (!response.ok) {
    throw new Error('No se pudo descargar el XML firmado.');
  }

  downloadText('nomina-' + (settlement.dianConsecutive || settlement.id) + '-firmada.xml', await response.text(), 'application/xml');
}

function DianSubmissionPanel({ settlement, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!settlement || settlement.dianStatus !== 'GENERATED') {
    return null;
  }

  const status = settlement.dianSubmissionStatus || null;
  const errors = settlement.dianErrors || [];

  async function run(action) {
    setBusy(true);
    setMessage('');
    setError('');

    try {
      const result = await api(
        '/api/payroll-settlements/' + encodeURIComponent(settlement.id) + '/dian/' + action,
        { method: 'POST' }
      );
      const data = result.data || {};
      setMessage(DIAN_SUBMISSION_LABELS[data.dianSubmissionStatus] || 'Listo.');
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setError('');

    try {
      await downloadSignedDianXml(settlement);
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

      {settlement.dianSentAt && (
        <div className="result-row">
          <span>Último envío</span>
          <strong>{new Date(settlement.dianSentAt).toLocaleString('es-CO')}</strong>
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

        {settlement.dianSentAt && (
          <button className="btn" onClick={download}>⬇️ XML firmado</button>
        )}
      </div>

      {message && <div className="alert success" role="status" style={{position: 'static', transform: 'none', width: 'auto', marginTop: '10px'}}>{message}</div>}
      {error && <div className="inline-warning" role="alert" style={{marginTop: '10px'}}>{error}</div>}
    </div>
  );
}

// ------------------------------------------------------------
// Comprobante contable de nómina (cuentas PUC)
//
//   <AccountingButton period={...} />   botón + modal de descarga
// El asiento lo arma GET /api/payroll-periods/:id/accounting.
// ------------------------------------------------------------

function AccountingModal({ period, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(function() {
    let cancelled = false;
    api('/api/payroll-periods/' + encodeURIComponent(period.id) + '/accounting')
      .then(function(r) { if (!cancelled) setData(r.data); })
      .catch(function(err) { if (!cancelled) setError(err.message); });
    return function() { cancelled = true; };
  }, [period.id]);

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Comprobante contable" style={{ width: 'min(640px, 100%)' }}>
        <div className="modal-header">
          <h3>📒 Comprobante contable · {period.periodStart} a {period.periodEnd}</h3>
          <button className="btn" aria-label="Cerrar" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error && <div className="alert" style={{ position: 'static', margin: 0 }}>{error}</div>}
          {!data && !error && <div className="info-box">Armando el comprobante…</div>}

          {data && (
            <>
              <div className="info-box">
                Asiento de nómina con {data.lines} línea(s): gasto de personal, aportes, provisiones,
                retenciones y salarios por pagar, un tercero por empleado. Impórtalo en tu software
                contable (Siigo, Alegra, World Office…) o revísalo en Excel.
              </div>

              {data.warnings.length > 0 && (
                <ul style={{ margin: '12px 0', paddingLeft: '20px', fontSize: '13px' }}>
                  {data.warnings.map(function(w, i) { return <li key={i}>{w}</li>; })}
                </ul>
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td>Total débitos</td><td style={{ textAlign: 'right' }}>{formatCOP(data.totals.debit)}</td></tr>
                  <tr><td>Total créditos</td><td style={{ textAlign: 'right' }}>{formatCOP(data.totals.credit)}</td></tr>
                  <tr style={{ fontWeight: 700 }}>
                    <td>Diferencia</td>
                    <td style={{ textAlign: 'right' }}>
                      {data.totals.debit === data.totals.credit ? '✅ Cuadrado' : formatCOP(data.totals.debit - data.totals.credit)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cerrar</button>
          {data && (
            <button
              className="btn btn-primary"
              onClick={function() { downloadText(data.fileName, '﻿' + data.content, 'text/csv;charset=utf-8'); }}
            >
              ⬇️ Descargar comprobante (CSV)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Botón "📒 Comprobante contable" con su modal (barra del periodo). */
function AccountingButton({ period }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn" onClick={function() { setOpen(true); }}>📒 Comprobante contable</button>
      {open && <AccountingModal period={period} onClose={function() { setOpen(false); }} />}
    </>
  );
}

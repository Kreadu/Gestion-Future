import React, { useState } from 'react';

export interface BulkImportEmployeeRow {
  id: string;
  taxId: string;
  firstName: string;
  lastName: string;
  baseSalaryMonthly: number;
  contractType: string;
  arlRiskLevel: number;
  bankCode: string;
  bankAccount: string;
  status: 'valid' | 'invalid';
  errorMessage?: string;
}

export const BulkEmployeeImportExport: React.FC = () => {
  const [dragActive, setDragActive] = useState(false);
  const [parsedRows, setParsedRows] = useState<BulkImportEmployeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validar fila de empleado
  const validateRow = (row: any, index: number): BulkImportEmployeeRow => {
    const errors: string[] = [];

    if (!row.taxId) errors.push('Tax ID requerido');
    if (!row.firstName) errors.push('Nombre requerido');
    if (!row.lastName) errors.push('Apellido requerido');
    if (!row.baseSalaryMonthly || row.baseSalaryMonthly <= 0) errors.push('Salario inválido');
    if (!row.contractType) errors.push('Tipo de contrato requerido');
    if (!row.arlRiskLevel || row.arlRiskLevel < 1 || row.arlRiskLevel > 5) errors.push('Nivel ARL inválido');
    if (!row.bankCode) errors.push('Código banco requerido');
    if (!row.bankAccount) errors.push('Cuenta bancaria requerida');

    return {
      id: row.id || `emp_${Date.now()}_${index}`,
      taxId: row.taxId || '',
      firstName: row.firstName || '',
      lastName: row.lastName || '',
      baseSalaryMonthly: parseFloat(row.baseSalaryMonthly) || 0,
      contractType: row.contractType || '',
      arlRiskLevel: parseInt(row.arlRiskLevel) || 1,
      bankCode: row.bankCode || '',
      bankAccount: row.bankAccount || '',
      status: errors.length === 0 ? 'valid' : 'invalid',
      errorMessage: errors.length > 0 ? errors.join('; ') : undefined,
    };
  };

  // Procesar archivo CSV
  const processFile = (file: File) => {
    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const lines = content.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          setError('El archivo debe contener encabezados y al menos una fila');
          setLoading(false);
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const rows: BulkImportEmployeeRow[] = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          const rowObj: any = {};

          headers.forEach((header, index) => {
            rowObj[header] = values[index] || '';
          });

          rows.push(validateRow(rowObj, i));
        }

        setParsedRows(rows);
      } catch (err) {
        setError(`Error al procesar archivo: ${err instanceof Error ? err.message : 'Error desconocido'}`);
      } finally {
        setLoading(false);
      }
    };

    reader.readAsText(file);
  };

  // Manejar drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files?.length) {
      processFile(files[0]);
    }
  };

  // Manejar selección de archivo
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) {
      processFile(files[0]);
    }
  };

  // Exportar a CSV
  const exportToCSV = () => {
    if (parsedRows.length === 0) {
      setError('No hay datos para exportar');
      return;
    }

    const headers = [
      'id',
      'taxId',
      'firstName',
      'lastName',
      'baseSalaryMonthly',
      'contractType',
      'arlRiskLevel',
      'bankCode',
      'bankAccount',
      'status',
      'errorMessage',
    ];

    const csvContent = [
      headers.join(','),
      ...parsedRows.map(row =>
        [
          row.id,
          row.taxId,
          row.firstName,
          row.lastName,
          row.baseSalaryMonthly,
          row.contractType,
          row.arlRiskLevel,
          row.bankCode,
          row.bankAccount,
          row.status,
          row.errorMessage || '',
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk_employees_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Limpiar datos
  const handleClear = () => {
    setParsedRows([]);
    setError(null);
  };

  const validCount = parsedRows.filter(r => r.status === 'valid').length;
  const invalidCount = parsedRows.filter(r => r.status === 'invalid').length;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1>Importación/Exportación Masiva de Empleados</h1>

      {/* Zona de carga */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragActive ? '#007bff' : '#ddd'}`,
          borderRadius: '8px',
          padding: '40px',
          textAlign: 'center',
          backgroundColor: dragActive ? '#f0f8ff' : '#fafafa',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          marginBottom: '20px',
        }}
      >
        <input
          type="file"
          accept=".csv"
          onChange={handleFileInput}
          style={{ display: 'none' }}
          id="fileInput"
        />
        <label htmlFor="fileInput" style={{ cursor: 'pointer' }}>
          <p style={{ fontSize: '16px', margin: '0 0 10px 0' }}>
            {loading ? '⏳ Procesando...' : '📁 Arrastra un archivo CSV aquí o haz clic'}
          </p>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
            Formato esperado: CSV con columnas (taxId, firstName, lastName, baseSalaryMonthly, contractType, arlRiskLevel, bankCode, bankAccount)
          </p>
        </label>
      </div>

      {/* Mensajes de error */}
      {error && (
        <div
          style={{
            padding: '12px',
            backgroundColor: '#f8d7da',
            border: '1px solid #f5c6cb',
            borderRadius: '4px',
            color: '#721c24',
            marginBottom: '20px',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Estadísticas */}
      {parsedRows.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '15px',
            marginBottom: '20px',
          }}
        >
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            <strong>Total:</strong> {parsedRows.length}
          </div>
          <div style={{ padding: '15px', backgroundColor: '#d4edda', borderRadius: '4px' }}>
            <strong>✓ Válidos:</strong> {validCount}
          </div>
          <div style={{ padding: '15px', backgroundColor: '#f8d7da', borderRadius: '4px' }}>
            <strong>✗ Inválidos:</strong> {invalidCount}
          </div>
        </div>
      )}

      {/* Tabla de resultados */}
      {parsedRows.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>
                  Estado
                </th>
                <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>
                  Tax ID
                </th>
                <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>
                  Nombre
                </th>
                <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>
                  Apellido
                </th>
                <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>
                  Salario
                </th>
                <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>
                  Contrato
                </th>
                <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>
                  Error
                </th>
              </tr>
            </thead>
            <tbody>
              {parsedRows.map((row) => (
                <tr
                  key={row.id}
                  style={{
                    backgroundColor: row.status === 'invalid' ? '#fff5f5' : '#f5fff5',
                  }}
                >
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                    {row.status === 'valid' ? '✅' : '❌'}
                  </td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>{row.taxId}</td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>{row.firstName}</td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>{row.lastName}</td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                    ${row.baseSalaryMonthly.toLocaleString()}
                  </td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                    {row.contractType}
                  </td>
                  <td
                    style={{
                      padding: '10px',
                      border: '1px solid #ddd',
                      fontSize: '12px',
                      color: '#dc3545',
                    }}
                  >
                    {row.errorMessage}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Botones de acción */}
      {parsedRows.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleClear}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Limpiar
          </button>
          <button
            onClick={exportToCSV}
            style={{
              padding: '10px 20px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            📥 Descargar CSV
          </button>
          <button
            onClick={() => alert(`Importar ${validCount} empleados válidos`)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: validCount === 0 ? 0.5 : 1,
            }}
            disabled={validCount === 0}
          >
            ✓ Importar ({validCount})
          </button>
        </div>
      )}
    </div>
  );
};

export default BulkEmployeeImportExport;

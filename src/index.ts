import ColombiaPayrollEngine from './engine/countries/colombiaEngine';
import type {
  ColombiaPayrollInput,
  ColombiaPayrollResult,
} from './types/payroll';

import { DianNominaXmlService } from './services/dianNominaXmlService';
interface DianEmployerInfo {
  nit: string;
  dv: string;
  companyName: string;
  softwareId: string;
  pinSoftware: string;
  testSetId?: string;
}

interface DianEmployeeExtraInfo {
  typeDocument: '13' | '31' | '22' | '41' | '42';
  typeContract: '1' | '2' | '3' | '4' | '5';
  paymentMethod: '10' | '42' | '20';
  bankName?: string;
  accountNumber?: string;
  accountType?: 'AHORROS' | 'CORRIENTE';
}

import { BankDisbursementService } from './services/bankDisbursement';

interface Env {
  DB: D1Database;
}

interface Company {
  logo?: string;
  id: string;
  name: string;
  nit: string;
  dv?: string | null;
  address?: string | null;
  city?: string | null;
  department?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  contactName?: string | null;
  legalRepresentative?: string | null;
  taxRegime?: string | null;
  economicActivity?: string | null;
  active: boolean | number;
  createdAt?: string | null;
}

interface Employee {
  id: string;
  companyId: string;
  firstName: string;
  firstName2?: string | null;
  lastName: string;
  lastName2?: string | null;
  taxId: string;
  position?: string | null;
  contractType?: string | null;
  salary: number;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  hireDate?: string | null;
  active: boolean | number;
  createdAt?: string | null;
}

function sendJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function normalizeCompany(row: any): Company {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    nit: String(row.nit ?? ''),
    dv: row.dv ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    department: row.department ?? null,
    postalCode: row.postalCode ?? null,
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    email: row.email ?? null,
    contactName: row.contactName ?? null,
    legalRepresentative: row.legalRepresentative ?? null,
    taxRegime: row.taxRegime ?? null,
    economicActivity: row.economicActivity ?? null,
    active: !!row.active,
    createdAt: row.createdAt ?? null,
  };
}

function normalizeEmployee(row: any): Employee {
  return {
    id: String(row.id),
    companyId: String(row.companyId),
    firstName: String(row.firstName ?? ''),
    firstName2: row.firstName2 ?? null,
    lastName: String(row.lastName ?? ''),
    lastName2: row.lastName2 ?? null,
    taxId: String(row.taxId ?? ''),
    position: row.position ?? null,
    contractType: row.contractType ?? null,
    salary: Number(row.salary ?? 0),
    address: row.address ?? null,
    city: row.city ?? null,
    country: row.country ?? 'Colombia',
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    hireDate: row.hireDate ?? null,
    active: !!row.active,
    createdAt: row.createdAt ?? null,
  };
}

function getEmployeeFullName(employee: Employee): string {
  return [
    employee.firstName,
    employee.firstName2,
    employee.lastName,
    employee.lastName2,
  ]
    .filter(Boolean)
    .join(' ');
}

function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kreadu Gestión-Future | Dashboard Nómina</title>

  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #07111f;
      color: #e5edf7;
    }

    button,
    input,
    select {
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    .app {
      min-height: 100vh;
      background:
        radial-gradient(circle at top left, rgba(30, 64, 175, .18), transparent 30%),
        radial-gradient(circle at bottom right, rgba(6, 182, 212, .10), transparent 28%),
        #07111f;
    }

    .header {
      min-height: 76px;
      padding: 14px 24px;
      border-bottom: 1px solid #1d3047;
      background: rgba(7, 17, 31, .96);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      position: sticky;
      top: 0;
      z-index: 20;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 13px;
      min-width: 250px;
    }

    .brand-logo {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: linear-gradient(135deg, #2563eb, #06b6d4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      color: white;
    }

    .brand h1 {
      margin: 0;
      font-size: 18px;
    }

    .brand p {
      margin: 3px 0 0;
      color: #8193aa;
      font-size: 12px;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .badge {
      padding: 7px 11px;
      border: 1px solid #245174;
      background: rgba(8, 47, 73, .55);
      border-radius: 999px;
      color: #67e8f9;
      font-size: 12px;
      font-weight: 700;
    }

    .company-selector {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .company-selector select {
      min-width: 220px;
    }

    .layout {
      display: grid;
      grid-template-columns: 310px minmax(420px, 1fr) 390px;
      min-height: calc(100vh - 76px);
    }

    .panel {
      border-right: 1px solid #1d3047;
      min-width: 0;
    }

    .panel:last-child {
      border-right: none;
    }

    .panel-header {
      padding: 18px 18px 14px;
      border-bottom: 1px solid #1d3047;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .panel-header h2 {
      font-size: 14px;
      margin: 0;
    }

    .panel-header span {
      color: #6f839b;
      font-size: 12px;
    }

    .panel-body {
      padding: 18px;
    }

    .employee-list {
      padding: 10px;
    }

    .employee-card {
      padding: 13px;
      margin-bottom: 8px;
      border: 1px solid #1c3047;
      border-radius: 11px;
      background: #0b1829;
      transition: .15s ease;
      cursor: pointer;
    }

    .employee-card:hover,
    .employee-card.selected {
      border-color: #2563eb;
      background: #0e2036;
    }

    .employee-name {
      font-weight: 700;
      font-size: 13px;
    }

    .employee-meta {
      color: #7890a9;
      font-size: 11px;
      margin-top: 5px;
      line-height: 1.5;
    }

    .employee-salary {
      color: #67e8f9;
      font-size: 12px;
      font-weight: 700;
      margin-top: 8px;
    }

    .empty {
      color: #6f839b;
      text-align: center;
      padding: 40px 20px;
      font-size: 13px;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 13px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group.full {
      grid-column: 1 / -1;
    }

    label {
      font-size: 11px;
      color: #8fa2b8;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .03em;
    }

    input,
    select {
      width: 100%;
      padding: 10px 11px;
      border: 1px solid #253a53;
      border-radius: 8px;
      background: #091625;
      color: #e5edf7;
      outline: none;
    }

    input:focus,
    select:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, .12);
    }

    input:disabled,
    select:disabled {
      opacity: .65;
    }

    .button-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 17px;
    }

    .btn {
      border: 1px solid #29415d;
      background: #102238;
      color: #dbeafe;
      border-radius: 8px;
      padding: 9px 13px;
      font-size: 12px;
      font-weight: 700;
    }

    .btn:hover {
      border-color: #3b82f6;
    }

    .btn-primary {
      background: #2563eb;
      border-color: #2563eb;
      color: white;
    }

    .btn-primary:hover {
      background: #1d4ed8;
    }

    .btn-success {
      background: #047857;
      border-color: #059669;
      color: white;
    }

    .btn-danger {
      background: rgba(127, 29, 29, .35);
      border-color: #7f1d1d;
      color: #fecaca;
    }

    .section {
      margin-bottom: 20px;
    }

    .section-title {
      font-size: 12px;
      font-weight: 800;
      color: #c5d5e8;
      margin-bottom: 11px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .info-box {
      border: 1px solid #203750;
      background: #0a1727;
      padding: 12px;
      border-radius: 9px;
      font-size: 12px;
      color: #94a9c0;
    }

    .selected-employee {
      border: 1px solid #164e63;
      background: rgba(8, 47, 73, .30);
      padding: 12px;
      border-radius: 9px;
      margin-bottom: 18px;
    }

    .selected-employee strong {
      color: #67e8f9;
    }

    .result-summary {
      padding: 18px;
      border-bottom: 1px solid #1d3047;
      background: linear-gradient(180deg, rgba(13, 39, 66, .55), rgba(7, 17, 31, 0));
    }

    .result-label {
      color: #7890a9;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
    }

    .net-pay {
      font-size: 29px;
      font-weight: 900;
      color: #67e8f9;
      margin-top: 4px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
      margin-top: 14px;
    }

    .summary-card {
      border: 1px solid #203750;
      border-radius: 9px;
      padding: 11px;
      background: #0a1727;
    }

    .summary-card span {
      display: block;
      color: #70869e;
      font-size: 10px;
      margin-bottom: 5px;
    }

    .summary-card strong {
      font-size: 13px;
    }

    .result-body {
      padding: 18px;
      overflow-y: auto;
      max-height: calc(100vh - 260px);
    }

    .result-row {
      display: flex;
      justify-content: space-between;
      gap: 15px;
      padding: 8px 0;
      border-bottom: 1px solid #15263a;
      font-size: 12px;
    }

    .result-row span:first-child {
      color: #8ca0b5;
    }

    .result-row strong {
      color: #dbeafe;
    }

    .result-section {
      margin-bottom: 18px;
    }

    .result-section h3 {
      margin: 0 0 8px;
      font-size: 12px;
      color: #c7d8ea;
    }

    pre {
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 280px;
      overflow: auto;
      background: #050d17;
      border: 1px solid #1c3047;
      border-radius: 8px;
      padding: 10px;
      font-size: 10px;
      color: #9fb3c8;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, .68);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 20px;
    }

    .modal {
      width: min(720px, 100%);
      max-height: 90vh;
      overflow-y: auto;
      border: 1px solid #29415d;
      border-radius: 14px;
      background: #091625;
      box-shadow: 0 25px 70px rgba(0, 0, 0, .45);
    }

    .modal-header {
      padding: 17px 19px;
      border-bottom: 1px solid #1d3047;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-header h3 {
      margin: 0;
      font-size: 15px;
    }

    .modal-body {
      padding: 19px;
    }

    .modal-footer {
      padding: 14px 19px;
      border-top: 1px solid #1d3047;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .alert {
      margin: 14px 18px;
      padding: 11px 13px;
      border-radius: 8px;
      border: 1px solid #7f1d1d;
      background: rgba(127, 29, 29, .2);
      color: #fecaca;
      font-size: 12px;
    }

    .success {
      border-color: #065f46;
      background: rgba(6, 95, 70, .18);
      color: #a7f3d0;
    }

    @media (max-width: 1250px) {
      .layout {
        grid-template-columns: 280px minmax(400px, 1fr);
      }

      .layout > .panel:nth-child(3) {
        grid-column: 1 / -1;
        border-top: 1px solid #1d3047;
      }

      .result-body {
        max-height: none;
      }
    }

    @media (max-width: 850px) {
      .header {
        align-items: flex-start;
        flex-direction: column;
      }

      .header-right {
        width: 100%;
        justify-content: flex-start;
      }

      .layout {
        display: block;
      }

      .panel {
        border-right: none;
        border-bottom: 1px solid #1d3047;
      }

      .form-grid {
        grid-template-columns: 1fr;
      }

      .form-group.full {
        grid-column: auto;
      }
    }
  </style>
</head>

<body>
<div id="root"></div>

<script type="text/babel">
const { useEffect, useState } = React;

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

async function api(url, options) {
  const response = await fetch(url, options);
  let data = {};

  try {
    data = await response.json();
  } catch (_) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || 'Error en la solicitud');
  }

  return data;
}

function App() {
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);

  const [companyModal, setCompanyModal] = useState(false);
  const [employeeModal, setEmployeeModal] = useState(false);

  const [editingCompany, setEditingCompany] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const [companyForm, setCompanyForm] = useState({
    logo: '',
    name: '',
    nit: '',
    dv: '',
    address: '',
    city: 'Popayán',
    department: 'Cauca',
    postalCode: '190001',
    phone: '',
    whatsapp: '',
    email: '',
    contactName: '',
    legalRepresentative: '',
    taxRegime: 'ORDINARIO',
    economicActivity: ''
  });

  const [employeeForm, setEmployeeForm] = useState({
    firstName: '',
    firstName2: '',
    lastName: '',
    lastName2: '',
    taxId: '',
    position: '',
    contractType: '1',
    salary: '',
    address: '',
    city: 'Popayán',
    country: 'Colombia',
    phone: '',
    whatsapp: '',
    hireDate: ''
  });

  const [payrollForm, setPayrollForm] = useState({
    employeeId: '',
    baseSalary: '',
    daysWorked: 30,
    extraDiurna: 0,
    extraNocturna: 0,
    recargoNocturno: 0
  });

  const [payrollResult, setPayrollResult] = useState(null);
  const [dianXmlResult, setDianXmlResult] = useState(null);
  const [showPayrollPreview, setShowPayrollPreview] = useState(false);
  const [disbursementResult, setDisbursementResult] = useState(null);

  const selectedCompany = companies.find(function(c) {
    return c.id === selectedCompanyId;
  });

  useEffect(function() {
    loadCompanies();
  }, []);

  useEffect(function() {
    if (selectedCompanyId) {
      loadEmployees(selectedCompanyId);
    } else {
      setEmployees([]);
      setSelectedEmp(null);
      clearPayrollForm();
    }
  }, [selectedCompanyId]);

  async function loadCompanies() {
    try {
      setError('');
      const result = await api('/api/companies');
      const list = Array.isArray(result.data) ? result.data : [];

      setCompanies(list);

      if (list.length > 0) {
        setSelectedCompanyId(function(current) {
          return current && list.some(function(c) { return c.id === current; })
            ? current
            : list[0].id;
        });
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadEmployees(companyId) {
    try {
      setError('');
      const result = await api(
        '/api/employees?companyId=' + encodeURIComponent(companyId)
      );

      setEmployees(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setError(err.message);
      setEmployees([]);
    }
  }

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  function clearPayrollForm() {
    setSelectedEmp(null);

    setPayrollForm({
      employeeId: '',
      baseSalary: '',
      daysWorked: 30,
      extraDiurna: 0,
      extraNocturna: 0,
      recargoNocturno: 0
    });

    setPayrollResult(null);
    setDianXmlResult(null);
    setDisbursementResult(null);
  }

  function selectEmployeeForPayroll(employee) {
    clearMessages();

    setSelectedEmp(employee);

    setPayrollForm({
      employeeId: employee.id,
      baseSalary: employee.salary,
      daysWorked: 30,
      extraDiurna: 0,
      extraNocturna: 0,
      recargoNocturno: 0
    });

    setPayrollResult(null);
    setDianXmlResult(null);
    setDisbursementResult(null);
  }

  function openNewCompany() {
    clearMessages();

    setEditingCompany(null);

    setCompanyForm({
      name: '',
      nit: '',
      dv: '',
      address: '',
      city: 'Popayán',
      department: 'Cauca',
      postalCode: '190001',
      phone: '',
      whatsapp: '',
      email: '',
      contactName: '',
      legalRepresentative: '',
      taxRegime: 'ORDINARIO',
      economicActivity: ''
    });

    setCompanyModal(true);
  }

  function openEditCompany() {
    if (!selectedCompany) return;

    clearMessages();
    setEditingCompany(selectedCompany);

    setCompanyForm({
      name: selectedCompany.name || '',
      nit: selectedCompany.nit || '',
      dv: selectedCompany.dv || '',
      address: selectedCompany.address || '',
      city: selectedCompany.city || '',
      department: selectedCompany.department || '',
      postalCode: selectedCompany.postalCode || '',
      phone: selectedCompany.phone || '',
      whatsapp: selectedCompany.whatsapp || '',
      email: selectedCompany.email || '',
      contactName: selectedCompany.contactName || '',
      legalRepresentative: selectedCompany.legalRepresentative || '',
      taxRegime: selectedCompany.taxRegime || 'ORDINARIO',
      economicActivity: selectedCompany.economicActivity || ''
    });

    setCompanyModal(true);
  }

  async function saveCompany() {
    try {
      clearMessages();

      if (!companyForm.name.trim()) {
        throw new Error('El nombre de la empresa es obligatorio.');
      }

      if (!companyForm.nit.trim()) {
        throw new Error('El NIT de la empresa es obligatorio.');
      }

      setLoading(true);

      const payload = {
        ...companyForm
      };

      if (editingCompany) {
        await api('/api/companies/' + encodeURIComponent(editingCompany.id), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        setSuccess('Empresa actualizada correctamente.');
      } else {
        const result = await api('/api/companies', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        setSuccess('Empresa creada correctamente.');

        if (result.data && result.data.id) {
          setSelectedCompanyId(result.data.id);
        }
      }

      setCompanyModal(false);
      await loadCompanies();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteCompany() {
    if (!selectedCompany) return;

    const confirmed = window.confirm(
      '¿Deseas eliminar la empresa "' +
      selectedCompany.name +
      '"?'
    );

    if (!confirmed) return;

    try {
      clearMessages();
      setLoading(true);

      await api('/api/companies/' + encodeURIComponent(selectedCompany.id), {
        method: 'DELETE'
      });

      setSuccess('Empresa eliminada correctamente.');
      setSelectedCompanyId('');
      await loadCompanies();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openNewEmployee() {
    if (!selectedCompany) {
      setError('Primero debes crear o seleccionar una empresa.');
      return;
    }

    clearMessages();
    setEditingEmployee(null);

    setEmployeeForm({
      firstName: '',
      firstName2: '',
      lastName: '',
      lastName2: '',
      taxId: '',
      position: '',
      contractType: '1',
      salary: '',
      address: '',
      city: selectedCompany.city || 'Popayán',
      country: 'Colombia',
      phone: '',
      whatsapp: '',
      hireDate: ''
    });

    setEmployeeModal(true);
  }

  function openEditEmployee(employee) {
    clearMessages();

    setEditingEmployee(employee);

    setEmployeeForm({
      firstName: employee.firstName || '',
      firstName2: employee.firstName2 || '',
      lastName: employee.lastName || '',
      lastName2: employee.lastName2 || '',
      taxId: employee.taxId || '',
      position: employee.position || '',
      contractType: employee.contractType || '1',
      salary: employee.salary || '',
      address: employee.address || '',
      city: employee.city || '',
      country: employee.country || 'Colombia',
      phone: employee.phone || '',
      whatsapp: employee.whatsapp || '',
      hireDate: employee.hireDate || ''
    });

    setEmployeeModal(true);
  }

  async function saveEmployee() {
    try {
      clearMessages();

      if (!selectedCompany) {
        throw new Error('No hay una empresa seleccionada.');
      }

      if (!employeeForm.firstName.trim()) {
        throw new Error('El primer nombre es obligatorio.');
      }

      if (!employeeForm.lastName.trim()) {
        throw new Error('El primer apellido es obligatorio.');
      }

      if (!employeeForm.taxId.trim()) {
        throw new Error('El documento del empleado es obligatorio.');
      }

      const salary = Number(employeeForm.salary);

      if (!Number.isFinite(salary) || salary <= 0) {
        throw new Error('El salario debe ser mayor que cero.');
      }

      setLoading(true);

      const payload = {
        ...employeeForm,
        salary,
        companyId: selectedCompany.id
      };

      if (editingEmployee) {
        await api('/api/employees/' + encodeURIComponent(editingEmployee.id), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        setSuccess('Empleado actualizado correctamente.');
      } else {
        await api('/api/employees', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        setSuccess('Empleado creado correctamente.');
      }

      setEmployeeModal(false);
      await loadEmployees(selectedCompany.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteEmployee(employee) {
    const confirmed = window.confirm(
      '¿Deseas eliminar a "' +
      employee.firstName +
      ' ' +
      employee.lastName +
      '"?'
    );

    if (!confirmed) return;

    try {
      clearMessages();
      setLoading(true);

      await api('/api/employees/' + encodeURIComponent(employee.id), {
        method: 'DELETE'
      });

      setSuccess('Empleado eliminado correctamente.');

      if (selectedEmp && selectedEmp.id === employee.id) {
        clearPayrollForm();
      }

      await loadEmployees(selectedCompanyId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function calculatePayroll() {
    try {
      clearMessages();

      if (!payrollForm.employeeId) {
        throw new Error('Selecciona un empleado.');
      }

      const daysWorked = Number(payrollForm.daysWorked);

      if (!Number.isFinite(daysWorked) || daysWorked < 1 || daysWorked > 30) {
        throw new Error('Los días trabajados deben estar entre 1 y 30.');
      }

      setLoading(true);

      const result = await api('/api/colombia/payroll/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          employeeInput: {
            employeeId: payrollForm.employeeId,
            daysWorked,
            overtimeHours: {
              extraDiurna: Number(payrollForm.extraDiurna) || 0,
              extraNocturna: Number(payrollForm.extraNocturna) || 0,
              recargoNocturno: Number(payrollForm.recargoNocturno) || 0
            }
          }
        })
      });

      setPayrollResult(result.data);
      setDianXmlResult(null);
      setDisbursementResult(null);
      setSuccess('Nómina calculada correctamente.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateDianXml() {
    try {
      clearMessages();

      if (!payrollResult) {
        throw new Error('Primero debes calcular la nómina.');
      }

      if (!selectedCompany) {
        throw new Error('No hay una empresa seleccionada.');
      }

      setLoading(true);

      const result = await api('/api/colombia/dian/xml', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          payrollData: payrollResult,

          employerInfo: {
            nit: selectedCompany.nit,
            dv: selectedCompany.dv || '0',
            companyName: selectedCompany.name,
            softwareId: 'SOFT-KREADU-2026',
            pinSoftware: '12345'
          },

          employeeExtra: {
            typeDocument: '13',
            typeContract: '1',
            paymentMethod: '42'
          },

          consecutiveNumber: 1
        })
      });

      setDianXmlResult(result.data);
      setSuccess('XML de nómina generado.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateBankFile() {
    try {
      clearMessages();

      if (!payrollResult) {
        throw new Error('Primero debes calcular la nómina.');
      }

      if (!selectedCompany) {
        throw new Error('No hay una empresa seleccionada.');
      }

      setLoading(true);

      const employee = selectedEmp;

      const result = await api('/api/colombia/bank-disbursement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          companyInfo: {
            nit: selectedCompany.nit,
            name: selectedCompany.name
          },

          records: [
            {
              employeeId: payrollResult.employeeId,
              employeeName: payrollResult.employeeName,
              taxId: payrollResult.taxId,
              amount: payrollResult.netPay,
              bankName: '',
              accountNumber: '',
              accountType: 'AHORROS',
              phone: employee ? employee.phone || '' : ''
            }
          ]
        })
      });

      setDisbursementResult(result.data);
      setSuccess('Archivo bancario generado.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function renderPayrollResult() {
    if (!payrollResult) {
      return (
        <div className="empty">
          <div style={{fontSize: '30px', marginBottom: '10px'}}>📊</div>
          Selecciona un empleado y calcula la nómina para ver los resultados.
        </div>
      );
    }

    const deductions = payrollResult.employeeDeductions || {};
    const employer = payrollResult.employerContributions || {};
    const provisions = payrollResult.provisions || {};

    return (
      <>
        <div className="result-summary">
          <div className="result-label">Neto a pagar</div>
          <div className="net-pay">
            {formatCOP(payrollResult.netPay)}
          </div>

          <div className="summary-grid">
            <div className="summary-card">
              <span>TOTAL DEVENGADO</span>
              <strong>{formatCOP(payrollResult.grossEarnings)}</strong>
            </div>

            <div className="summary-card">
              <span>DEDUCCIONES</span>
              <strong>{formatCOP(deductions.totalDeductions)}</strong>
            </div>
          </div>
        </div>

        <div className="result-body">
          <div className="result-section">
            <h3>👤 Empleado</h3>

            <div className="result-row">
              <span>Nombre</span>
              <strong>{payrollResult.employeeName}</strong>
            </div>

            <div className="result-row">
              <span>Documento</span>
              <strong>{payrollResult.taxId}</strong>
            </div>

            <div className="result-row">
              <span>Días trabajados</span>
              <strong>{payrollResult.daysWorked}</strong>
            </div>
          </div>

          <div className="result-section">
            <h3>💰 Devengados</h3>

            <div className="result-row">
              <span>Salario</span>
              <strong>{formatCOP(payrollResult.baseSalaryEarned)}</strong>
            </div>

            <div className="result-row">
              <span>Auxilio transporte</span>
              <strong>{formatCOP(payrollResult.earnedAuxTransporte)}</strong>
            </div>

            <div className="result-row">
              <span>Extra diurna</span>
              <strong>{formatCOP(payrollResult.extraDiurnaValue)}</strong>
            </div>

            <div className="result-row">
              <span>Extra nocturna</span>
              <strong>{formatCOP(payrollResult.extraNocturnaValue)}</strong>
            </div>

            <div className="result-row">
              <span>Recargo nocturno</span>
              <strong>{formatCOP(payrollResult.recargoNocturnoValue)}</strong>
            </div>

            <div className="result-row">
              <span>Total devengado</span>
              <strong>{formatCOP(payrollResult.grossEarnings)}</strong>
            </div>
          </div>

          <div className="result-section">
            <h3>📉 Deducciones empleado</h3>

            <div className="result-row">
              <span>Salud 4%</span>
              <strong>{formatCOP(deductions.health4pct)}</strong>
            </div>

            <div className="result-row">
              <span>Pensión 4%</span>
              <strong>{formatCOP(deductions.pension4pct)}</strong>
            </div>

            <div className="result-row">
              <span>Fondo solidaridad</span>
              <strong>{formatCOP(deductions.fspValue)}</strong>
            </div>

            <div className="result-row">
              <span>Total deducciones</span>
              <strong>{formatCOP(deductions.totalDeductions)}</strong>
            </div>
          </div>

          <div className="result-section">
            <h3>🏢 Aportes empleador</h3>

            <div className="result-row">
              <span>Salud 8.5%</span>
              <strong>{formatCOP(employer.health8_5pct)}</strong>
            </div>

            <div className="result-row">
              <span>Pensión 12%</span>
              <strong>{formatCOP(employer.pension12pct)}</strong>
            </div>

            <div className="result-row">
              <span>ARL</span>
              <strong>{formatCOP(employer.arlValue)}</strong>
            </div>

            <div className="result-row">
              <span>SENA 2%</span>
              <strong>{formatCOP(employer.sena2pct)}</strong>
            </div>

            <div className="result-row">
              <span>ICBF 3%</span>
              <strong>{formatCOP(employer.icbf3pct)}</strong>
            </div>

            <div className="result-row">
              <span>Caja compensación 4%</span>
              <strong>{formatCOP(employer.ccf4pct)}</strong>
            </div>

            <div className="result-row">
              <span>Total aportes</span>
              <strong>{formatCOP(employer.totalContributions)}</strong>
            </div>
          </div>

          <div className="result-section">
            <h3>📦 Provisiones</h3>

            <div className="result-row">
              <span>Cesantías</span>
              <strong>{formatCOP(provisions.cesantias)}</strong>
            </div>

            <div className="result-row">
              <span>Intereses cesantías</span>
              <strong>{formatCOP(provisions.interesesCesantias)}</strong>
            </div>

            <div className="result-row">
              <span>Prima</span>
              <strong>{formatCOP(provisions.primaServicios)}</strong>
            </div>

            <div className="result-row">
              <span>Vacaciones</span>
              <strong>{formatCOP(provisions.vacaciones)}</strong>
            </div>

            <div className="result-row">
              <span>Total provisiones</span>
              <strong>{formatCOP(provisions.totalProvisions)}</strong>
            </div>
          </div>

          <div className="result-section">
            <h3>📊 Seguridad social</h3>

            <div className="result-row">
              <span>IBC</span>
              <strong>{formatCOP(payrollResult.ibcSecuritySocial)}</strong>
            </div>

            <div className="result-row">
              <span>Valor hora</span>
              <strong>{formatCOP(payrollResult.hourlyRate)}</strong>
            </div>
          </div>

          <div className="button-row">
            <button
              className="btn"
              onClick={() => setShowPayrollPreview(true)}
            >
              📄 Ver hoja de nómina
            </button>

            <button
              className="btn btn-success"
              onClick={generateDianXml}
              disabled={loading}
            >
              🧾 Generar XML DIAN
            </button>

            <button
              className="btn"
              onClick={generateBankFile}
              disabled={loading}
            >
              🏦 Archivo bancario
            </button>
          </div>

          {dianXmlResult && (
            <div className="result-section" style={{marginTop: '18px'}}>
              <h3>🧾 XML DIAN generado</h3>

              <div className="result-row">
                <span>CUNE</span>
                <strong>{dianXmlResult.cune}</strong>
              </div>

              <div className="result-row">
                <span>Consecutivo</span>
                <strong>{dianXmlResult.consecutive}</strong>
              </div>

              <pre>{dianXmlResult.xmlContent}</pre>
            </div>
          )}

          {disbursementResult && (
            <div className="result-section" style={{marginTop: '18px'}}>
              <h3>🏦 Archivo bancario</h3>
              <pre>
                {JSON.stringify(disbursementResult, null, 2)}
              </pre>
            </div>
          )}


          {showPayrollPreview && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.82)',
                zIndex: 9999,
                overflowY: 'auto',
                padding: '30px 15px'
              }}
            >
              <div
                style={{
                  maxWidth: '950px',
                  margin: '0 auto',
                  background: '#ffffff',
                  color: '#111827',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  boxShadow: '0 25px 70px rgba(0,0,0,0.5)'
                }}
              >
                <div
                  style={{
                    padding: '22px 28px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '15px'
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#64748b',
                        letterSpacing: '1px'
                      }}
                    >
                      KREADU GESTIÓN-FUTURE
                    </div>

                    <h2 style={{margin: '5px 0', fontSize: '22px'}}>
                      Nómina Individual
                    </h2>

                    <div style={{fontSize: '13px', color: '#64748b'}}>
                      Liquidación de nómina · Colombia
                    </div>
                  </div>

                  <button
                    className="btn"
                    onClick={() => setShowPayrollPreview(false)}
                  >
                    ✕ Cerrar
                  </button>
                </div>

                <div style={{padding: '28px'}}>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '20px',
                      marginBottom: '25px'
                    }}
                  >
                    <div
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '16px'
                      }}
                    >
                      <div style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#64748b',
                        marginBottom: '10px'
                      }}>
                        TRABAJADOR
                      </div>

                      <strong style={{fontSize: '17px'}}>
                        {payrollResult.employeeName}
                      </strong>

                      <div style={{marginTop: '7px', fontSize: '13px'}}>
                        Documento: {payrollResult.taxId}
                      </div>

                      <div style={{marginTop: '5px', fontSize: '13px'}}>
                        ID empleado: {payrollResult.employeeId}
                      </div>
                    </div>

                    <div
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '16px'
                      }}
                    >
                      <div style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#64748b',
                        marginBottom: '10px'
                      }}>
                        PERÍODO
                      </div>

                      <strong style={{fontSize: '17px'}}>
                        Nómina mensual
                      </strong>

                      <div style={{marginTop: '7px', fontSize: '13px'}}>
                        Días trabajados: {payrollResult.daysWorked}
                      </div>

                      <div style={{marginTop: '5px', fontSize: '13px'}}>
                        Moneda: COP
                      </div>
                    </div>
                  </div>

                  <h3 style={{
                    fontSize: '15px',
                    borderBottom: '2px solid #111827',
                    paddingBottom: '8px',
                    marginBottom: '10px'
                  }}>
                    Devengados
                  </h3>

                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '13px',
                    marginBottom: '25px'
                  }}>
                    <tbody>
                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Salario básico
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(payrollResult.baseSalaryEarned)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Auxilio de transporte
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(payrollResult.earnedAuxTransporte)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Horas extras diurnas
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(payrollResult.extraDiurnaValue)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Horas extras nocturnas
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(payrollResult.extraNocturnaValue)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Recargo nocturno
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(payrollResult.recargoNocturnoValue)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{
                          padding: '12px 5px',
                          fontWeight: '800'
                        }}>
                          TOTAL DEVENGADO
                        </td>
                        <td style={{
                          padding: '12px 5px',
                          textAlign: 'right',
                          fontWeight: '800'
                        }}>
                          {formatCOP(payrollResult.grossEarnings)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <h3 style={{
                    fontSize: '15px',
                    borderBottom: '2px solid #111827',
                    paddingBottom: '8px',
                    marginBottom: '10px'
                  }}>
                    Deducciones
                  </h3>

                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '13px',
                    marginBottom: '25px'
                  }}>
                    <tbody>
                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Salud · 4%
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(deductions.health4pct)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Pensión · 4%
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(deductions.pension4pct)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Fondo de solidaridad
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(deductions.fspValue)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{
                          padding: '12px 5px',
                          fontWeight: '800'
                        }}>
                          TOTAL DEDUCCIONES
                        </td>
                        <td style={{
                          padding: '12px 5px',
                          textAlign: 'right',
                          fontWeight: '800'
                        }}>
                          {formatCOP(deductions.totalDeductions)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#64748b'
                      }}>
                        NETO A PAGAR
                      </div>

                      <div style={{
                        fontSize: '28px',
                        fontWeight: '900',
                        marginTop: '5px'
                      }}>
                        {formatCOP(payrollResult.netPay)}
                      </div>
                    </div>

                    <div style={{
                      textAlign: 'right',
                      fontSize: '12px',
                      color: '#64748b'
                    }}>
                      <div>IBC Seguridad Social</div>
                      <strong style={{color: '#111827'}}>
                        {formatCOP(payrollResult.ibcSecuritySocial)}
                      </strong>
                    </div>
                  </div>

                  <div style={{
                    marginTop: '25px',
                    paddingTop: '15px',
                    borderTop: '1px solid #e5e7eb',
                    fontSize: '11px',
                    color: '#64748b'
                  }}>
                    Documento generado por Kreadu Gestión-Future.
                    Esta vista es una representación visual de la liquidación.
                    El documento técnico para nómina electrónica se encuentra
                    en el XML DIAN.
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-logo">K</div>

          <div>
            <h1>Kreadu Gestión-Future</h1>
            <p>Sistema de gestión de nómina multiempresa</p>
          </div>
        </div>

        <div className="header-right">
          <span className="badge">Motor Colombia 2026</span>

          <div className="company-selector">
            <select
              value={selectedCompanyId}
              onChange={function(e) {
                setSelectedCompanyId(e.target.value);
              }}
            >
              {companies.length === 0 && (
                <option value="">Sin empresas creadas</option>
              )}

              {companies.map(function(company) {
                return (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                );
              })}
            </select>

            <button
              className="btn"
              onClick={openEditCompany}
              disabled={!selectedCompany}
            >
              ✏️
            </button>

            <button
              className="btn btn-primary"
              onClick={openNewCompany}
            >
              🏢 + Crear Empresa
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="alert success">
          {success}
        </div>
      )}

      <main className="layout">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>👥 Empleados</h2>
              <span>
                {employees.length} registrado(s)
              </span>
            </div>

            <button
              className="btn btn-primary"
              onClick={openNewEmployee}
              disabled={!selectedCompany}
            >
              + Empleado
            </button>
          </div>

          <div className="employee-list">
            {employees.length === 0 ? (
              <div className="empty">
                No hay empleados registrados para esta empresa.
              </div>
            ) : (
              employees.map(function(employee) {
                const isSelected =
                  selectedEmp &&
                  selectedEmp.id === employee.id;

                return (
                  <div
                    key={employee.id}
                    className={
                      'employee-card' +
                      (isSelected ? ' selected' : '')
                    }
                    onClick={function() {
                      selectEmployeeForPayroll(employee);
                    }}
                  >
                    <div className="employee-name">
                      {getEmployeeName(employee)}
                    </div>

                    <div className="employee-meta">
                      CC/NIT: {employee.taxId}
                      <br />
                      {employee.position || 'Sin cargo'}
                      <br />
                      {employee.city || 'Sin ciudad'}
                    </div>

                    <div className="employee-salary">
                      {formatCOP(employee.salary)}
                    </div>

                    <div
                      className="button-row"
                      style={{marginTop: '9px'}}
                    >
                      <button
                        className="btn"
                        onClick={function(e) {
                          e.stopPropagation();
                          openEditEmployee(employee);
                        }}
                      >
                        Editar
                      </button>

                      <button
                        className="btn btn-danger"
                        onClick={function(e) {
                          e.stopPropagation();
                          deleteEmployee(employee);
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>🧮 Datos para la liquidación de nómina</h2>
              <span>Colombia 2026</span>
            </div>
          </div>

          <div className="panel-body">
            {!selectedEmp ? (
              <div className="info-box">
                Selecciona un empleado de la izquierda. Sus datos de
                identificación y salario se cargarán automáticamente.
              </div>
            ) : (
              <>
                <div className="selected-employee">
                  Empleado seleccionado:
                  <br />
                  <strong>
                    {getEmployeeName(selectedEmp)}
                  </strong>
                  <br />
                  <span>
                    Documento: {selectedEmp.taxId}
                  </span>
                </div>

                <div className="section">
                  <div className="section-title">
                    💼 Información salarial
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>Empleado</label>
                      <input
                        value={getEmployeeName(selectedEmp)}
                        disabled
                      />
                    </div>

                    <div className="form-group">
                      <label>Salario mensual</label>
                      <input
                        value={formatCOP(payrollForm.baseSalary)}
                        disabled
                      />
                    </div>

                    <div className="form-group">
                      <label>Días trabajados</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={payrollForm.daysWorked}
                        onChange={function(e) {
                          setPayrollForm({
                            ...payrollForm,
                            daysWorked: e.target.value
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="section">
                  <div className="section-title">
                    ⏱️ Horas extras y recargos
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>Extra diurna</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={payrollForm.extraDiurna}
                        onChange={function(e) {
                          setPayrollForm({
                            ...payrollForm,
                            extraDiurna: e.target.value
                          });
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label>Extra nocturna</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={payrollForm.extraNocturna}
                        onChange={function(e) {
                          setPayrollForm({
                            ...payrollForm,
                            extraNocturna: e.target.value
                          });
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label>Recargo nocturno</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={payrollForm.recargoNocturno}
                        onChange={function(e) {
                          setPayrollForm({
                            ...payrollForm,
                            recargoNocturno: e.target.value
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="button-row">
                  <button
                    className="btn btn-primary"
                    onClick={calculatePayroll}
                    disabled={loading}
                  >
                    {loading ? 'Calculando...' : '🧮 Calcular Nómina'}
                  </button>

                  <button
                    className="btn"
                    onClick={clearPayrollForm}
                    disabled={loading}
                  >
                    🧹 Limpiar formulario
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>📊 Resultado de la liquidación</h2>
              <span>Detalle completo</span>
            </div>
          </div>

          {renderPayrollResult()}
        </section>
      </main>

      {companyModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>
                {editingCompany
                  ? 'Editar empresa'
                  : 'Crear empresa'}
              </h3>

              <button
                className="btn"
                onClick={function() {
                  setCompanyModal(false);
                }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group full">
                  <label>Razón social</label>
                  <div style={{
                    marginBottom: '18px',
                    padding: '16px',
                    border: '1px solid #334155',
                    borderRadius: '10px',
                    background: '#020617'
                  }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: '700'
                    }}>
                      🖼️ Logo de la empresa
                    </label>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '15px',
                      flexWrap: 'wrap'
                    }}>
                      {companyForm.logo ? (
                        <img
                          src={companyForm.logo}
                          alt="Logo de la empresa"
                          style={{
                            width: '90px',
                            height: '90px',
                            objectFit: 'contain',
                            background: '#ffffff',
                            borderRadius: '8px',
                            padding: '6px'
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '90px',
                          height: '90px',
                          borderRadius: '8px',
                          border: '1px dashed #64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#64748b',
                          fontSize: '12px',
                          textAlign: 'center'
                        }}>
                          Sin logo
                        </div>
                      )}

                      <div>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          style={{fontSize: '12px'}}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;

                            if (file.size > 2 * 1024 * 1024) {
                              alert('El logo no puede superar 2 MB.');
                              return;
                            }

                            const reader = new FileReader();

                            reader.onload = () => {
                              setCompanyForm({
                                ...companyForm,
                                logo: String(reader.result || '')
                              });
                            };

                            reader.readAsDataURL(file);
                          }}
                        />

                        <div style={{
                          marginTop: '7px',
                          fontSize: '11px',
                          color: '#94a3b8'
                        }}>
                          PNG, JPG, WEBP o SVG · máximo 2 MB
                        </div>
                      </div>
                    </div>
                  </div>

                  <label>Nombre de la empresa</label>

                  <input
                    value={companyForm.name}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        name: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>NIT</label>
                  <input
                    value={companyForm.nit}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        nit: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Dígito verificación</label>
                  <input
                    value={companyForm.dv}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        dv: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group full">
                  <label>Dirección</label>
                  <input
                    value={companyForm.address}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        address: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Ciudad</label>
                  <input
                    value={companyForm.city}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        city: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Departamento</label>
                  <input
                    value={companyForm.department}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        department: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Código postal</label>
                  <input
                    value={companyForm.postalCode}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        postalCode: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Teléfono</label>
                  <input
                    value={companyForm.phone}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        phone: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>WhatsApp</label>
                  <input
                    value={companyForm.whatsapp}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        whatsapp: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Correo</label>
                  <input
                    type="email"
                    value={companyForm.email}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        email: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Contacto</label>
                  <input
                    value={companyForm.contactName}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        contactName: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Representante legal</label>
                  <input
                    value={companyForm.legalRepresentative}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        legalRepresentative: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Régimen tributario</label>
                  <select
                    value={companyForm.taxRegime}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        taxRegime: e.target.value
                      });
                    }}
                  >
                    <option value="ORDINARIO">Ordinario</option>
                    <option value="SIMPLE">SIMPLE</option>
                  </select>
                </div>

                <div className="form-group full">
                  <label>Actividad económica</label>
                  <input
                    value={companyForm.economicActivity}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        economicActivity: e.target.value
                      });
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              {editingCompany && (
                <button
                  className="btn btn-danger"
                  onClick={deleteCompany}
                  disabled={loading}
                >
                  Eliminar
                </button>
              )}

              <button
                className="btn"
                onClick={function() {
                  setCompanyModal(false);
                }}
              >
                Cancelar
              </button>

              <button
                className="btn btn-primary"
                onClick={saveCompany}
                disabled={loading}
              >
                {loading ? 'Guardando...' : 'Guardar empresa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {employeeModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>
                {editingEmployee
                  ? 'Editar empleado'
                  : 'Crear empleado'}
              </h3>

              <button
                className="btn"
                onClick={function() {
                  setEmployeeModal(false);
                }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Primer nombre</label>
                  <input
                    value={employeeForm.firstName}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        firstName: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Segundo nombre</label>
                  <input
                    value={employeeForm.firstName2}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        firstName2: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Primer apellido</label>
                  <input
                    value={employeeForm.lastName}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        lastName: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Segundo apellido</label>
                  <input
                    value={employeeForm.lastName2}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        lastName2: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Documento</label>
                  <input
                    value={employeeForm.taxId}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        taxId: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Cargo</label>
                  <input
                    value={employeeForm.position}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        position: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Tipo contrato DIAN</label>
                  <select
                    value={employeeForm.contractType}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        contractType: e.target.value
                      });
                    }}
                  >
                    <option value="1">Término indefinido</option>
                    <option value="2">Término fijo</option>
                    <option value="3">Obra o labor</option>
                    <option value="4">Aprendizaje</option>
                    <option value="5">Otro</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Salario mensual</label>
                  <input
                    type="number"
                    min="0"
                    value={employeeForm.salary}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        salary: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group full">
                  <label>Dirección</label>
                  <input
                    value={employeeForm.address}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        address: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Ciudad</label>
                  <input
                    value={employeeForm.city}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        city: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>País</label>
                  <input
                    value={employeeForm.country}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        country: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Teléfono</label>
                  <input
                    value={employeeForm.phone}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        phone: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>WhatsApp</label>
                  <input
                    value={employeeForm.whatsapp}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        whatsapp: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Fecha ingreso</label>
                  <input
                    type="date"
                    value={employeeForm.hireDate}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        hireDate: e.target.value
                      });
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn"
                onClick={function() {
                  setEmployeeModal(false);
                }}
              >
                Cancelar
              </button>

              <button
                className="btn btn-primary"
                onClick={saveEmployee}
                disabled={loading}
              >
                {loading ? 'Guardando...' : 'Guardar empleado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getEmployeeName(employee) {
  return [
    employee.firstName,
    employee.firstName2,
    employee.lastName,
    employee.lastName2
  ]
    .filter(Boolean)
    .join(' ');
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
</body>
</html>`;
}

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const url = new URL(request.url);

    try {
      /*
       * ============================================================
       * DASHBOARD
       * ============================================================
       */

      if (
        url.pathname === '/' ||
        url.pathname === '/dashboard'
      ) {
        return new Response(getDashboardHtml(), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        });
      }

      /*
       * ============================================================
       * EMPRESAS - LISTAR
       * ============================================================
       */

      if (
        url.pathname === '/api/companies' &&
        request.method === 'GET'
      ) {
        const result = await env.DB
          .prepare(`
            SELECT
              id,
              name,
              nit,
              dv,
              address,
              city,
              department,
              postalCode,
              phone,
              whatsapp,
              email,
              contactName,
              legalRepresentative,
              taxRegime,
              economicActivity,
              logo,
              active,
              createdAt
            FROM companies
            WHERE active = 1
            ORDER BY name ASC
          `)
          .all();

        const companies = (result.results || []).map(
          normalizeCompany
        );

        return sendJson({
          success: true,
          data: companies,
        });
      }

      /*
       * ============================================================
       * EMPRESAS - CREAR
       * ============================================================
       */

      if (
        url.pathname === '/api/companies' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;

        const name = String(body.name || '').trim();
        const nit = String(body.nit || '').trim();

        if (!name) {
          return sendJson(
            {
              success: false,
              error: 'El nombre de la empresa es obligatorio.',
            },
            400
          );
        }

        if (!nit) {
          return sendJson(
            {
              success: false,
              error: 'El NIT de la empresa es obligatorio.',
            },
            400
          );
        }

        const id = `COMP-${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();

        await env.DB
          .prepare(`
            INSERT INTO companies (
              id,
              name,
              nit,
              dv,
              address,
              city,
              department,
              postalCode,
              phone,
              whatsapp,
              email,
              contactName,
              legalRepresentative,
              taxRegime,
              economicActivity,
              logo,
              active,
              createdAt
            )
            VALUES (
              ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
              ?10, ?11, ?12, ?13, ?14, ?15, ?16, 1, ?17
            )
          `)
          .bind(
            id,
            name,
            nit,
            body.dv || null,
            body.address || null,
            body.city || null,
            body.department || null,
            body.postalCode || null,
            body.phone || null,
            body.whatsapp || null,
            body.email || null,
            body.contactName || null,
            body.legalRepresentative || null,
            body.taxRegime || null,
            body.economicActivity || null,
            body.logo || null,
            createdAt
          )
          .run();

        const row = await env.DB
          .prepare(`
            SELECT *
            FROM companies
            WHERE id = ?1
          `)
          .bind(id)
          .first();

        return sendJson(
          {
            success: true,
            data: normalizeCompany(row),
          },
          201
        );
      }

      /*
       * ============================================================
       * EMPRESA - EDITAR
       * ============================================================
       */

      const companyMatch =
        url.pathname.match(/^\/api\/companies\/([^/]+)$/);

      if (
        companyMatch &&
        request.method === 'PUT'
      ) {
        const companyId = decodeURIComponent(companyMatch[1]);
        const body = await request.json() as any;

        const existing = await env.DB
          .prepare(`
            SELECT *
            FROM companies
            WHERE id = ?1
          `)
          .bind(companyId)
          .first();

        if (!existing) {
          return sendJson(
            {
              success: false,
              error: 'Empresa no encontrada.',
            },
            404
          );
        }

        const name = String(
          body.name ?? existing.name ?? ''
        ).trim();

        const nit = String(
          body.nit ?? existing.nit ?? ''
        ).trim();

        if (!name || !nit) {
          return sendJson(
            {
              success: false,
              error: 'Nombre y NIT son obligatorios.',
            },
            400
          );
        }

        await env.DB
          .prepare(`
            UPDATE companies
            SET
              name = ?1,
              nit = ?2,
              dv = ?3,
              address = ?4,
              city = ?5,
              department = ?6,
              postalCode = ?7,
              phone = ?8,
              whatsapp = ?9,
              email = ?10,
              contactName = ?11,
              legalRepresentative = ?12,
              taxRegime = ?13,
              economicActivity = ?14,
              logo = ?15
            WHERE id = ?16
          `)
          .bind(
            name,
            nit,
            body.dv ?? null,
            body.address ?? null,
            body.city ?? null,
            body.department ?? null,
            body.postalCode ?? null,
            body.phone ?? null,
            body.whatsapp ?? null,
            body.email ?? null,
            body.contactName ?? null,
            body.legalRepresentative ?? null,
            body.taxRegime ?? null,
            body.economicActivity ?? null,
            body.logo ?? existing.logo ?? null,
            companyId
          )
          .run();

        const row = await env.DB
          .prepare(`
            SELECT *
            FROM companies
            WHERE id = ?1
          `)
          .bind(companyId)
          .first();

        return sendJson({
          success: true,
          data: normalizeCompany(row),
        });
      }

      /*
       * ============================================================
       * EMPRESA - ELIMINAR
       * ============================================================
       */

      if (
        companyMatch &&
        request.method === 'DELETE'
      ) {
        const companyId = decodeURIComponent(companyMatch[1]);

        const existing = await env.DB
          .prepare(`
            SELECT id
            FROM companies
            WHERE id = ?1
          `)
          .bind(companyId)
          .first();

        if (!existing) {
          return sendJson(
            {
              success: false,
              error: 'Empresa no encontrada.',
            },
            404
          );
        }

        await env.DB
          .prepare(`
            UPDATE companies
            SET active = 0
            WHERE id = ?1
          `)
          .bind(companyId)
          .run();

        await env.DB
          .prepare(`
            UPDATE employees
            SET active = 0
            WHERE companyId = ?1
          `)
          .bind(companyId)
          .run();

        return sendJson({
          success: true,
          message: 'Empresa eliminada correctamente.',
        });
      }

      /*
       * ============================================================
       * EMPLEADOS - LISTAR
       * ============================================================
       */

      if (
        url.pathname === '/api/employees' &&
        request.method === 'GET'
      ) {
        const companyId = url.searchParams.get('companyId');

        if (!companyId) {
          return sendJson(
            {
              success: false,
              error: 'companyId es obligatorio.',
            },
            400
          );
        }

        const result = await env.DB
          .prepare(`
            SELECT
              id,
              companyId,
              firstName,
              firstName2,
              lastName,
              lastName2,
              taxId,
              position,
              contractType,
              salary,
              address,
              city,
              country,
              phone,
              whatsapp,
              hireDate,
              active,
              createdAt
            FROM employees
            WHERE companyId = ?1
              AND active = 1
            ORDER BY firstName ASC, lastName ASC
          `)
          .bind(companyId)
          .all();

        const employees = (result.results || []).map(
          normalizeEmployee
        );

        return sendJson({
          success: true,
          data: employees,
        });
      }

      /*
       * ============================================================
       * EMPLEADOS - CREAR
       * ============================================================
       */

      if (
        url.pathname === '/api/employees' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;

        const companyId = String(
          body.companyId || ''
        ).trim();

        if (!companyId) {
          return sendJson(
            {
              success: false,
              error: 'companyId es obligatorio.',
            },
            400
          );
        }

        const company = await env.DB
          .prepare(`
            SELECT id
            FROM companies
            WHERE id = ?1
              AND active = 1
          `)
          .bind(companyId)
          .first();

        if (!company) {
          return sendJson(
            {
              success: false,
              error: 'La empresa no existe o está inactiva.',
            },
            404
          );
        }

        const firstName = String(
          body.firstName || ''
        ).trim();

        const lastName = String(
          body.lastName || ''
        ).trim();

        const taxId = String(
          body.taxId || ''
        ).trim();

        const salary = Number(body.salary);

        if (!firstName || !lastName || !taxId) {
          return sendJson(
            {
              success: false,
              error:
                'Primer nombre, primer apellido y documento son obligatorios.',
            },
            400
          );
        }

        if (!Number.isFinite(salary) || salary <= 0) {
          return sendJson(
            {
              success: false,
              error: 'El salario debe ser mayor que cero.',
            },
            400
          );
        }

        const id = `EMP-${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();

        await env.DB
          .prepare(`
            INSERT INTO employees (
              id,
              companyId,
              firstName,
              firstName2,
              lastName,
              lastName2,
              taxId,
              position,
              contractType,
              salary,
              address,
              city,
              country,
              phone,
              whatsapp,
              hireDate,
              active,
              createdAt
            )
            VALUES (
              ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
              ?10, ?11, ?12, ?13, ?14, ?15, ?16, 1, ?17
            )
          `)
          .bind(
            id,
            companyId,
            firstName,
            body.firstName2 || null,
            lastName,
            body.lastName2 || null,
            taxId,
            body.position || null,
            body.contractType || '1',
            salary,
            body.address || null,
            body.city || null,
            body.country || 'Colombia',
            body.phone || null,
            body.whatsapp || null,
            body.hireDate || null,
            createdAt
          )
          .run();

        const row = await env.DB
          .prepare(`
            SELECT *
            FROM employees
            WHERE id = ?1
          `)
          .bind(id)
          .first();

        return sendJson(
          {
            success: true,
            data: normalizeEmployee(row),
          },
          201
        );
      }

      /*
       * ============================================================
       * EMPLEADO - EDITAR
       * ============================================================
       */

      const employeeMatch =
        url.pathname.match(/^\/api\/employees\/([^/]+)$/);

      if (
        employeeMatch &&
        request.method === 'PUT'
      ) {
        const employeeId =
          decodeURIComponent(employeeMatch[1]);

        const body = await request.json() as any;

        const existing = await env.DB
          .prepare(`
            SELECT *
            FROM employees
            WHERE id = ?1
          `)
          .bind(employeeId)
          .first();

        if (!existing) {
          return sendJson(
            {
              success: false,
              error: 'Empleado no encontrado.',
            },
            404
          );
        }

        const salary = Number(
          body.salary ?? existing.salary
        );

        if (!Number.isFinite(salary) || salary <= 0) {
          return sendJson(
            {
              success: false,
              error: 'El salario debe ser mayor que cero.',
            },
            400
          );
        }

        await env.DB
          .prepare(`
            UPDATE employees
            SET
              firstName = ?1,
              firstName2 = ?2,
              lastName = ?3,
              lastName2 = ?4,
              taxId = ?5,
              position = ?6,
              contractType = ?7,
              salary = ?8,
              address = ?9,
              city = ?10,
              country = ?11,
              phone = ?12,
              whatsapp = ?13,
              hireDate = ?14
            WHERE id = ?15
          `)
          .bind(
            String(
              body.firstName ??
              existing.firstName ??
              ''
            ).trim(),

            body.firstName2 ?? null,

            String(
              body.lastName ??
              existing.lastName ??
              ''
            ).trim(),

            body.lastName2 ?? null,

            String(
              body.taxId ??
              existing.taxId ??
              ''
            ).trim(),

            body.position ?? null,
            body.contractType ?? '1',
            salary,
            body.address ?? null,
            body.city ?? null,
            body.country ?? 'Colombia',
            body.phone ?? null,
            body.whatsapp ?? null,
            body.hireDate ?? null,
            employeeId
          )
          .run();

        const row = await env.DB
          .prepare(`
            SELECT *
            FROM employees
            WHERE id = ?1
          `)
          .bind(employeeId)
          .first();

        return sendJson({
          success: true,
          data: normalizeEmployee(row),
        });
      }

      /*
       * ============================================================
       * EMPLEADO - ELIMINAR
       * ============================================================
       */

      if (
        employeeMatch &&
        request.method === 'DELETE'
      ) {
        const employeeId =
          decodeURIComponent(employeeMatch[1]);

        const existing = await env.DB
          .prepare(`
            SELECT id
            FROM employees
            WHERE id = ?1
              AND active = 1
          `)
          .bind(employeeId)
          .first();

        if (!existing) {
          return sendJson(
            {
              success: false,
              error: 'Empleado no encontrado.',
            },
            404
          );
        }

        await env.DB
          .prepare(`
            UPDATE employees
            SET active = 0
            WHERE id = ?1
          `)
          .bind(employeeId)
          .run();

        return sendJson({
          success: true,
          message: 'Empleado eliminado correctamente.',
        });
      }

      /*
       * ============================================================
       * NÓMINA COLOMBIA 2026
       *
       * IMPORTANTE:
       * El cálculo NO se hace aquí.
       * Se delega completamente al motor ColombiaPayrollEngine.
       * ============================================================
       */

      if (
        url.pathname === '/api/colombia/payroll/calculate' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;
        const employeeInput = body?.employeeInput || {};

        const employeeId = String(
          employeeInput.employeeId || ''
        ).trim();

        if (!employeeId) {
          return sendJson(
            {
              success: false,
              error: 'employeeId es obligatorio.',
            },
            400
          );
        }

        const employeeRow = await env.DB
          .prepare(`
            SELECT *
            FROM employees
            WHERE id = ?1
              AND active = 1
          `)
          .bind(employeeId)
          .first();

        if (!employeeRow) {
          return sendJson(
            {
              success: false,
              error: 'Empleado no encontrado o inactivo.',
            },
            404
          );
        }

        const employee = normalizeEmployee(employeeRow);

        const daysWorked = Number(
          employeeInput.daysWorked ?? 30
        );

        if (
          !Number.isFinite(daysWorked) ||
          daysWorked < 1 ||
          daysWorked > 30
        ) {
          return sendJson(
            {
              success: false,
              error: 'Los días trabajados deben estar entre 1 y 30.',
            },
            400
          );
        }

        const overtimeHours =
          employeeInput.overtimeHours || {};

        const extraDiurna = Number(
          overtimeHours.extraDiurna ?? 0
        );

        const extraNocturna = Number(
          overtimeHours.extraNocturna ?? 0
        );

        const recargoNocturno = Number(
          overtimeHours.recargoNocturno ?? 0
        );

        if (
          !Number.isFinite(extraDiurna) ||
          !Number.isFinite(extraNocturna) ||
          !Number.isFinite(recargoNocturno) ||
          extraDiurna < 0 ||
          extraNocturna < 0 ||
          recargoNocturno < 0
        ) {
          return sendJson(
            {
              success: false,
              error: 'Las horas extras y recargos deben ser valores válidos.',
            },
            400
          );
        }

        const payrollInput: ColombiaPayrollInput = {
          companyId: employee.companyId,
          employeeId: employee.id,

          firstName: employee.firstName,
          firstName2:
            employee.firstName2 || undefined,

          lastName: employee.lastName,
          lastName2:
            employee.lastName2 || undefined,

          taxId: employee.taxId,

          baseSalaryMonthly: employee.salary,

          daysWorked,

          extraDiurna,
          extraNocturna,
          recargoNocturno,

          overtimeHours: {
            extraDiurna,
            extraNocturna,
            recargoNocturno,
          },
        };

        const payrollResult: ColombiaPayrollResult =
          ColombiaPayrollEngine.calculate(
            payrollInput
          );

        return sendJson({
          success: true,
          data: payrollResult,
        });
      }

      /*
       * ============================================================
       * DIAN - GENERAR XML
       * ============================================================
       */

      if (
        url.pathname === '/api/colombia/dian/xml' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;

        const payrollData =
          body?.payrollData as ColombiaPayrollResult;

        if (
          !payrollData ||
          !payrollData.employeeId ||
          !payrollData.taxId
        ) {
          return sendJson(
            {
              success: false,
              error: 'Los datos de nómina son obligatorios.',
            },
            400
          );
        }

        const employerInput =
          body?.employerInfo || {};

        const employeeInput =
          body?.employeeExtra || {};

        const employerInfo: DianEmployerInfo = {
          nit: String(
            employerInput.nit || ''
          ).trim(),

          dv: String(
            employerInput.dv || '0'
          ).trim(),

          companyName: String(
            employerInput.companyName || ''
          ).trim(),

          softwareId: String(
            employerInput.softwareId ||
            'SOFT-KREADU-2026'
          ).trim(),

          pinSoftware: String(
            employerInput.pinSoftware ||
            '12345'
          ).trim(),

          testSetId:
            employerInput.testSetId ||
            undefined,
        };

        if (
          !employerInfo.nit ||
          !employerInfo.companyName
        ) {
          return sendJson(
            {
              success: false,
              error:
                'NIT y nombre de empresa son obligatorios para generar el XML.',
            },
            400
          );
        }

        const employeeExtra: DianEmployeeExtraInfo = {
          typeDocument:
            employeeInput.typeDocument || '13',

          typeContract:
            employeeInput.typeContract || '1',

          /*
           * 42 = transferencia bancaria.
           * El servicio DIAN preparado acepta 10, 42 o 20.
           */
          paymentMethod:
            employeeInput.paymentMethod || '42',

          bankName:
            employeeInput.bankName ||
            undefined,

          accountNumber:
            employeeInput.accountNumber ||
            undefined,

          accountType:
            employeeInput.accountType ||
            undefined,
        };

        const consecutiveNumber = Math.max(
          1,
          Number(body?.consecutiveNumber || 1)
        );

        const xmlResult =
          await DianNominaXmlService.generateDSPNE(
            payrollData,
            employerInfo,
            employeeExtra,
            consecutiveNumber
          );

        return sendJson({
          success: true,
          data: xmlResult,
        });
      }

      /*
       * ============================================================
       * BANCOS
       *
       * Se conserva conectado al servicio existente.
       * ============================================================
       */

      if (
        url.pathname === '/api/colombia/bank-disbursement' &&
        request.method === 'POST'
      ) {
        const body = await request.json() as any;

        if (
          !body?.companyInfo ||
          !Array.isArray(body?.records)
        ) {
          return sendJson(
            {
              success: false,
              error:
                'companyInfo y records son obligatorios.',
            },
            400
          );
        }

          const payrolls = Array.isArray(body.records)
            ? body.records
            : [];

          const employeesMap = new Map<string, any>();

          for (const record of payrolls) {
            if (!record?.employeeId) continue;

            employeesMap.set(record.employeeId, {
              bankCode: record.bankCode || record.bankName || 'N/A',
              bankAccount: record.bankAccount || record.accountNumber || 'N/A',
              taxId: record.taxId || 'N/A',
            });
          }

          const result = BankDisbursementService.generateCSV(
            payrolls,
            employeesMap
          );

          return sendJson({
            success: true,
            data: result,
          });
      }

      /*
       * ============================================================
       * 404
       * ============================================================
       */

      return sendJson(
        {
          success: false,
          error: 'Ruta no encontrada.',
        },
        404
      );

    } catch (error) {
      console.error('Worker error:', error);

      return sendJson(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Error interno del servidor.',
        },
        500
      );
    }
  },
};

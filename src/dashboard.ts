import { DASHBOARD_APP_JS } from './dashboard/app.generated';

export interface DashboardFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
}

export function getDashboardHtml(
  firebaseConfig: DashboardFirebaseConfig,
  legalVersion: string
): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kreadu Gestion-Future | Dashboard Nómina</title>

  <script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
  <script>
    window.__FIREBASE_CONFIG__ = ${JSON.stringify(firebaseConfig)};
    window.__LEGAL_VERSION__ = ${JSON.stringify(legalVersion)};
  </script>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #07111f;
      color: #e5edf7;
      /* Deja espacio para el pie institucional fijo (PageFooter). */
      padding-bottom: 34px;
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

    :focus-visible {
      outline: 2px solid #60a5fa;
      outline-offset: 2px;
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

    .storage-notice {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: 44px;
      max-width: 640px;
      margin: 0 auto;
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 12px 14px;
      border: 1px solid #29415d;
      border-radius: 10px;
      background: #0b1829;
      color: #dbe5f1;
      font-size: 12px;
      text-align: left;
      box-shadow: 0 10px 30px rgba(0, 0, 0, .4);
    }

    .storage-notice a { color: #93c5fd; }

    .legal-box {
      margin-bottom: 18px;
      padding: 14px;
      border: 1px solid #334155;
      border-radius: 10px;
      background: #020617;
    }

    .legal-frame {
      width: 100%;
      height: 260px;
      border: 1px solid #1d3047;
      border-radius: 8px;
      background: #07111f;
    }

    .legal-accept {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin-top: 10px;
      font-size: 12px;
      line-height: 1.5;
      cursor: pointer;
      text-transform: none;
      letter-spacing: normal;
      font-weight: 400;
      color: #cbd5e1;
    }

    .legal-accept input {
      width: auto;
      margin-top: 3px;
      flex-shrink: 0;
    }

    .modal-footer {
      padding: 14px 19px;
      border-top: 1px solid #1d3047;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .alert {
      /* Fijo y por encima de CUALQUIER overlay (modales z-index 100,
         vistas previas z-index 9999): un error dentro de un modal
         (ej. al guardar) antes quedaba renderizado detrás del fondo
         del modal — invisible, aunque el mensaje sí existía. */
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      width: min(560px, calc(100vw - 32px));
      margin: 0;
      padding: 12px 15px;
      border-radius: 8px;
      border: 1px solid #7f1d1d;
      background: #2a0f10;
      color: #fecaca;
      font-size: 13px;
      box-shadow: 0 12px 34px rgba(0, 0, 0, .5);
    }

    .success {
      border-color: #065f46;
      background: #0a2b22;
      color: #a7f3d0;
    }

    /* Aviso EN FLUJO normal (no flotante) dentro de un modal — el
       estilo visual que .alert tenía antes de volverse un toast fijo. */
    .inline-warning {
      padding: 11px 13px;
      border-radius: 8px;
      border: 1px solid #7f1d1d;
      background: rgba(127, 29, 29, .2);
      color: #fecaca;
      font-size: 12px;
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

<script>${DASHBOARD_APP_JS}</script>
</body>
</html>`;
}

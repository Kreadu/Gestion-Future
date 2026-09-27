import unittest
import hashlib
from typing import Dict, Any


class ColombiaPayrollEngine:
    """
    Motor de cálculo de nómina adaptado a la normativa laboral de Colombia 2026.
    """
    SMMLV_2026: float = 1750905.0
    AUX_TRANSPORTE_2026: float = 249095.0
    MONTHLY_HOURS: float = 210.0  # 42 horas semanales según Ley 2101

    @classmethod
    def calculate(
        cls,
        base_salary: float,
        days_worked: int = 30,
        extra_diurna: float = 0.0,
        recargo_nocturno: float = 0.0,
        is_exempt_114_1: bool = True
    ) -> Dict[str, Any]:
        hourly_rate = base_salary / cls.MONTHLY_HOURS
        base_earned = (base_salary / 30.0) * days_worked
        
        # Auxilio de transporte aplica hasta 2 SMMLV
        qualifies_aux = base_salary <= (cls.SMMLV_2026 * 2.0)
        earned_aux = (cls.AUX_TRANSPORTE_2026 / 30.0) * days_worked if qualifies_aux else 0.0

        # Recargos y horas extras
        val_extra_diurna = extra_diurna * hourly_rate * 1.25
        val_recargo_nocturno = recargo_nocturno * hourly_rate * 0.35
        overtime_total = val_extra_diurna + val_recargo_nocturno

        gross_earnings = base_earned + earned_aux + overtime_total
        ibc = base_earned + overtime_total  # Excluye auxilio de transporte

        # Deducciones de empleado
        health_4pct = round(ibc * 0.04, 2)
        pension_4pct = round(ibc * 0.04, 2)
        total_deductions = round(health_4pct + pension_4pct, 2)
        net_pay = round(gross_earnings - total_deductions, 2)

        # Aportes patronales (Art. 114-1 del Estatuto Tributario)
        health_8_5pct = 0.0 if is_exempt_114_1 else round(ibc * 0.085, 2)
        sena_2pct = 0.0 if is_exempt_114_1 else round(ibc * 0.02, 2)
        icbf_3pct = 0.0 if is_exempt_114_1 else round(ibc * 0.03, 2)

        return {
            "base_earned": round(base_earned, 2),
            "earned_aux": round(earned_aux, 2),
            "gross_earnings": round(gross_earnings, 2),
            "ibc": round(ibc, 2),
            "health_4pct": health_4pct,
            "pension_4pct": pension_4pct,
            "total_deductions": total_deductions,
            "net_pay": net_pay,
            "health_8_5pct": health_8_5pct,
            "sena_2pct": sena_2pct,
            "icbf_3pct": icbf_3pct,
            "hourly_rate": round(hourly_rate, 2),
            "overtime_total": round(overtime_total, 2)
        }


class DianNominaXmlService:
    """
    Servicio encargado de la simulación de generación y firmado CUNE para la DIAN.
    """
    @staticmethod
    def generate_cune(num_doc: str, nit_employer: str, net_pay: float, pin: str) -> str:
        raw_string = f"{num_doc}{nit_employer}{net_pay:.2f}{pin}"
        return hashlib.sha384(raw_string.encode('utf-8')).hexdigest()


class TestColombiaPayrollEngineAndDIAN(unittest.TestCase):

    def test_01_smmlv_2026_calculation(self):
        """Valida devengados, deducciones y neto a pagar sobre 1 SMMLV en 2026."""
        res = ColombiaPayrollEngine.calculate(1750905.0, 30, is_exempt_114_1=False)
        self.assertEqual(res["base_earned"], 1750905.0)
        self.assertEqual(res["earned_aux"], 249095.0)
        self.assertEqual(res["gross_earnings"], 2000000.0)
        self.assertEqual(res["ibc"], 1750905.0)
        self.assertEqual(res["health_4pct"], 70036.2)
        self.assertEqual(res["pension_4pct"], 70036.2)
        self.assertEqual(res["net_pay"], 1859927.6)

    def test_02_art_114_1_exemption(self):
        """Verifica la exoneración de aportes de empleador según Art. 114-1 E.T."""
        res = ColombiaPayrollEngine.calculate(1750905.0, 30, is_exempt_114_1=True)
        self.assertEqual(res["health_8_5pct"], 0.0)
        self.assertEqual(res["sena_2pct"], 0.0)
        self.assertEqual(res["icbf_3pct"], 0.0)

    def test_03_overtime_hourly_rate(self):
        """Comprueba el cálculo del valor hora ordinaria sobre la jornada legal de 210h/mes."""
        res = ColombiaPayrollEngine.calculate(1750905.0, 30, extra_diurna=10)
        self.assertEqual(res["hourly_rate"], 8337.64)
        self.assertGreater(res["overtime_total"], 0.0)

    def test_04_dian_cune_generation(self):
        """Valida la generación de la firma hash SHA-384 del CUNE."""
        res = ColombiaPayrollEngine.calculate(1750905.0, 30)
        cune = DianNominaXmlService.generate_cune("101", "900123456", res["net_pay"], "12345")
        
        self.assertIsInstance(cune, str)
        self.assertEqual(len(cune), 96)  # SHA-384 genera 96 caracteres hexadecimales


if __name__ == '__main__':
    unittest.main(verbosity=2)

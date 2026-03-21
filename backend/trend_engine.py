"""
Trend Analysis Calculation Engine.
Supports simple and compound trend projections.
"""
from datetime import date
from typing import Optional


def _fmt_currency(n: float) -> str:
    return f"${n:,.2f}"


def _fmt_pct(n: float) -> str:
    sign = "+" if n >= 0 else ""
    return f"{sign}{n * 100:.2f}%"


def _year_fraction(d1: date, d2: date) -> float:
    """Return the difference in years (as a decimal) between two dates."""
    return (d2 - d1).days / 365.25


def _add_months_approx(d: date, months: int) -> date:
    """Add months approximately, clamping day to valid range."""
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    import calendar
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def calculate_trend(
    base_value: float,
    base_date: date,
    eval_date: date,
    annual_rate: float,
    trend_type: str = "compound",
) -> dict:
    """
    Full trend calculation.

    Parameters
    ----------
    base_value : float
        Starting monetary value.
    base_date : date
        Date associated with the base value.
    eval_date : date
        Target evaluation date.
    annual_rate : float
        Annual trend rate as a *percentage* (e.g. 3.0 means 3 %).
    trend_type : str
        "compound" or "simple".

    Returns
    -------
    dict with keys: trendedValue, timeDifferenceYears, totalTrendImpact,
                    growthCurve, auditTrail
    """
    rate = annual_rate / 100.0
    time_years = _year_fraction(base_date, eval_date)
    audit: list[dict] = []

    # ── Audit: echo inputs ──
    audit.append({"label": "Input", "detail": f"Base Value = {_fmt_currency(base_value)}"})
    audit.append({"label": "Input", "detail": f"Base Date = {base_date.isoformat()}"})
    audit.append({"label": "Input", "detail": f"Evaluation Date = {eval_date.isoformat()}"})
    audit.append({"label": "Input", "detail": f"Annual Trend Rate = {_fmt_pct(rate)}"})
    audit.append({"label": "Input", "detail": f"Trend Type = {trend_type.capitalize()}"})
    audit.append({
        "label": "Calculation",
        "detail": "Time Difference",
        "formula": f"= ({eval_date.isoformat()} − {base_date.isoformat()}) / 365.25 = {time_years:.4f} years",
    })

    # ── Compute trended value ──
    if trend_type == "compound":
        trended = base_value * ((1 + rate) ** time_years)
        audit.append({
            "label": "Formula",
            "detail": "Compound Trend",
            "formula": (
                f"= {_fmt_currency(base_value)} × (1 + {_fmt_pct(rate)})^{time_years:.4f}"
                f" = {_fmt_currency(trended)}"
            ),
        })
    else:
        trended = base_value * (1 + rate * time_years)
        audit.append({
            "label": "Formula",
            "detail": "Simple Trend",
            "formula": (
                f"= {_fmt_currency(base_value)} × (1 + {_fmt_pct(rate)} × {time_years:.4f})"
                f" = {_fmt_currency(trended)}"
            ),
        })

    impact = (trended / base_value - 1) if base_value != 0 else 0.0
    audit.append({
        "label": "Result",
        "detail": "Total Trend Impact",
        "formula": f"= {_fmt_pct(impact)}",
    })
    audit.append({
        "label": "Result",
        "detail": "Trended Value",
        "formula": f"= {_fmt_currency(trended)}",
    })

    # ── Growth curve (monthly data points) ──
    growth_curve = _build_growth_curve(base_value, base_date, eval_date, rate, trend_type)

    return {
        "trendedValue": round(trended, 2),
        "timeDifferenceYears": round(time_years, 4),
        "totalTrendImpact": round(impact, 6),
        "growthCurve": growth_curve,
        "auditTrail": audit,
    }


def _build_growth_curve(
    base_value: float,
    base_date: date,
    eval_date: date,
    rate: float,
    trend_type: str,
) -> list[dict]:
    """Generate monthly data points for the growth line chart."""
    points = []
    current = base_date
    month_idx = 0

    while current <= eval_date:
        t = _year_fraction(base_date, current)
        if trend_type == "compound":
            val = base_value * ((1 + rate) ** t)
        else:
            val = base_value * (1 + rate * t)
        points.append({"date": current.isoformat(), "value": round(val, 2)})
        month_idx += 1
        current = _add_months_approx(base_date, month_idx)

    # Ensure the final evaluation date is always included
    if points and points[-1]["date"] != eval_date.isoformat():
        t = _year_fraction(base_date, eval_date)
        if trend_type == "compound":
            val = base_value * ((1 + rate) ** t)
        else:
            val = base_value * (1 + rate * t)
        points.append({"date": eval_date.isoformat(), "value": round(val, 2)})

    return points

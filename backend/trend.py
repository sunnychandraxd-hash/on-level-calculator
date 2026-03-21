"""
Loss Trend Engine — Actuarially Sound Trending Module.

Implements proper trend period calculation and exponential compounding
following Werner & Modlin methodology. Supports single-step and two-step
trending. This module is independent from on-leveling.
"""
from datetime import date, timedelta
from typing import Optional
import calendar


# ─── Formatting Helpers ─────────────────────────────────────────────


def _fmt_currency(n: float) -> str:
    return f"${n:,.2f}"


def _fmt_pct(n: float) -> str:
    sign = "+" if n >= 0 else ""
    return f"{sign}{n * 100:.4f}%"


def _fmt_factor(n: float) -> str:
    return f"{n:.6f}"


# ─── Date Helpers ───────────────────────────────────────────────────


def _add_months(d: date, months: int) -> date:
    """Add months to a date, clamping day to valid range."""
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _midpoint(d1: date, d2: date) -> date:
    """Return the midpoint date between two dates."""
    delta = (d2 - d1).days
    return d1 + timedelta(days=delta / 2)


def _year_fraction(d1: date, d2: date) -> float:
    """Return the difference in years (as a decimal) between two dates."""
    return (d2 - d1).days / 365.25


# ─── Core Trend Functions ───────────────────────────────────────────


def compute_historical_avg_date(
    period_start: date,
    period_end: date,
) -> date:
    """
    Compute the average accident date for the historical experience period.

    For loss data, this is the midpoint of the experience period.
    E.g., for accident year 2022 (2022-01-01 to 2022-12-31),
    the average accident date is approximately 2022-07-01.
    """
    return _midpoint(period_start, period_end)


def compute_future_avg_date(
    future_start: date,
    policy_term_months: int,
) -> date:
    """
    Compute the average accident date for the future coverage period.

    For policies written uniformly throughout the year,
    the average inception date is the midpoint of the policy year.
    Each policy then has a term of `policy_term_months`, so the
    average accident date is: future_start + term/2 (as midpoint).

    For simplicity (Werner & Modlin standard approach):
      avg_future_date = future_start + policy_term_months / 2
    """
    future_end = _add_months(future_start, policy_term_months)
    return _midpoint(future_start, future_end)


def compute_trend_period(
    historical_avg_date: date,
    future_avg_date: date,
) -> float:
    """
    Compute the trend period in years between two average dates.
    """
    return _year_fraction(historical_avg_date, future_avg_date)


def exponential_trend_factor(rate: float, period: float) -> float:
    """
    Compute a single exponential (compound) trend factor.

    Parameters
    ----------
    rate : float
        Annual trend rate as a decimal (e.g. 0.03 for 3%).
    period : float
        Number of years to project.

    Returns
    -------
    float
        (1 + rate) ^ period
    """
    return (1 + rate) ** period


# ─── Main Entry Point ───────────────────────────────────────────────


def apply_loss_trend(
    base_value: float,
    historical_start: date,
    historical_end: date,
    future_start: date,
    policy_term_months: int,
    current_trend_rate: float,
    projected_trend_rate: Optional[float] = None,
    latest_data_point: Optional[date] = None,
    trend_mode: str = "single",
) -> dict:
    """
    Apply loss trending with full actuarial date logic.

    Parameters
    ----------
    base_value : float
        Historical losses or monetary value to trend.
    historical_start : date
        Start of historical experience period.
    historical_end : date
        End of historical experience period.
    future_start : date
        Start of future coverage period.
    policy_term_months : int
        Length of future coverage period in months.
    current_trend_rate : float
        Current annual trend rate as *percentage* (e.g. 3.0 for 3%).
    projected_trend_rate : float or None
        Projected annual trend rate for two-step (percentage). Required
        if trend_mode == "two-step".
    latest_data_point : date or None
        Date of latest available data. Required for two-step trending.
        The split point between current and projected periods.
    trend_mode : str
        "single" for one-rate trending, "two-step" for split trending.

    Returns
    -------
    dict with keys: trendedValue, trendFactor, trendPeriodYears,
                    historicalAvgDate, futureAvgDate, currentFactor,
                    projectedFactor, growthCurve, auditTrail
    """
    current_rate = current_trend_rate / 100.0
    audit: list[dict] = []

    # ── Compute average dates ──
    hist_avg = compute_historical_avg_date(historical_start, historical_end)
    future_avg = compute_future_avg_date(future_start, policy_term_months)
    total_period = compute_trend_period(hist_avg, future_avg)

    # ── Audit: echo inputs ──
    audit.append({"label": "Input", "detail": f"Base Value = {_fmt_currency(base_value)}"})
    audit.append({"label": "Input", "detail": f"Historical Period = {historical_start.isoformat()} to {historical_end.isoformat()}"})
    audit.append({"label": "Input", "detail": f"Future Period Start = {future_start.isoformat()}, Term = {policy_term_months} months"})
    audit.append({"label": "Input", "detail": f"Trend Mode = {trend_mode.replace('-', ' ').title()}"})
    audit.append({"label": "Input", "detail": f"Current Trend Rate = {_fmt_pct(current_rate)}"})

    # ── Audit: date derivation ──
    audit.append({
        "label": "Date Calc",
        "detail": "Historical Average Date (midpoint of experience period)",
        "formula": f"= midpoint({historical_start.isoformat()}, {historical_end.isoformat()}) = {hist_avg.isoformat()}",
    })
    audit.append({
        "label": "Date Calc",
        "detail": "Future Average Date (midpoint of future coverage period)",
        "formula": f"= {future_start.isoformat()} + {policy_term_months}/2 months = {future_avg.isoformat()}",
    })
    audit.append({
        "label": "Date Calc",
        "detail": "Total Trend Period",
        "formula": f"= ({future_avg.isoformat()} − {hist_avg.isoformat()}) / 365.25 = {total_period:.4f} years",
    })

    # ── Compute trend factor(s) ──
    current_factor = None
    projected_factor = None

    if trend_mode == "two-step" and projected_trend_rate is not None and latest_data_point is not None:
        proj_rate = projected_trend_rate / 100.0
        audit.append({"label": "Input", "detail": f"Projected Trend Rate = {_fmt_pct(proj_rate)}"})
        audit.append({"label": "Input", "detail": f"Latest Data Point = {latest_data_point.isoformat()}"})

        # Step 1: Historical avg → Latest data point (current rate)
        current_period = _year_fraction(hist_avg, latest_data_point)
        current_factor = exponential_trend_factor(current_rate, current_period)

        # Step 2: Latest data point → Future avg (projected rate)
        projected_period = _year_fraction(latest_data_point, future_avg)
        projected_factor = exponential_trend_factor(proj_rate, projected_period)

        total_factor = current_factor * projected_factor

        audit.append({
            "label": "Step 1",
            "detail": f"Current Period: {hist_avg.isoformat()} → {latest_data_point.isoformat()} = {current_period:.4f} years",
            "formula": f"Current Factor = (1 + {_fmt_pct(current_rate)})^{current_period:.4f} = {_fmt_factor(current_factor)}",
        })
        audit.append({
            "label": "Step 2",
            "detail": f"Projected Period: {latest_data_point.isoformat()} → {future_avg.isoformat()} = {projected_period:.4f} years",
            "formula": f"Projected Factor = (1 + {_fmt_pct(proj_rate)})^{projected_period:.4f} = {_fmt_factor(projected_factor)}",
        })
        audit.append({
            "label": "Formula",
            "detail": "Combined Trend Factor = Current Factor × Projected Factor",
            "formula": f"= {_fmt_factor(current_factor)} × {_fmt_factor(projected_factor)} = {_fmt_factor(total_factor)}",
        })

    else:
        # Single-step: one rate across full period
        total_factor = exponential_trend_factor(current_rate, total_period)

        audit.append({
            "label": "Formula",
            "detail": "Trend Factor (exponential compounding)",
            "formula": f"= (1 + {_fmt_pct(current_rate)})^{total_period:.4f} = {_fmt_factor(total_factor)}",
        })

    trended = base_value * total_factor
    impact = total_factor - 1.0

    audit.append({
        "label": "Result",
        "detail": "Trended Value = Base Value × Trend Factor",
        "formula": f"= {_fmt_currency(base_value)} × {_fmt_factor(total_factor)} = {_fmt_currency(trended)}",
    })
    audit.append({
        "label": "Result",
        "detail": "Total Trend Impact",
        "formula": f"= {_fmt_pct(impact)}",
    })

    # ── Growth curve ──
    growth_curve = _build_growth_curve(
        base_value, hist_avg, future_avg,
        current_rate,
        proj_rate=projected_trend_rate / 100.0 if (trend_mode == "two-step" and projected_trend_rate is not None) else None,
        latest_data_point=latest_data_point if trend_mode == "two-step" else None,
    )

    return {
        "trendedValue": round(trended, 2),
        "trendFactor": round(total_factor, 6),
        "trendPeriodYears": round(total_period, 4),
        "historicalAvgDate": hist_avg.isoformat(),
        "futureAvgDate": future_avg.isoformat(),
        "currentFactor": round(current_factor, 6) if current_factor is not None else None,
        "projectedFactor": round(projected_factor, 6) if projected_factor is not None else None,
        "totalTrendImpact": round(impact, 6),
        "growthCurve": growth_curve,
        "auditTrail": audit,
    }


# ─── Growth Curve Builder ───────────────────────────────────────────


def _build_growth_curve(
    base_value: float,
    start_date: date,
    end_date: date,
    current_rate: float,
    proj_rate: Optional[float] = None,
    latest_data_point: Optional[date] = None,
) -> list[dict]:
    """
    Generate growth curve data points for charting.
    Includes start, end, year boundaries, and monthly intermediate points.
    For two-step trending, uses current_rate before latest_data_point
    and proj_rate after.
    """
    points = []

    def _value_at(d: date) -> float:
        if proj_rate is not None and latest_data_point is not None and d > latest_data_point:
            # Two-step: compound current rate up to latest_data_point, then projected rate
            t1 = _year_fraction(start_date, latest_data_point)
            t2 = _year_fraction(latest_data_point, d)
            return base_value * ((1 + current_rate) ** t1) * ((1 + proj_rate) ** t2)
        else:
            t = _year_fraction(start_date, d)
            return base_value * ((1 + current_rate) ** t)

    # Start point
    points.append({"date": start_date.isoformat(), "value": round(base_value, 2)})

    # Monthly points + year boundaries
    current = start_date
    month_idx = 0
    while True:
        month_idx += 1
        current = _add_months(start_date, month_idx)
        if current >= end_date:
            break
        points.append({"date": current.isoformat(), "value": round(_value_at(current), 2)})

    # End point
    points.append({"date": end_date.isoformat(), "value": round(_value_at(end_date), 2)})

    return points

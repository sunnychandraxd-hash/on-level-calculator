"""
Actuarial On-Leveling Calculation Engine.
All proprietary logic is contained here — this file never reaches the browser.
"""
from datetime import date, timedelta
from typing import Optional


def _days_in_month(d: date) -> int:
    """Return days in the month of given date."""
    if d.month == 12:
        return (date(d.year + 1, 1, 1) - date(d.year, 12, 1)).days
    return (date(d.year, d.month + 1, 1) - date(d.year, d.month, 1)).days


def _add_months(d: date, months: int) -> date:
    """Add months to a date."""
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, _days_in_month(date(year, month, 1)))
    return date(year, month, day)


def _fmt_pct(n: float) -> str:
    sign = "+" if n >= 0 else ""
    return f"{sign}{n * 100:.2f}%"


def _fmt_factor(n: float) -> str:
    return f"{n:.6f}"


def _fmt_currency(n: float) -> str:
    return f"${n:,.2f}"


# ─── Core Computation ───────────────────────────────────────────────


def build_rate_changes(raw_changes: list[dict]) -> list[dict]:
    """
    Deduplicate, sort, and normalize rate changes.
    Input: [{ "date": date, "pct": float (as percentage, e.g. 5.0) }]
    Output: sorted list with pct as decimal (0.05)
    """
    merged: dict[date, float] = {}
    for rc in raw_changes:
        d = rc["date"]
        p = rc["pct"] / 100.0  # convert percentage to decimal
        if d in merged:
            # Compound duplicates on same date
            merged[d] = (1 + merged[d]) * (1 + p) - 1
        else:
            merged[d] = p

    changes = [{"date": d, "pct": p} for d, p in merged.items()]
    changes.sort(key=lambda x: x["date"])
    return changes


def build_rate_level_history(changes: list[dict]) -> list[dict]:
    """
    Build rate level timeline from sorted changes.
    Returns list of { dateStr, rateChange, rateLevel, cumulativeChange }.
    """
    history = [{
        "dateStr": "Base",
        "rateChange": 0.0,
        "rateLevel": 1.0,
        "cumulativeChange": 0.0,
    }]
    level = 1.0
    for c in changes:
        level *= (1 + c["pct"])
        history.append({
            "dateStr": c["date"].isoformat(),
            "rateChange": c["pct"],
            "rateLevel": level,
            "cumulativeChange": level - 1.0,
        })
    return history


def get_rate_level_as_of(changes: list[dict], as_of: date) -> float:
    """
    Get cumulative rate level as of a specific date.
    Multiplies (1 + pct) for every change with effective date <= as_of.
    """
    level = 1.0
    for c in changes:
        if c["date"] <= as_of:
            level *= (1 + c["pct"])
        else:
            break  # sorted, no more applicable
    return level


def compute_written_factor(
    changes: list[dict],
    policy_date: date,
    eval_date: date,
) -> dict:
    """On-level factor for written basis: current_level / historical_level."""
    hist_level = get_rate_level_as_of(changes, policy_date)
    cur_level = get_rate_level_as_of(changes, eval_date)
    factor = cur_level / hist_level if hist_level != 0 else 1.0
    return {"factor": factor, "histLevel": hist_level, "curLevel": cur_level}


def compute_earned_factor(
    changes: list[dict],
    policy_date: date,
    eval_date: date,
    term_months: int,
    weights: Optional[list[float]] = None,
) -> dict:
    """
    On-level factor for earned basis.
    Computes weighted average of rate levels over the policy term.
    """
    cur_level = get_rate_level_as_of(changes, eval_date)

    num_periods = len(weights) if weights else term_months
    w = weights if weights else [1.0 / num_periods] * num_periods

    weighted_hist = 0.0
    period_details = []
    term_days = (term_months * 30.4375)  # approximate

    for i in range(num_periods):
        # Midpoint of each earning sub-period
        mid_offset = timedelta(days=((i + 0.5) / num_periods) * term_days)
        mid_date = policy_date + mid_offset
        level = get_rate_level_as_of(changes, mid_date)
        weighted_hist += w[i] * level
        period_details.append({
            "period": i + 1,
            "midDate": mid_date.isoformat(),
            "level": level,
            "weight": w[i],
        })

    factor = cur_level / weighted_hist if weighted_hist != 0 else 1.0
    return {
        "factor": factor,
        "histLevel": weighted_hist,
        "curLevel": cur_level,
        "periodDetails": period_details,
    }


def compute_adequacy(factor: float) -> dict:
    """Classify rate adequacy based on the on-level factor."""
    if factor > 1.0:
        return {"label": "Inadequate", "value": factor - 1.0, "direction": "up"}
    elif factor < 1.0:
        return {"label": "Adequate (Over-rated)", "value": 1.0 - factor, "direction": "down"}
    return {"label": "Adequate", "value": 0.0, "direction": "neutral"}


# ─── Main Entry Point ───────────────────────────────────────────────


def calculate(
    historical_premium: float,
    policy_date: date,
    eval_date: date,
    policy_term: int,
    basis: str,
    earning_pattern: str,
    custom_weights: Optional[list[float]],
    raw_rate_changes: list[dict],
) -> dict:
    """
    Full on-leveling calculation.
    Returns factor, premium, history, adequacy, and audit trail.
    """
    changes = build_rate_changes(raw_rate_changes)
    history = build_rate_level_history(changes)
    audit = []

    # Log inputs to the audit trail
    audit.append({"label": "Input", "detail": f"Historical Premium = {_fmt_currency(historical_premium)}"})
    audit.append({"label": "Input", "detail": f"Policy Effective Date = {policy_date.isoformat()}"})
    audit.append({"label": "Input", "detail": f"Evaluation Date = {eval_date.isoformat()}"})
    audit.append({"label": "Input", "detail": f"Policy Term = {policy_term} months"})
    audit.append({"label": "Input", "detail": f"Basis = {basis.capitalize()}"})

    # Edge case: no rate changes
    if not changes:
        audit.append({"label": "Note", "detail": "No rate changes provided. On-level factor defaults to 1.0."})
        return {
            "onLevelFactor": 1.0,
            "onLevelPremium": historical_premium,
            "cumulativeChange": 0.0,
            "adequacy": compute_adequacy(1.0),
            "rateLevelHistory": history,
            "auditTrail": audit,
        }

    # Log each rate change
    for i, c in enumerate(changes):
        audit.append({
            "label": f"Rate Change {i + 1}",
            "detail": f"Date: {c['date'].isoformat()}, Change: {_fmt_pct(c['pct'])}",
        })

    if basis == "written":
        res = compute_written_factor(changes, policy_date, eval_date)
        factor = res["factor"]
        hist_level = res["histLevel"]
        cur_level = res["curLevel"]

        audit.append({"label": "Calculation", "detail": f"Historical Rate Level (as-of {policy_date.isoformat()})", "formula": f"= {_fmt_factor(hist_level)}"})
        audit.append({"label": "Calculation", "detail": f"Current Rate Level (as-of {eval_date.isoformat()})", "formula": f"= {_fmt_factor(cur_level)}"})
        audit.append({"label": "Formula", "detail": "On-Level Factor = Current Level / Historical Level", "formula": f"= {_fmt_factor(cur_level)} / {_fmt_factor(hist_level)} = {_fmt_factor(factor)}"})

    else:
        # Earned basis
        weights = None
        if earning_pattern == "custom" and custom_weights:
            weights = custom_weights
        elif earning_pattern == "24-linear":
            weights = [1.0 / 24] * 24

        res = compute_earned_factor(changes, policy_date, eval_date, policy_term, weights)
        factor = res["factor"]
        hist_level = res["histLevel"]
        cur_level = res["curLevel"]
        period_details = res["periodDetails"]

        audit.append({"label": "Earned Basis", "detail": f"Earning Pattern: {earning_pattern}"})
        for pd in period_details:
            audit.append({
                "label": f"Period {pd['period']}",
                "detail": f"Mid-date: {pd['midDate']}, Level: {_fmt_factor(pd['level'])}, Weight: {pd['weight']:.4f}",
            })
        audit.append({"label": "Calculation", "detail": "Weighted Avg Historical Rate Level", "formula": f"= {_fmt_factor(hist_level)}"})
        audit.append({"label": "Calculation", "detail": f"Current Rate Level (as-of {eval_date.isoformat()})", "formula": f"= {_fmt_factor(cur_level)}"})
        audit.append({"label": "Formula", "detail": "On-Level Factor = Current Level / Weighted Historical Level", "formula": f"= {_fmt_factor(cur_level)} / {_fmt_factor(hist_level)} = {_fmt_factor(factor)}"})

    olp = historical_premium * factor
    audit.append({
        "label": "Result",
        "detail": "On-Level Premium = Historical Premium × Factor",
        "formula": f"= {_fmt_currency(historical_premium)} × {_fmt_factor(factor)} = {_fmt_currency(olp)}",
    })

    adequacy = compute_adequacy(factor)

    return {
        "onLevelFactor": round(factor, 6),
        "onLevelPremium": round(olp, 2),
        "cumulativeChange": round(cur_level - 1.0, 6),
        "adequacy": adequacy,
        "rateLevelHistory": history,
        "auditTrail": audit,
    }

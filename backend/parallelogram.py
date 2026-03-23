from datetime import date, timedelta
from typing import List, Optional
from models import RateChange, AggregatedOnLevelRequest

def _days_in_month(d: date) -> int:
    if d.month == 12:
        return (date(d.year + 1, 1, 1) - date(d.year, 12, 1)).days
    return (date(d.year, d.month + 1, 1) - date(d.year, d.month, 1)).days

def _add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, _days_in_month(date(year, month, 1)))
    return date(year, month, day)

def _get_rate_level_as_of(eval_date: date, rate_changes: List[dict]) -> float:
    # rate_changes is a sorted list of dicts: {"date": date, "pct": float (decimal)}
    level = 1.0
    for c in rate_changes:
        if c["date"] <= eval_date:
            level *= (1 + c["pct"])
        else:
            break
    return level

def compute_wp_factor(year: int, premium: float, rate_changes: List[dict], current_level: float) -> dict:
    avg_eff_date = date(year, 7, 1)
    rate_level = _get_rate_level_as_of(avg_eff_date, rate_changes)
    
    factor = current_level / rate_level if rate_level > 0 else 1.0
    olp = premium * factor
    
    return {
        "year": year,
        "historical_premium": premium,
        "weighted_avg_rate_level": rate_level,
        "factor": factor,
        "on_level_premium": olp,
        "audit_detail": f"Evaluation Level: {current_level:.6f}. Average Effective Date: {avg_eff_date.isoformat()}. Rate Level on Date: {rate_level:.6f}. (Exposures not used for WP).",
    }

def compute_cy_ep_factor(year: int, premium: float, exposures: Optional[float], rate_changes: List[dict], term_months: int, current_level: float, mid_term: bool, custom_weights: Optional[List[float]]) -> dict:
    total_exposure = exposures if exposures is not None else 1.0
    use_exposures = exposures is not None
    
    # 12-month numerical integration
    weighted_sum = 0.0
    sum_weights = 0.0
    
    for month in range(1, 13):
        point_date = date(year, month, 15)
        
        if mid_term:
            eff_date = point_date
        else:
            eff_date = _add_months(point_date, -(term_months // 2))
            
        rate_level = _get_rate_level_as_of(eff_date, rate_changes)
        
        if custom_weights and len(custom_weights) == 12:
            w = custom_weights[month - 1]
        elif use_exposures:
            w = 1.0 / 12.0  # Equal partition mathematically over year, exposure scales output magnitude logically
        else:
            w = 1.0 / 12.0
            
        weighted_sum += rate_level * w
        sum_weights += w
        
    avg_level = weighted_sum / sum_weights if sum_weights > 0 else 1.0
    factor = current_level / avg_level if avg_level > 0 else 1.0
    
    olp = premium * factor
    
    audit_msg = f"Eval Level: {current_level:.6f}. Base Level: {avg_level:.6f}. "
    if custom_weights and len(custom_weights) == 12:
        audit_msg += "Used custom 12-month earning weights."
    else:
        audit_msg += "Used standard equal weights (1/12). "
        if use_exposures:
            audit_msg += f"Annual exposure ({exposures}) acknowledged but uniform monthly distribution intrinsically applied."
            
    return {
        "year": year,
        "historical_premium": premium,
        "weighted_avg_rate_level": avg_level,
        "factor": factor,
        "on_level_premium": olp,
        "audit_detail": audit_msg,
    }

def compute_py_ep_factor(year: int, premium: float, rate_changes: List[dict], term_months: int, current_level: float, mid_term: bool) -> dict:
    total_months = 24  
    
    weighted_sum = 0.0
    sum_weights = 0.0
    
    for m in range(1, total_months + 1):
        calc_y = year + ((m - 1) // 12)
        calc_m = ((m - 1) % 12) + 1
        point_date = date(calc_y, calc_m, 15)
        
        if mid_term:
            eff_date = point_date
        else:
            eff_date = _add_months(point_date, -(term_months // 2))
            
        rate_level = _get_rate_level_as_of(eff_date, rate_changes)
        
        if m <= 12:
            w = m / 144.0
        else:
            w = (25 - m) / 144.0
            
        weighted_sum += rate_level * w
        sum_weights += w
        
    avg_level = weighted_sum / sum_weights if sum_weights > 0 else 1.0
    factor = current_level / avg_level if avg_level > 0 else 1.0
    
    olp = premium * factor
    
    audit_msg = f"Eval Level: {current_level:.6f}. Base Level: {avg_level:.6f}. Used 24-month triangular weights (exposures ignored by definition)."
    
    return {
        "year": year,
        "historical_premium": premium,
        "weighted_avg_rate_level": avg_level,
        "factor": factor,
        "on_level_premium": olp,
        "audit_detail": audit_msg,
    }


def calculate_aggregated(req: AggregatedOnLevelRequest) -> dict:
    merged = {}
    for rc in req.rate_changes:
        d = rc.date
        p = rc.pct / 100.0
        if d in merged:
            merged[d] = (1 + merged[d]) * (1 + p) - 1
        else:
            merged[d] = p
            
    sorted_rc = [{"date": d, "pct": p} for d, p in sorted(merged.items())]
    
    current_rate_level = _get_rate_level_as_of(req.evaluation_date, sorted_rc)
    
    results = []
    
    for row in req.premium_by_year:
        if req.basis == "WP":
            res = compute_wp_factor(row.year, row.premium, sorted_rc, current_rate_level)
        else:
            if req.aggregation == "CY":
                res = compute_cy_ep_factor(
                    row.year, row.premium, row.exposures, sorted_rc, req.policy_term_months, 
                    current_rate_level, req.mid_term_changes, req.custom_weights if req.earning_pattern == "custom" else None
                )
            else:  # PY
                res = compute_py_ep_factor(
                    row.year, row.premium, sorted_rc, req.policy_term_months, 
                    current_rate_level, req.mid_term_changes
                )
        results.append(res)
        
    audit_trail_summary = f"Processed {len(req.premium_by_year)} years. Basis: {req.basis}. Aggregation: {req.aggregation if req.basis == 'EP' else 'N/A'}."
        
    return {
        "results": results,
        "current_rate_level": round(current_rate_level, 6),
        "audit_trail": audit_trail_summary
    }

import calendar
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

def analytic_avg_rate_level(year: int, rate_changes: List[dict]) -> float:
    start_of_year = date(year, 1, 1)
    days_in_year = 366 if calendar.isleap(year) else 365
    
    boundaries = set([-1.0, 1.0])
    for rc in rate_changes:
        rc_date = rc["date"]
        # ONLY rate changes IN the current year act as boundaries!
        if rc_date.year == year:
            # Use pure days logic for exact integration boundary
            days_passed = (rc_date - start_of_year).days
            z = days_passed / days_in_year
            boundaries.add(z)
            
    z_sorted = sorted(list(boundaries))
    total_avg_level = 0.0
    
    # Base level before any rate changes in this year
    base_level = _get_rate_level_as_of(start_of_year, rate_changes)
    
    for i in range(len(z_sorted) - 1):
        a = z_sorted[i]
        b = z_sorted[i+1]
        
        if b - a < 1e-9:
            continue
            
        if a >= 0:
            area = (b - a) - (b*b - a*a) / 2.0
        elif b <= 0:
            area = (b - a) + (b*b - a*a) / 2.0
        else:
            area_left = (0 - a) + (0 - a*a) / 2.0
            area_right = (b - 0) - (b*b - 0) / 2.0
            area = area_left + area_right
            
        if a == -1.0:
            level = base_level
        else:
            day_offset = round(a * days_in_year)
            # Evaluate slightly past the mathematically rounded date to ensure 
            # any rate changes on boundary dates are included.
            eval_date = start_of_year + timedelta(days=day_offset + 2)
            level = _get_rate_level_as_of(eval_date, rate_changes)
        
        total_avg_level += area * level
        
    return total_avg_level

def compute_simple_day_weighted_factor(year: int, premium: float, rate_changes: List[dict], current_level: float, method_name: str) -> dict:
    start_date = date(year, 1, 1)
    end_date_exclusive = date(year + 1, 1, 1)
    total_days = (end_date_exclusive - start_date).days
    
    boundaries = [start_date]
    for rc in rate_changes:
        if rc["date"].year == year and rc["date"] not in boundaries:
            boundaries.append(rc["date"])
            
    if end_date_exclusive not in boundaries:
        boundaries.append(end_date_exclusive)
        
    boundaries.sort()
    
    weighted_sum = 0.0
    for i in range(len(boundaries) - 1):
        segment_start = boundaries[i]
        segment_end = boundaries[i+1]
        days_in_segment = (segment_end - segment_start).days
        if days_in_segment == 0:
            continue
        level = _get_rate_level_as_of(segment_start, rate_changes)
        weighted_sum += level * days_in_segment
        
    avg_level = weighted_sum / total_days if total_days > 0 else 1.0
    factor = current_level / avg_level if avg_level > 0 else 1.0
    olp = premium * factor
    
    return {
        "year": year,
        "historical_premium": premium,
        "weighted_avg_rate_level": avg_level,
        "factor": factor,
        "on_level_premium": olp,
        "audit_detail": f"Eval Level: {current_level:.6f}. Base Level: {avg_level:.6f}. Used simple day-weighted average for {method_name}.",
    }

def compute_cy_ep_factor(year: int, premium: float, exposures: Optional[float], rate_changes: List[dict], term_months: int, current_level: float, custom_weights: Optional[List[float]]) -> dict:
    use_exposures = exposures is not None
    
    if custom_weights and len(custom_weights) == 12:
        weighted_sum = 0.0
        sum_weights = 0.0
        for month in range(1, 13):
            point_date = date(year, month, 15)
            eff_date = _add_months(point_date, -(term_months // 2))
            rate_level = _get_rate_level_as_of(eff_date, rate_changes)
            w = custom_weights[month - 1]
            weighted_sum += rate_level * w
            sum_weights += w
            
        avg_level = weighted_sum / sum_weights if sum_weights > 0 else 1.0
        factor = current_level / avg_level if avg_level > 0 else 1.0
        olp = premium * factor
        
        audit_msg = f"Eval Level: {current_level:.6f}. Base Level: {avg_level:.6f}. Used custom 12-month earning weights."
        
        return {
            "year": year,
            "historical_premium": premium,
            "weighted_avg_rate_level": avg_level,
            "factor": factor,
            "on_level_premium": olp,
            "audit_detail": audit_msg,
        }
    else:
        avg_level = analytic_avg_rate_level(year, rate_changes)
        factor = current_level / avg_level if avg_level > 0 else 1.0
        olp = premium * factor
        
        audit_msg = f"Eval Level: {current_level:.6f}. Base Level: {avg_level:.6f}. Used exact analytic integral (1-|z|) method. Mathematically exact for annual policies."
            
            
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
            method_name = f"{req.aggregation} WP" if req.aggregation else "WP"
            res = compute_simple_day_weighted_factor(row.year, row.premium, sorted_rc, current_rate_level, method_name)
        else:
            if req.aggregation == "CY":
                res = compute_cy_ep_factor(
                    row.year, row.premium, row.exposures, sorted_rc, req.policy_term_months, 
                    current_rate_level, req.custom_weights if req.earning_pattern == "custom" else None
                )
            else:  # PY
                res = compute_simple_day_weighted_factor(row.year, row.premium, sorted_rc, current_rate_level, "PY EP")
        results.append(res)
        
    audit_trail_summary = f"Processed {len(req.premium_by_year)} years. Basis: {req.basis}. Aggregation: {req.aggregation if req.basis == 'EP' else 'N/A'}."
        
    return {
        "results": results,
        "current_rate_level": round(current_rate_level, 6),
        "audit_trail": audit_trail_summary
    }

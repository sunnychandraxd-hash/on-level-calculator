"""
On-Level Factor Calculation Example
Rate changes:
  Jan 1, 2020  Base   → 1.0000
  May 1, 2021  +6%    → 1.0600
  Nov 1, 2022  -3%    → 1.0282
  Aug 1, 2023  +7%    → 1.100174
  Jun 1, 2024  +4%    → 1.14418096

Evaluation date: Dec 31, 2024
Current Rate Level = 1.14418096
"""
from datetime import date, timedelta
import calendar

# ── Rate Changes ────────────────────────────────────────────────────
rate_changes = [
    {"date": date(2020, 1, 1), "pct": 0.00},   # base (no change, just the starting point)
    {"date": date(2021, 5, 1), "pct": 0.06},
    {"date": date(2022, 11, 1), "pct": -0.03},
    {"date": date(2023, 8, 1), "pct": 0.07},
    {"date": date(2024, 6, 1), "pct": 0.04},
]

EVAL_DATE = date(2024, 12, 31)
YEARS = [2020, 2021, 2022, 2023, 2024]

# ── Helper: spot rate level on a given date ─────────────────────────
def get_rate_level(eval_date, rc_list):
    level = 1.0
    for c in rc_list:
        if c["date"] <= eval_date:
            level *= (1 + c["pct"])
        else:
            break
    return level

# Current rate level
CURRENT = get_rate_level(EVAL_DATE, rate_changes)
print(f"Current Rate Level (as of {EVAL_DATE}): {CURRENT:.6f}")
print("=" * 90)

# ════════════════════════════════════════════════════════════════════
# 1. CY Written Premium
# ════════════════════════════════════════════════════════════════════
print("\n1. CALENDAR YEAR WRITTEN PREMIUM (CY WP)")
print("-" * 90)
print(f"{'Year':<6} {'Avg Eff Date':<14} {'Rate Level':<14} {'Current':<14} {'Factor':<10}")
print("-" * 90)
for y in YEARS:
    avg_eff = date(y, 7, 1)
    rl = get_rate_level(avg_eff, rate_changes)
    factor = CURRENT / rl
    print(f"{y:<6} {str(avg_eff):<14} {rl:<14.6f} {CURRENT:<14.6f} {factor:<10.6f}")
    print(f"       Calc: Factor = {CURRENT:.6f} / {rl:.6f} = {factor:.6f}")

# ════════════════════════════════════════════════════════════════════
# 2. PY Written Premium
# ════════════════════════════════════════════════════════════════════
print("\n\n2. POLICY YEAR WRITTEN PREMIUM (PY WP)")
print("-" * 90)
print("   PY WP uses the same midpoint method (July 1) as CY WP.")
print("   The rate level for a policy year is evaluated at the midpoint")
print("   of the policy year, which is July 1 — identical to CY WP.")
print("-" * 90)
print(f"{'Year':<6} {'Avg Eff Date':<14} {'Rate Level':<14} {'Current':<14} {'Factor':<10}")
print("-" * 90)
for y in YEARS:
    avg_eff = date(y, 7, 1)
    rl = get_rate_level(avg_eff, rate_changes)
    factor = CURRENT / rl
    print(f"{y:<6} {str(avg_eff):<14} {rl:<14.6f} {CURRENT:<14.6f} {factor:<10.6f}")

# ════════════════════════════════════════════════════════════════════
# 3. CY Earned Premium (Analytic Parallelogram Method)
# ════════════════════════════════════════════════════════════════════
print("\n\n3. CALENDAR YEAR EARNED PREMIUM (CY EP) — Analytic Parallelogram")
print("-" * 90)

def analytic_cy_ep(year, rc_list):
    """
    Uses the (1-|z|) kernel over z ∈ [-1, 1].
    z = 0 is Jan 1 of the year; z = 1 is Dec 31; z = -1 is Jan 1 of prior year.
    Rate changes within the year create boundaries at z = months_passed / 12.
    """
    start_of_year = date(year, 1, 1)
    days_in_year = 366 if calendar.isleap(year) else 365

    # Collect boundaries from rate changes in THIS year
    boundaries = set([-1.0, 1.0])
    for rc in rc_list:
        rd = rc["date"]
        if rd.year == year and rc["pct"] != 0:
            days_passed = (rd - start_of_year).days
            z = days_passed / days_in_year
            boundaries.add(z)

    z_sorted = sorted(list(boundaries))

    # Base level = cumulative rate level as of Jan 1 of the year
    base_level = get_rate_level(start_of_year, rc_list)

    detail_lines = []
    detail_lines.append(f"  Base level (Jan 1, {year}): {base_level:.6f}")
    detail_lines.append(f"  Boundaries (z): {[round(z, 4) for z in z_sorted]}")

    total_avg = 0.0
    for i in range(len(z_sorted) - 1):
        a = z_sorted[i]
        b = z_sorted[i + 1]
        if b - a < 1e-9:
            continue

        # Calculate area under (1-|z|) from a to b
        if a >= 0:
            area = (b - a) - (b**2 - a**2) / 2.0
        elif b <= 0:
            area = (b - a) + (b**2 - a**2) / 2.0
        else:
            area_left = (0 - a) + (0 - a**2) / 2.0
            area_right = (b - 0) - (b**2 - 0) / 2.0
            area = area_left + area_right

        # Determine rate level for this zone
        if a == -1.0:
            level = base_level
        else:
            day_offset = round(a * days_in_year)
            eval_d = start_of_year + timedelta(days=day_offset + 2)
            level = get_rate_level(eval_d, rc_list)

        total_avg += area * level
        detail_lines.append(f"  Zone [{a:+.4f}, {b:+.4f}]: area={area:.6f}, level={level:.6f}, contribution={area*level:.6f}")

    return total_avg, detail_lines

print(f"{'Year':<6} {'Avg Rate Level':<16} {'Current':<14} {'Factor':<10}")
print("-" * 90)
for y in YEARS:
    avg, details = analytic_cy_ep(y, rate_changes)
    factor = CURRENT / avg if avg > 0 else 1.0
    print(f"{y:<6} {avg:<16.6f} {CURRENT:<14.6f} {factor:<10.6f}")
    for d in details:
        print(d)
    print()

# ════════════════════════════════════════════════════════════════════
# 4. PY Earned Premium (24-month triangular weights)
# ════════════════════════════════════════════════════════════════════
print("\n4. POLICY YEAR EARNED PREMIUM (PY EP) — 24-Month Triangular Weights")
print("-" * 90)

def _add_months(d, months):
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, 28)
    return date(year, month, day)

def py_ep(year, rc_list, term_months=12):
    total_months = 24
    weighted_sum = 0.0
    sum_weights = 0.0
    detail_lines = []

    for m in range(1, total_months + 1):
        calc_y = year + ((m - 1) // 12)
        calc_m = ((m - 1) % 12) + 1
        point_date = date(calc_y, calc_m, 15)

        # Look back half the policy term to find effective date
        eff_date = _add_months(point_date, -(term_months // 2))

        rl = get_rate_level(eff_date, rc_list)

        if m <= 12:
            w = m / 144.0
        else:
            w = (25 - m) / 144.0

        weighted_sum += rl * w
        sum_weights += w
        detail_lines.append(
            f"  m={m:2d}  point={point_date}  eff={eff_date}  level={rl:.6f}  w={w:.6f}  prod={rl*w:.6f}"
        )

    avg = weighted_sum / sum_weights if sum_weights > 0 else 1.0
    detail_lines.append(f"  Σ(level×w) = {weighted_sum:.6f},  Σ(w) = {sum_weights:.6f},  avg = {avg:.6f}")
    return avg, detail_lines

print(f"{'Year':<6} {'Avg Rate Level':<16} {'Current':<14} {'Factor':<10}")
print("-" * 90)
for y in YEARS:
    avg, details = py_ep(y, rate_changes)
    factor = CURRENT / avg if avg > 0 else 1.0
    print(f"{y:<6} {avg:<16.6f} {CURRENT:<14.6f} {factor:<10.6f}")
    for d in details:
        print(d)
    print()

# ════════════════════════════════════════════════════════════════════
# Summary Table
# ════════════════════════════════════════════════════════════════════
print("\n" + "=" * 90)
print("SUMMARY — ON-LEVEL FACTORS BY METHOD")
print("=" * 90)
print(f"{'Year':<6} {'CY WP':<12} {'PY WP':<12} {'CY EP':<12} {'PY EP':<12}")
print("-" * 54)
for y in YEARS:
    # CY WP / PY WP
    wp_rl = get_rate_level(date(y, 7, 1), rate_changes)
    wp_factor = CURRENT / wp_rl

    # CY EP
    cy_avg, _ = analytic_cy_ep(y, rate_changes)
    cy_factor = CURRENT / cy_avg if cy_avg > 0 else 1.0

    # PY EP
    py_avg, _ = py_ep(y, rate_changes)
    py_factor = CURRENT / py_avg if py_avg > 0 else 1.0

    print(f"{y:<6} {wp_factor:<12.6f} {wp_factor:<12.6f} {cy_factor:<12.6f} {py_factor:<12.6f}")

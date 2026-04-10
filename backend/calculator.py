"""
Backend Calculation Engines — 1:1 port from onlevel2.js and onlevel3.js.

All math is identical to the frontend JS originals.
Return dicts are shaped to match the JS return values exactly,
so the frontend rendering code can consume them without modification.
"""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Optional


# ═══════════════════════════════════════════════
#  SHARED DATE UTILITIES
# ═══════════════════════════════════════════════

def days_in_year(year: int) -> int:
    """Number of days in a given year."""
    return 366 if _is_leap(year) else 365


def _is_leap(year: int) -> bool:
    return (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0)


def _to_abs_day(d: date) -> int:
    """Absolute day count (days since Unix epoch) for ordering."""
    import calendar
    return (d - date(1970, 1, 1)).days


def _date_to_day_index(dt: date, year: int) -> int:
    """Day index of a date relative to Jan 1 of a given year. Can be negative."""
    jan1 = date(year, 1, 1)
    return _to_abs_day(dt) - _to_abs_day(jan1)


def _days_between(a: date, b: date) -> int:
    """Days between two dates (b - a)."""
    return (b - a).days


def _format_date_short(d: date) -> str:
    """Format a date as 'D-Mon-YYYY'."""
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return f"{d.day}-{months[d.month - 1]}-{d.year}"


# ═══════════════════════════════════════════════════════════════════════
#                    ON-LEVEL 2 — CY EARNED PREMIUM
#             (Geometric Square Diagram Method)
# ═══════════════════════════════════════════════════════════════════════


def _ol2_compute_diagonal_lines(rate_changes: list[dict], year: int) -> list[dict]:
    """
    For a given year, compute all 45° diagonal lines that intersect the year-square.
    Each rate change creates line: y = x - c, where c = dateToDayIndex(rateDate, year).
    Returns list of {c, rateChangeIndex, date} sorted by c ascending.
    """
    N = days_in_year(year)
    lines = []

    for i, rc in enumerate(rate_changes):
        c = _date_to_day_index(rc["date"], year)
        # Line intersects [0,N]×[0,N] if -N < c < N
        if c < N and c + N > 0:
            lines.append({"c": c, "rateChangeIndex": i, "date": rc["date"]})

    lines.sort(key=lambda l: l["c"])
    return lines


def _ol2_clip_line_to_square(c: int, N: int) -> Optional[dict]:
    """
    Clip a 45° line (y = x - c) to the square [0, N] × [0, N].
    Returns {entry: {x, y, edge}, exit: {x, y, edge}} or None.
    """
    candidates = []

    # Bottom edge: y=0, x=c
    if 0 <= c <= N:
        candidates.append({"x": c, "y": 0, "edge": "bottom"})
    # Left edge: x=0, y=-c
    if 0 <= -c <= N:
        candidates.append({"x": 0, "y": -c, "edge": "left"})
    # Top edge: y=N, x=c+N
    if 0 <= c + N <= N:
        candidates.append({"x": c + N, "y": N, "edge": "top"})
    # Right edge: x=N, y=N-c
    if 0 <= N - c <= N:
        candidates.append({"x": N, "y": N - c, "edge": "right"})

    # Remove duplicates (corner cases)
    unique = []
    for pt in candidates:
        if not any(abs(u["x"] - pt["x"]) < 0.001 and abs(u["y"] - pt["y"]) < 0.001 for u in unique):
            unique.append(pt)

    if len(unique) < 2:
        return None

    unique.sort(key=lambda p: (p["x"], p["y"]))
    return {"entry": unique[0], "exit": unique[-1]}


def _ol2_area_above_line(c: float, N: int) -> float:
    """
    Area ABOVE the line y = x - c in the square [0, N] × [0, N].
    """
    if c <= -N:
        return 0.0
    if c >= N:
        return float(N * N)
    if c <= 0:
        return (N + c) * (N + c) / 2.0
    return N * N - (N - c) * (N - c) / 2.0


def _ol2_boundary_walk(from_pt: dict, to_pt: dict, N: int, direction: str) -> list[dict]:
    """
    Walk along the square boundary from point A to point B,
    collecting corner points along the way.
    CW parameterization: bottom(0→N) → right(N→2N) → top(2N→3N) → left(3N→4N)
    """
    perimeter = 4 * N

    def point_to_t(p):
        eps = 0.01
        if abs(p["y"]) < eps:
            return p["x"]              # bottom
        if abs(p["x"] - N) < eps:
            return N + p["y"]          # right
        if abs(p["y"] - N) < eps:
            return 2 * N + (N - p["x"])  # top
        if abs(p["x"]) < eps:
            return 3 * N + (N - p["y"])  # left
        return 0

    def t_to_point(t):
        tt = t % perimeter
        if tt < 0:
            tt += perimeter
        if tt <= N:
            return {"x": tt, "y": 0}
        if tt <= 2 * N:
            return {"x": N, "y": tt - N}
        if tt <= 3 * N:
            return {"x": 3 * N - tt, "y": N}
        return {"x": 0, "y": perimeter - tt}

    t_from = point_to_t(from_pt)
    t_to = point_to_t(to_pt)

    if direction == "cw":
        if t_to <= t_from + 0.01:
            t_to += perimeter
    else:
        if t_to >= t_from - 0.01:
            t_to -= perimeter

    corners = [0, N, 2 * N, 3 * N]
    points = []

    if direction == "cw":
        for ct in corners:
            ctt = ct
            while ctt < t_from + 0.01:
                ctt += perimeter
            if ctt > t_from + 0.01 and ctt < t_to - 0.01:
                points.append({"pt": t_to_point(ctt), "t": ctt})
        points.sort(key=lambda p: p["t"])
    else:
        for ct in corners:
            ctt = ct
            while ctt > t_from - 0.01:
                ctt -= perimeter
            if ctt < t_from - 0.01 and ctt > t_to + 0.01:
                points.append({"pt": t_to_point(ctt), "t": ctt})
        points.sort(key=lambda p: -p["t"])

    return [p["pt"] for p in points]


def _ol2_compute_regions(N: int, clipped_lines: list[dict]) -> list[dict]:
    """
    Split the year-square into polygonal regions using clipped diagonal lines.
    Areas computed analytically. Vertices for rendering.
    """
    if not clipped_lines:
        return [{
            "vertices": [
                {"x": 0, "y": 0}, {"x": N, "y": 0},
                {"x": N, "y": N}, {"x": 0, "y": N}
            ],
            "rateLevelIndex": 0,
            "area": N * N,
            "areaFraction": 1.0
        }]

    regions = []
    n_lines = len(clipped_lines)
    total_area = N * N

    # Region ABOVE all lines (top-left, rateLevelIndex = nLines)
    line = clipped_lines[0]
    area = _ol2_area_above_line(line["c"], N)
    verts = [{"x": line["exit"]["x"], "y": line["exit"]["y"]}]
    bw = _ol2_boundary_walk(line["exit"], line["entry"], N, "cw")
    verts.extend(bw)
    verts.append({"x": line["entry"]["x"], "y": line["entry"]["y"]})
    regions.append({
        "vertices": verts,
        "rateLevelIndex": n_lines,
        "area": area,
        "areaFraction": area / total_area
    })

    # Regions BETWEEN consecutive lines
    for i in range(n_lines - 1):
        line_a = clipped_lines[i]
        line_b = clipped_lines[i + 1]
        area = _ol2_area_above_line(line_b["c"], N) - _ol2_area_above_line(line_a["c"], N)

        verts = [
            {"x": line_a["entry"]["x"], "y": line_a["entry"]["y"]},
            {"x": line_a["exit"]["x"], "y": line_a["exit"]["y"]},
        ]
        bw1 = _ol2_boundary_walk(line_a["exit"], line_b["exit"], N, "ccw")
        verts.extend(bw1)
        verts.append({"x": line_b["exit"]["x"], "y": line_b["exit"]["y"]})
        verts.append({"x": line_b["entry"]["x"], "y": line_b["entry"]["y"]})
        bw2 = _ol2_boundary_walk(line_b["entry"], line_a["entry"], N, "ccw")
        verts.extend(bw2)

        regions.append({
            "vertices": verts,
            "rateLevelIndex": i + 1,
            "area": area,
            "areaFraction": area / total_area
        })

    # Region BELOW all lines (bottom-right, rateLevelIndex = 0)
    line = clipped_lines[-1]
    area = total_area - _ol2_area_above_line(line["c"], N)
    verts = [{"x": line["entry"]["x"], "y": line["entry"]["y"]}]
    bw = _ol2_boundary_walk(line["entry"], line["exit"], N, "cw")
    verts.extend(bw)
    verts.append({"x": line["exit"]["x"], "y": line["exit"]["y"]})
    regions.append({
        "vertices": verts,
        "rateLevelIndex": 0,
        "area": area,
        "areaFraction": area / total_area
    })

    return regions


def _ol2_compute_rate_levels(rate_changes: list[dict], lines_for_year: list[dict]) -> list[dict]:
    """
    Compute cumulative rate level for each region.
    Returns list indexed by rateLevelIndex.
    """
    # Build cumulative rate levels
    cumulative_levels = [1.0]
    level = 1.0
    for rc in rate_changes:
        level *= (1 + rc["pct"] / 100.0)
        cumulative_levels.append(level)

    region_levels = []

    if not lines_for_year:
        region_levels.append({
            "level": cumulative_levels[-1],
            "label": "Current Level"
        })
        return region_levels

    earliest_idx = lines_for_year[0]["rateChangeIndex"]
    latest_idx = lines_for_year[-1]["rateChangeIndex"]

    # rateLevelIndex 0: below all lines = after latest visible change
    region_levels.append({
        "level": cumulative_levels[latest_idx + 1],
        "label": f"After {_format_date_short(lines_for_year[-1]['date'])}",
        "changeIndex": latest_idx
    })

    # Regions between consecutive lines
    for i in range(len(lines_for_year) - 1):
        region_levels.append({
            "level": cumulative_levels[lines_for_year[i]["rateChangeIndex"] + 1],
            "label": f"Between {_format_date_short(lines_for_year[i]['date'])} & {_format_date_short(lines_for_year[i + 1]['date'])}",
            "changeIndex": lines_for_year[i]["rateChangeIndex"]
        })

    # rateLevelIndex = numLines: above all lines = before earliest visible change
    region_levels.append({
        "level": cumulative_levels[earliest_idx],
        "label": f"Before {_format_date_short(lines_for_year[0]['date'])}",
        "changeIndex": earliest_idx - 1 if earliest_idx > 0 else -1
    })

    return region_levels


def _ol2_compute_weighted_avg_level(regions: list[dict]) -> float:
    """Weighted average rate level by area fraction."""
    weighted_sum = 0.0
    total_weight = 0.0
    for region in regions:
        weighted_sum += region["rateLevel"] * region["areaFraction"]
        total_weight += region["areaFraction"]
    return weighted_sum / total_weight if total_weight > 0 else 1.0


def ol2_calculate(rate_changes_raw: list[dict]) -> Optional[dict]:
    """
    Main CY EP calculation entry point.
    Input:  [{date: date, pct: float}]
    Output: {years, yearData, currentLevel, rateChanges}
    """
    if not rate_changes_raw:
        return None

    # Parse and sort
    parsed = []
    for i, rc in enumerate(rate_changes_raw):
        d = rc["date"] if isinstance(rc["date"], date) else date.fromisoformat(str(rc["date"]))
        parsed.append({"date": d, "pct": float(rc["pct"]), "index": i})
    parsed.sort(key=lambda rc: _to_abs_day(rc["date"]))

    sorted_rcs = []
    for i, rc in enumerate(parsed):
        sorted_rcs.append({
            "date": rc["date"],
            "pct": rc["pct"],
            "originalIndex": rc["index"],
            "sortedIndex": i
        })

    # Current cumulative level
    current_level = 1.0
    for rc in sorted_rcs:
        current_level *= (1 + rc["pct"] / 100.0)

    # Year range
    min_year = sorted_rcs[0]["date"].year
    max_year = sorted_rcs[-1]["date"].year
    years = list(range(min_year, max_year + 2))

    # For level computation
    rc_for_levels = [{"date": rc["date"], "pct": rc["pct"], "rateChangeIndex": i}
                     for i, rc in enumerate(sorted_rcs)]

    year_data = {}

    for year in years:
        N = days_in_year(year)

        # Diagonal lines intersecting this year-square
        raw_lines = _ol2_compute_diagonal_lines(rc_for_levels, year)

        # Clip each line
        clipped_lines = []
        for line in raw_lines:
            clipped = _ol2_clip_line_to_square(line["c"], N)
            if clipped:
                clipped_lines.append({
                    "entry": clipped["entry"],
                    "exit": clipped["exit"],
                    "c": line["c"],
                    "rateChangeIndex": line["rateChangeIndex"],
                    "date": line["date"]
                })

        # Compute regions
        regions = _ol2_compute_regions(N, clipped_lines)

        # Compute rate levels
        rate_levels = _ol2_compute_rate_levels(sorted_rcs, clipped_lines)

        # Assign rate level info to each region
        for region in regions:
            rl = rate_levels[region["rateLevelIndex"]] if region["rateLevelIndex"] < len(rate_levels) else None
            if rl:
                region["rateLevel"] = rl["level"]
                region["rateLevelLabel"] = rl["label"]
            else:
                region["rateLevel"] = 1.0
                region["rateLevelLabel"] = "Unknown"

        # Verify areas
        total_area = sum(r["area"] for r in regions)
        expected_area = N * N

        # Serialize lines for JSON (convert date objects)
        serialized_lines = []
        for cl in clipped_lines:
            serialized_lines.append({
                "entry": cl["entry"],
                "exit": cl["exit"],
                "c": cl["c"],
                "rateChangeIndex": cl["rateChangeIndex"],
                "date": cl["date"].isoformat()
            })

        # Compute weighted average and on-level factor for this year
        weighted_avg = _ol2_compute_weighted_avg_level(regions)
        ol_factor = current_level / weighted_avg if weighted_avg > 0 else 1.0

        year_data[str(year)] = {
            "N": N,
            "lines": serialized_lines,
            "regions": regions,
            "rateLevels": [
                {k: (v.isoformat() if isinstance(v, date) else v) for k, v in rl.items()}
                for rl in rate_levels
            ],
            "totalArea": total_area,
            "expectedArea": expected_area,
            "areaCheck": abs(total_area - expected_area) < 1,
            "weightedAvgLevel": weighted_avg,
            "olFactor": ol_factor
        }

    # Serialize rate changes for JSON
    serialized_rcs = []
    for rc in sorted_rcs:
        serialized_rcs.append({
            "date": rc["date"].isoformat(),
            "pct": rc["pct"],
            "originalIndex": rc["originalIndex"],
            "sortedIndex": rc["sortedIndex"]
        })

    return {
        "years": years,
        "yearData": year_data,
        "currentLevel": current_level,
        "rateChanges": serialized_rcs
    }


# ═══════════════════════════════════════════════════════════════════════
#                    ON-LEVEL 3 — PY EARNED PREMIUM
#             (Parallelogram Method — Parallel Strips)
# ═══════════════════════════════════════════════════════════════════════


def _ol3_rate_level_as_of(eval_date: date, sorted_rcs: list[dict]) -> float:
    """Cumulative rate level active on or before eval_date."""
    level = 1.0
    for rc in sorted_rcs:
        if _to_abs_day(rc["date"]) <= _to_abs_day(eval_date):
            level *= (1 + rc["pct"] / 100.0)
        else:
            break
    return level


def _ol3_compute_py_strips(year: int, sorted_rcs: list[dict]) -> dict:
    """
    Compute PY EP parallelogram strips for a single policy year.
    Returns {strips, weightedAvgLevel, daysInYr}.
    """
    jan1 = date(year, 1, 1)
    dec31 = date(year, 12, 31)
    days_in_yr = days_in_year(year)
    end_sentinel = date(year + 1, 1, 1)

    # Build boundary dates
    boundaries = [jan1]

    for rc in sorted_rcs:
        d = rc["date"]
        if _to_abs_day(d) >= _to_abs_day(jan1) and _to_abs_day(d) <= _to_abs_day(dec31):
            if not any(_to_abs_day(b) == _to_abs_day(d) for b in boundaries):
                boundaries.append(d)

    boundaries.sort(key=_to_abs_day)
    boundaries.append(end_sentinel)

    # Build strips
    strips = []
    for i in range(len(boundaries) - 1):
        seg_start = boundaries[i]
        seg_end = boundaries[i + 1]

        days = _days_between(seg_start, seg_end)
        weight = days / days_in_yr

        level = _ol3_rate_level_as_of(seg_start, sorted_rcs)

        seg_end_incl = seg_end - timedelta(days=1)

        if i == 0 and len(boundaries) == 2:
            label = "Full Year"
        elif i == 0:
            label = f"Jan 1 – {_format_date_short(seg_end_incl)}"
        else:
            label = f"{_format_date_short(seg_start)} – {_format_date_short(seg_end_incl)}"

        strips.append({
            "segStart": seg_start.isoformat(),
            "segEndIncl": seg_end_incl.isoformat(),
            "days": days,
            "weight": weight,
            "level": level,
            "label": label
        })

    # Weighted average rate level
    weighted_avg_level = sum(st["weight"] * st["level"] for st in strips)

    return {
        "strips": strips,
        "weightedAvgLevel": weighted_avg_level,
        "daysInYr": days_in_yr
    }


def ol3_calculate(rate_changes_raw: list[dict],
                  eval_date_raw: Optional[date] = None) -> Optional[dict]:
    """
    Main PY EP calculation entry point.
    Input:  [{date, pct}], optional eval_date
    Output: {yearResults, currentLevel, sortedRCs}
    """
    if not rate_changes_raw:
        return None

    # Parse and sort
    sorted_rcs = []
    for rc in rate_changes_raw:
        d = rc["date"] if isinstance(rc["date"], date) else date.fromisoformat(str(rc["date"]))
        sorted_rcs.append({"date": d, "pct": float(rc["pct"])})
    sorted_rcs.sort(key=lambda rc: _to_abs_day(rc["date"]))

    # Evaluation date
    eval_dt = eval_date_raw if eval_date_raw else sorted_rcs[-1]["date"]
    if isinstance(eval_dt, str):
        eval_dt = date.fromisoformat(eval_dt)

    current_level = _ol3_rate_level_as_of(eval_dt, sorted_rcs)

    # Year range
    min_year = sorted_rcs[0]["date"].year
    max_year = sorted_rcs[-1]["date"].year

    year_results = []
    for yr in range(min_year, max_year + 1):
        result = _ol3_compute_py_strips(yr, sorted_rcs)
        ol_factor = current_level / result["weightedAvgLevel"] if result["weightedAvgLevel"] > 0 else 1.0

        year_results.append({
            "year": yr,
            "daysInYr": result["daysInYr"],
            "strips": result["strips"],
            "weightedAvgLevel": result["weightedAvgLevel"],
            "currentLevel": current_level,
            "olFactor": ol_factor,
            "isLeap": _is_leap(yr)
        })

    # Serialize for JSON
    serialized_rcs = [{"date": rc["date"].isoformat(), "pct": rc["pct"]} for rc in sorted_rcs]

    return {
        "yearResults": year_results,
        "currentLevel": current_level,
        "sortedRCs": serialized_rcs
    }

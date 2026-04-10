/* ────────────────────────────────────────────
   On-Leveling 2 — CY Earned Premium
   Geometric Square Diagram Method
   ──────────────────────────────────────────── */
const OnLevel2 = (() => {
    'use strict';

    // ══════════════════════════════════════════
    //  DATE PARSING (needed for hydration of API responses)
    // ══════════════════════════════════════════

    /** Parse a date string "YYYY-MM-DD" to a Date object */
    function parseDate(s) {
        const parts = s.split('-');
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }

    // ══════════════════════════════════════════
    //  MAIN CALCULATION (Backend API)
    // ══════════════════════════════════════════

    /**
     * Main entry point. Given rate changes [{date, pct}], calls the backend API.
     * Returns { years: [...], yearData: { [year]: { regions, lines, rateLevels } }, currentLevel }
     */
    async function calculate(rateChanges) {
        if (!rateChanges || rateChanges.length === 0) {
            return null;
        }

        // Build request payload — dates as YYYY-MM-DD strings
        const payload = {
            rate_changes: rateChanges.map(rc => ({
                date: (rc.date instanceof Date)
                    ? rc.date.toISOString().split('T')[0]
                    : String(rc.date).split('T')[0],
                pct: parseFloat(rc.pct)
            }))
        };

        const response = await fetch('/api/onlevel2/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Calculation failed');
        }

        const result = await response.json();

        // Hydrate: the backend returns yearData keyed by string year.
        // The frontend expects numeric year keys.  Also convert line date
        // strings back to Date objects for any rendering that needs them.
        const hydratedYearData = {};
        for (const yr of result.years) {
            const yd = result.yearData[String(yr)];
            // Hydrate line dates
            if (yd.lines) {
                yd.lines.forEach(line => {
                    if (typeof line.date === 'string') {
                        line.date = parseDate(line.date);
                    }
                });
            }
            hydratedYearData[yr] = yd;
        }
        result.yearData = hydratedYearData;

        // Hydrate rateChanges dates
        if (result.rateChanges) {
            result.rateChanges.forEach(rc => {
                if (typeof rc.date === 'string') {
                    rc.date = parseDate(rc.date);
                }
            });
        }

        return result;
    }

    // ══════════════════════════════════════════
    //  CANVAS RENDERING
    // ══════════════════════════════════════════

    // Color palette for regions (distinct, semi-transparent)
    const REGION_COLORS = [
        'rgba(56, 189, 248, 0.35)',   // sky blue
        'rgba(129, 140, 248, 0.35)',  // indigo
        'rgba(52, 211, 153, 0.35)',   // emerald
        'rgba(251, 191, 36, 0.35)',   // amber
        'rgba(248, 113, 113, 0.35)',  // red
        'rgba(167, 139, 250, 0.35)', // violet
        'rgba(251, 146, 60, 0.35)',   // orange
        'rgba(45, 212, 191, 0.35)',   // teal
        'rgba(232, 121, 249, 0.35)', // fuchsia
        'rgba(163, 230, 53, 0.35)',   // lime
    ];

    const REGION_BORDER_COLORS = [
        'rgba(56, 189, 248, 0.8)',
        'rgba(129, 140, 248, 0.8)',
        'rgba(52, 211, 153, 0.8)',
        'rgba(251, 191, 36, 0.8)',
        'rgba(248, 113, 113, 0.8)',
        'rgba(167, 139, 250, 0.8)',
        'rgba(251, 146, 60, 0.8)',
        'rgba(45, 212, 191, 0.8)',
        'rgba(232, 121, 249, 0.8)',
        'rgba(163, 230, 53, 0.8)',
    ];

    /**
     * Render the full multi-year diagram onto a canvas.
     */
    function render(canvas, result) {
        if (!canvas || !result) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        // Layout constants
        const padding = { top: 50, bottom: 60, left: 70, right: 30 };
        const squareSpacing = 8; // gap between year squares
        const numYears = result.years.length;

        // Calculate available size
        const containerWidth = canvas.parentElement.clientWidth || 900;
        const maxSquareSize = 300;
        const availableWidth = containerWidth - padding.left - padding.right - (numYears - 1) * squareSpacing;
        const squarePixelSize = Math.min(maxSquareSize, Math.floor(availableWidth / numYears));

        const totalWidth = padding.left + numYears * squarePixelSize + (numYears - 1) * squareSpacing + padding.right;
        const totalHeight = padding.top + squarePixelSize + padding.bottom;

        // Set canvas size with DPR
        canvas.width = totalWidth * dpr;
        canvas.height = totalHeight * dpr;
        canvas.style.width = totalWidth + 'px';
        canvas.style.height = totalHeight + 'px';
        ctx.scale(dpr, dpr);

        // Clear
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        // Draw each year
        for (let yi = 0; yi < numYears; yi++) {
            const year = result.years[yi];
            const yd = result.yearData[year];
            const N = yd.N;
            const ox = padding.left + yi * (squarePixelSize + squareSpacing); // origin x
            const oy = padding.top + squarePixelSize; // origin y (bottom of square, since y-axis goes up)

            const scale = squarePixelSize / N;

            // Helper: convert data coords to canvas coords
            const toCanvas = (dx, dy) => ({
                cx: ox + dx * scale,
                cy: oy - dy * scale // flip y-axis
            });

            // Draw region fills
            for (let ri = 0; ri < yd.regions.length; ri++) {
                const region = yd.regions[ri];
                const colorIdx = region.rateLevelIndex % REGION_COLORS.length;

                ctx.beginPath();
                const first = toCanvas(region.vertices[0].x, region.vertices[0].y);
                ctx.moveTo(first.cx, first.cy);
                for (let vi = 1; vi < region.vertices.length; vi++) {
                    const pt = toCanvas(region.vertices[vi].x, region.vertices[vi].y);
                    ctx.lineTo(pt.cx, pt.cy);
                }
                ctx.closePath();
                ctx.fillStyle = REGION_COLORS[colorIdx];
                ctx.fill();
                ctx.strokeStyle = REGION_BORDER_COLORS[colorIdx];
                ctx.lineWidth = 0.5;
                ctx.stroke();

                // Only draw text if area is large enough (>= 1%) to prevent crowding
                if (region.areaFraction >= 0.01) {
                    const centroid = computeCentroid(region.vertices);
                    const cp = toCanvas(centroid.x, centroid.y);
                    ctx.fillStyle = '#ffffff';
                    ctx.font = `bold ${Math.max(11, squarePixelSize / 26)}px Inter, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const pctText = (region.areaFraction * 100).toFixed(1) + '%';
                    ctx.fillText(pctText, cp.cx, cp.cy);

                    ctx.font = `${Math.max(9, squarePixelSize / 32)}px Inter, sans-serif`;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
                    ctx.fillText(region.rateLevel.toFixed(4), cp.cx, cp.cy + Math.max(14, squarePixelSize / 18));
                }
            }

            // Draw square border
            const bl = toCanvas(0, 0);
            const tr = toCanvas(N, N);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(bl.cx, tr.cy, squarePixelSize, squarePixelSize);

            // Draw diagonal lines
            for (const line of yd.lines) {
                const entryPt = toCanvas(line.entry.x, line.entry.y);
                const exitPt = toCanvas(line.exit.x, line.exit.y);

                ctx.beginPath();
                ctx.moveTo(entryPt.cx, entryPt.cy);
                ctx.lineTo(exitPt.cx, exitPt.cy);
                ctx.strokeStyle = '#f8fafc';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Note: Line date labels removed here to prevent overlaps and 
                // cleanly emphasize just area % and rate levels.
            }

            // Year label below
            ctx.fillStyle = '#e2e8f0';
            ctx.font = `bold ${Math.max(12, squarePixelSize / 20)}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(String(year), ox + squarePixelSize / 2, oy + 22);

            // Y-axis labels (left side, only for first year)
            if (yi === 0) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = `${Math.max(9, squarePixelSize / 35)}px Inter, sans-serif`;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                const steps = 4;
                for (let s = 0; s <= steps; s++) {
                    const val = Math.round((s / steps) * N);
                    const pt = toCanvas(0, val);
                    ctx.fillText(String(val), pt.cx - 6, pt.cy);
                    // Tick mark
                    ctx.beginPath();
                    ctx.moveTo(pt.cx - 3, pt.cy);
                    ctx.lineTo(pt.cx, pt.cy);
                    ctx.strokeStyle = '#64748b';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }

                // Y-axis title
                ctx.save();
                ctx.translate(12, oy - squarePixelSize / 2);
                ctx.rotate(-Math.PI / 2);
                ctx.fillStyle = '#94a3b8';
                ctx.font = `${Math.max(9, squarePixelSize / 30)}px Inter, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText('Earning Progress (days)', 0, 0);
                ctx.restore();
            }

            // X-axis labels (bottom)
            ctx.fillStyle = '#94a3b8';
            ctx.font = `${Math.max(8, squarePixelSize / 38)}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const xSteps = 4;
            for (let s = 0; s <= xSteps; s++) {
                const val = Math.round((s / xSteps) * N);
                const pt = toCanvas(val, 0);
                ctx.fillText(String(val), pt.cx, pt.cy + 4);
            }
        }

        // Title
        ctx.fillStyle = '#e2e8f0';
        ctx.font = `bold 14px Inter, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText('CY Earned Premium — Parallelogram Diagram', padding.left, 20);

        // Subtitle
        ctx.fillStyle = '#94a3b8';
        ctx.font = `11px Inter, sans-serif`;
        ctx.fillText('Each square = 1 calendar year. Diagonal lines = rate change boundaries (45°).', padding.left, 36);

        // Store region rects for tooltip hit-testing
        canvas._onlevel2Data = result;
        canvas._yearLayout = result.years.map((year, yi) => ({
            year,
            ox: padding.left + yi * (squarePixelSize + squareSpacing),
            oy: padding.top + squarePixelSize,
            size: squarePixelSize,
            N: result.yearData[year].N
        }));
    }

    /**
     * Compute the true polygon centroid (center of mass) using the shoelace area method.
     */
    function computeCentroid(vertices) {
        let cx = 0, cy = 0;
        let signedArea = 0;
        const n = vertices.length;
        
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const factor = vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
            cx += (vertices[i].x + vertices[j].x) * factor;
            cy += (vertices[i].y + vertices[j].y) * factor;
            signedArea += factor;
        }
        
        signedArea /= 2;
        
        // Fallback to vertex average if area is extremely small
        if (Math.abs(signedArea) < 0.1) {
            cx = 0; cy = 0;
            for (const v of vertices) {
                cx += v.x;
                cy += v.y;
            }
            return { x: cx / n, y: cy / n };
        }
        
        return {
            x: cx / (6 * signedArea),
            y: cy / (6 * signedArea)
        };
    }

    /**
     * Check if a canvas pixel point is inside a polygon region (for tooltips).
     * Uses ray-casting algorithm.
     */
    function pointInPolygon(px, py, vertices) {
        let inside = false;
        const n = vertices.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;
            if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Handle mouse move for tooltips on canvas.
     */
    function setupTooltip(canvas, tooltipEl) {
        canvas.addEventListener('mousemove', (e) => {
            if (!canvas._yearLayout || !canvas._onlevel2Data) {
                tooltipEl.style.display = 'none';
                return;
            }

            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            let found = false;

            for (const yl of canvas._yearLayout) {
                const scale = yl.size / yl.N;
                // Convert mouse coords to data coords for this year
                const dx = (mx - yl.ox) / scale;
                const dy = (yl.oy - my) / scale; // flip y

                if (dx < 0 || dx > yl.N || dy < 0 || dy > yl.N) continue;

                const yd = canvas._onlevel2Data.yearData[yl.year];
                for (const region of yd.regions) {
                    if (pointInPolygon(dx, dy, region.vertices)) {
                        tooltipEl.style.display = 'block';
                        tooltipEl.style.left = (e.clientX + 12) + 'px';
                        tooltipEl.style.top = (e.clientY - 30) + 'px';
                        tooltipEl.innerHTML = `
                            <strong>Year ${yl.year}</strong><br>
                            Rate Level: <strong>${region.rateLevel.toFixed(4)}</strong><br>
                            Area: <strong>${(region.areaFraction * 100).toFixed(2)}%</strong><br>
                            <span style="color:#94a3b8">${region.rateLevelLabel}</span>
                        `;
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }

            if (!found) {
                tooltipEl.style.display = 'none';
            }
        });

        canvas.addEventListener('mouseleave', () => {
            tooltipEl.style.display = 'none';
        });
    }

    /**
     * Build the results table data.
     */
    function buildResultsTable(result) {
        const rows = [];
        for (const year of result.years) {
            const yd = result.yearData[year];
            for (let i = 0; i < yd.regions.length; i++) {
                const region = yd.regions[i];
                rows.push({
                    year,
                    regionIndex: i + 1,
                    regionLabel: region.rateLevelLabel || `Region ${i + 1}`,
                    vertices: region.vertices.length,
                    rateLevel: region.rateLevel,
                    area: region.area,
                    areaFraction: region.areaFraction,
                    areaPct: (region.areaFraction * 100).toFixed(2) + '%',
                });
            }
            // Add verification row
            rows.push({
                year,
                regionIndex: '✓',
                regionLabel: `Total (${yd.areaCheck ? '✅ PASS' : '❌ FAIL'})`,
                vertices: '—',
                rateLevel: null,
                area: yd.totalArea,
                areaFraction: yd.totalArea / yd.expectedArea,
                areaPct: ((yd.totalArea / yd.expectedArea) * 100).toFixed(2) + '%',
                isTotal: true
            });
        }
        return rows;
    }

    // ══════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════

    return {
        calculate,
        render,
        setupTooltip,
        buildResultsTable
    };
})();

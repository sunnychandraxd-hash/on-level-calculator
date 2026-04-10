/* ────────────────────────────────────────────
   On-Leveling 3 — PY Earned Premium
   Parallelogram Method (Parallel Strips)
   ──────────────────────────────────────────── */
const OnLevel3 = (() => {
    'use strict';

    // ══════════════════════════════════════════
    //  DATE UTILITIES (kept for rendering/hydration)
    // ══════════════════════════════════════════

    /** Parse "YYYY-MM-DD" → Date (local midnight, no UTC shift) */
    function parseDate(s) {
        const [y, m, d] = s.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    /** Absolute day count (for comparison only) */
    function absDay(d) {
        return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    }

    /** Days between two dates (end - start, exclusive of end) */
    function daysBetween(a, b) {
        return Math.round((absDay(b) - absDay(a)));
    }

    /**
     * Main calculation entry point — calls the backend API.
     * Returns { yearResults, currentLevel, sortedRCs }
     */
    async function calculate(rateChangesRaw, evalDateRaw) {
        if (!rateChangesRaw || rateChangesRaw.length === 0) return null;

        // Build request payload
        const payload = {
            rate_changes: rateChangesRaw.map(rc => ({
                date: (rc.date instanceof Date)
                    ? rc.date.toISOString().split('T')[0]
                    : String(rc.date).split('T')[0],
                pct: parseFloat(rc.pct)
            }))
        };

        if (evalDateRaw) {
            payload.eval_date = (evalDateRaw instanceof Date)
                ? evalDateRaw.toISOString().split('T')[0]
                : String(evalDateRaw).split('T')[0];
        }

        const response = await fetch('/api/onlevel3/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Calculation failed');
        }

        const result = await response.json();

        // Hydrate date strings back to Date objects for rendering
        if (result.yearResults) {
            result.yearResults.forEach(yr => {
                yr.strips.forEach(st => {
                    if (typeof st.segStart === 'string') st.segStart = parseDate(st.segStart);
                    if (typeof st.segEndIncl === 'string') st.segEndIncl = parseDate(st.segEndIncl);
                });
            });
        }
        if (result.sortedRCs) {
            result.sortedRCs.forEach(rc => {
                if (typeof rc.date === 'string') rc.date = parseDate(rc.date);
            });
        }

        return result;
    }

    // ══════════════════════════════════════════
    //  CANVAS RENDERER
    // ══════════════════════════════════════════

    const STRIP_COLORS = [
        'rgba(56, 189, 248, 0.38)',   // sky blue
        'rgba(129, 140, 248, 0.38)',  // indigo
        'rgba(52, 211, 153, 0.38)',   // emerald
        'rgba(251, 191, 36, 0.38)',   // amber
        'rgba(251, 113, 133, 0.38)',  // rose
        'rgba(167, 139, 250, 0.38)',  // violet
        'rgba(34, 211, 238, 0.38)',   // cyan
        'rgba(251, 146, 60, 0.38)',   // orange
    ];
    const STRIP_BORDERS = [
        'rgba(56, 189, 248, 0.90)',
        'rgba(129, 140, 248, 0.90)',
        'rgba(52, 211, 153, 0.90)',
        'rgba(251, 191, 36, 0.90)',
        'rgba(251, 113, 133, 0.90)',
        'rgba(167, 139, 250, 0.90)',
        'rgba(34, 211, 238, 0.90)',
        'rgba(251, 146, 60, 0.90)',
    ];

    /**
     * Render all PY parallelograms onto canvasEl.
     *
     * Layout per year:
     *   The parallelogram is drawn as a skewed quadrilateral:
     *   - Bottom-left  (BL): (pad, yearTop + blockH)               ← writing start Jan 1
     *   - Bottom-right (BR): (pad + blockW, yearTop + blockH)       ← writing end Dec 31
     *   - Top-right    (TR): (pad + blockW + skew, yearTop)         ← Dec 31 fully earned
     *   - Top-left     (TL): (pad + skew, yearTop)                  ← Jan 1 fully earned
     *
     * "skew" = horizontal offset of the top edge relative to the bottom edge,
     * representing the 1-year earning shift.
     *
     * Rate change strips are vertical cuts of this parallelogram.
     */
    function render(canvasEl, yearResults, tooltipEl) {
        const dpr = window.devicePixelRatio || 1;

        const pad      = 64;
        const blockH   = 110;  // height of each parallelogram
        const skew     = 90;   // horizontal skew representing 1-year earning
        const gap      = 60;   // vertical gap between years
        const labelH   = 22;   // space below each block for year label

        const totalYears = yearResults.length;
        const canvasW  = Math.max(800, 680 + skew + 2 * pad);
        const blockW   = canvasW - 2 * pad - skew;
        const canvasH  = pad + totalYears * (blockH + gap + labelH) + pad;

        canvasEl.width  = canvasW * dpr;
        canvasEl.height = canvasH * dpr;
        canvasEl.style.width  = canvasW + 'px';
        canvasEl.style.height = canvasH + 'px';

        const ctx = canvasEl.getContext('2d');
        ctx.scale(dpr, dpr);

        // Background
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Metadata for tooltip hit-testing
        const hitZones = [];

        yearResults.forEach((yr, yi) => {
            const yearTop = pad + yi * (blockH + gap + labelH);
            const daysInYr = yr.daysInYr;

            // Helper: convert day-offset (0…daysInYr) to x pixel on the bottom edge
            function dayToX(dayOffset) {
                return pad + (dayOffset / daysInYr) * blockW;
            }

            // ── Draw each strip ──
            yr.strips.forEach((st, si) => {
                const colorIdx = si % STRIP_COLORS.length;

                const startDayOffset = daysBetween(new Date(yr.year, 0, 1), st.segStart);
                const endDayOffset   = startDayOffset + st.days;

                // Parallelogram strip vertices:
                // Bottom-left of strip: (x0_bot, yearTop + blockH)
                // Bottom-right of strip: (x1_bot, yearTop + blockH)
                // Top-right of strip: (x1_bot + skew, yearTop)
                // Top-left of strip: (x0_bot + skew, yearTop)
                const x0b = dayToX(startDayOffset);
                const x1b = dayToX(endDayOffset);
                const y_bot = yearTop + blockH;
                const y_top = yearTop;

                ctx.beginPath();
                ctx.moveTo(x0b,        y_bot);
                ctx.lineTo(x1b,        y_bot);
                ctx.lineTo(x1b + skew, y_top);
                ctx.lineTo(x0b + skew, y_top);
                ctx.closePath();

                ctx.fillStyle = STRIP_COLORS[colorIdx];
                ctx.fill();

                // Border (left edge of each strip = rate change line)
                ctx.beginPath();
                ctx.moveTo(x0b,        y_bot);
                ctx.lineTo(x0b + skew, y_top);
                ctx.strokeStyle = STRIP_BORDERS[colorIdx];
                ctx.lineWidth = si === 0 ? 0 : 1.5; // no left border on first strip
                ctx.stroke();

                // Store hit zone for tooltip (use bounding box approximation)
                hitZones.push({
                    x0: x0b, x1: x1b + skew,
                    y0: y_top, y1: y_bot,
                    strip: st, year: yr.year
                });

                // ── Labels inside strip ──
                const stripMidX = (x0b + x1b) / 2 + skew / 2;
                const stripMidY = (y_top + y_bot) / 2;
                const stripW = x1b - x0b;

                if (stripW > 30) {
                    // Weight %
                    ctx.fillStyle = '#e2e8f0';
                    ctx.font = `bold ${stripW > 60 ? 11 : 9}px Inter, system-ui, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`${(st.weight * 100).toFixed(1)}%`, stripMidX, stripMidY - 10);

                    // Rate level
                    if (stripW > 55) {
                        ctx.font = `${stripW > 80 ? 10 : 9}px Inter, system-ui, sans-serif`;
                        ctx.fillStyle = STRIP_BORDERS[colorIdx];
                        ctx.fillText(`L=${st.level.toFixed(4)}`, stripMidX, stripMidY + 6);
                    }

                    if (stripW > 80) {
                        ctx.font = '9px Inter, system-ui, sans-serif';
                        ctx.fillStyle = 'rgba(148,163,184,0.85)';
                        ctx.fillText(`${st.days}d`, stripMidX, stripMidY + 20);
                    }
                }
            });

            // ── Draw parallelogram outline ──
            const x0b = pad;
            const x1b = pad + blockW;
            const y_bot = yearTop + blockH;
            const y_top = yearTop;

            ctx.beginPath();
            ctx.moveTo(x0b,        y_bot);
            ctx.lineTo(x1b,        y_bot);
            ctx.lineTo(x1b + skew, y_top);
            ctx.lineTo(x0b + skew, y_top);
            ctx.closePath();
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // ── X-axis ticks: Jan, Apr, Jul, Oct, Dec ──
            const tickMonths = [0, 3, 6, 9, 11]; // 0-indexed months
            const monthNames = ['Jan','Apr','Jul','Oct','Dec'];
            tickMonths.forEach((mo, ti) => {
                const d   = new Date(yr.year, mo, 1);
                const off = daysBetween(new Date(yr.year, 0, 1), d);
                const tx  = dayToX(off);

                // Tick on bottom edge
                ctx.beginPath();
                ctx.moveTo(tx, y_bot);
                ctx.lineTo(tx, y_bot + 5);
                ctx.strokeStyle = 'rgba(148,163,184,0.55)';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.fillStyle = 'rgba(148,163,184,0.7)';
                ctx.font = '9.5px Inter, system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(`${monthNames[ti]} ${yr.year}`, tx, y_bot + 7);
            });

            // ── Year label ──
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 13px Inter, system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(
                `PY ${yr.year}${yr.isLeap ? ' (leap)' : ''}  ·  Avg Level: ${yr.weightedAvgLevel.toFixed(6)}  ·  OL Factor: ${yr.olFactor.toFixed(6)}`,
                pad, y_top - 18
            );

            // ── Earning axis label (left side) ──
            ctx.save();
            ctx.translate(pad - 32, yearTop + blockH / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = 'rgba(148,163,184,0.6)';
            ctx.font = '9.5px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Earning →', 0, 0);
            ctx.restore();

            // ── Diagonal side labels ──
            ctx.save();
            ctx.fillStyle = 'rgba(148,163,184,0.5)';
            ctx.font = '9px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const midSkewX = pad + skew / 2 - 6;
            const midSkewY = (y_top + y_bot) / 2;
            ctx.save();
            ctx.translate(midSkewX, midSkewY);
            ctx.rotate(-Math.atan2(blockH, skew));
            ctx.fillText('Earn start', 0, 0);
            ctx.restore();
            ctx.restore();
        });

        // ── Tooltip interaction ──
        if (tooltipEl) {
            canvasEl.onmousemove = (e) => {
                const rect = canvasEl.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;

                let found = null;
                for (const hz of hitZones) {
                    if (mx >= hz.x0 && mx <= hz.x1 && my >= hz.y0 && my <= hz.y1) {
                        found = hz;
                        break;
                    }
                }

                if (found) {
                    const st = found.strip;
                    tooltipEl.style.display = 'block';
                    tooltipEl.style.left = (e.clientX + 14) + 'px';
                    tooltipEl.style.top  = (e.clientY - 10) + 'px';
                    tooltipEl.innerHTML =
                        `<strong>PY ${found.year} — ${st.label}</strong><br>` +
                        `Days: <strong>${st.days}</strong><br>` +
                        `Weight: <strong>${(st.weight * 100).toFixed(3)}%</strong><br>` +
                        `Rate Level: <strong>${st.level.toFixed(6)}</strong>`;
                } else {
                    tooltipEl.style.display = 'none';
                }
            };
            canvasEl.onmouseleave = () => {
                tooltipEl.style.display = 'none';
            };
        }
    }

    // ══════════════════════════════════════════
    //  UI CONTROLLER
    // ══════════════════════════════════════════

    let _rateRows = [];    // [{id, date, pct}]
    let _premiumRows = []; // [{id, year, premium, exposures}]
    let _lastResult = null;

    function init() {
        _bindTabActivation();
        _addRateRow();       // start with one empty rate-change row
        _addPremiumRow();    // start with one empty premium row
        _bindButtons();
        _bindUpload();
    }

    // ── Tab activation: set up listeners once when OL3 tab first shown ──
    let _initialized = false;
    function _bindTabActivation() {
        // The tab infrastructure in app.js already handles panel switching.
        // We hook into the tab button click to do first-time setup if needed.
        const tabBtn = document.querySelector('[data-tab="onlevel3"]');
        if (!tabBtn) return;
        tabBtn.addEventListener('click', () => {
            if (!_initialized) {
                _initialized = true;
            }
        });
    }

    // ── Rate Table ──
    function _addRateRow(date = '', pct = '') {
        const id = Date.now() + Math.random();
        _rateRows.push({ id, date, pct });
        _renderRateTable();
    }

    function _removeRateRow(id) {
        _rateRows = _rateRows.filter(r => r.id !== id);
        _renderRateTable();
    }

    function _renderRateTable() {
        const tbody = document.getElementById('ol3-rate-table-body');
        const emptyMsg = document.getElementById('ol3-rate-table-empty');
        if (!tbody) return;

        tbody.innerHTML = '';
        _rateRows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="date" value="${row.date}"
                     data-id="${row.id}" data-field="date"
                     class="ol3-rc-input" /></td>
                <td><input type="number" step="0.01" placeholder="e.g. 5.0" value="${row.pct}"
                     data-id="${row.id}" data-field="pct"
                     class="ol3-rc-input" /></td>
                <td>
                  <button class="btn-remove-row ol3-btn-remove" data-id="${row.id}" title="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </td>`;
            tbody.appendChild(tr);
        });

        // Bind input changes
        tbody.querySelectorAll('.ol3-rc-input').forEach(inp => {
            inp.addEventListener('input', e => {
                const { id, field } = e.target.dataset;
                const row = _rateRows.find(r => String(r.id) === id);
                if (row) row[field] = e.target.value;
            });
        });

        // Bind remove buttons
        tbody.querySelectorAll('.ol3-btn-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                const id = parseFloat(e.currentTarget.dataset.id);
                _removeRateRow(id);
            });
        });

        if (emptyMsg) {
            emptyMsg.style.display = _rateRows.length === 0 ? '' : 'none';
        }
    }

    function _sortRateRows() {
        _rateRows.sort((a, b) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            return a.date.localeCompare(b.date);
        });
        _renderRateTable();
    }

    // ── Button bindings ──
    function _bindButtons() {
        document.getElementById('ol3-btn-add-row')?.addEventListener('click', () => _addRateRow());
        document.getElementById('ol3-btn-sort-rows')?.addEventListener('click', () => _sortRateRows());
        document.getElementById('ol3-btn-calculate')?.addEventListener('click', () => _calculate());
        document.getElementById('ol3-btn-add-premium-row')?.addEventListener('click', () => _addPremiumRow());
    }

    // ── Premium Table ──
    function _addPremiumRow(year = '', premium = '', exposures = '') {
        const id = Date.now() + Math.random();
        _premiumRows.push({ id, year, premium, exposures });
        _renderPremiumTable();
    }

    function _removePremiumRow(id) {
        _premiumRows = _premiumRows.filter(r => r.id !== id);
        _renderPremiumTable();
    }

    function _renderPremiumTable() {
        const tbody   = document.getElementById('ol3-premium-table-body');
        const emptyMsg = document.getElementById('ol3-premium-table-empty');
        if (!tbody) return;

        tbody.innerHTML = '';
        _premiumRows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="number" step="1" placeholder="e.g. 2020" value="${row.year}"
                     data-id="${row.id}" data-field="year"
                     class="ol3-prem-input" style="width:100%;" /></td>
                <td><input type="number" step="0.01" placeholder="e.g. 1000000" value="${row.premium}"
                     data-id="${row.id}" data-field="premium"
                     class="ol3-prem-input" style="width:100%;" /></td>
                <td><input type="number" step="0.01" placeholder="optional" value="${row.exposures}"
                     data-id="${row.id}" data-field="exposures"
                     class="ol3-prem-input" style="width:100%;" /></td>
                <td>
                  <button class="btn-remove-row ol3-btn-remove" data-id="${row.id}" title="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </td>`;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.ol3-prem-input').forEach(inp => {
            inp.addEventListener('input', e => {
                const { id, field } = e.target.dataset;
                const row = _premiumRows.find(r => String(r.id) === id);
                if (row) row[field] = e.target.value;
            });
        });

        tbody.querySelectorAll('.ol3-btn-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                const id = parseFloat(e.currentTarget.dataset.id);
                _removePremiumRow(id);
            });
        });

        if (emptyMsg) {
            emptyMsg.style.display = _premiumRows.length === 0 ? '' : 'none';
        }
    }

    // ── File upload ──
    function _bindUpload() {
        // Rate-change upload
        const dropEl   = document.getElementById('ol3-upload-drop');
        const fileInp  = document.getElementById('ol3-file-upload');
        const statusEl = document.getElementById('ol3-upload-status');

        if (dropEl && fileInp) {
            dropEl.addEventListener('dragover', e => { e.preventDefault(); dropEl.classList.add('drag-over'); });
            dropEl.addEventListener('dragleave', () => dropEl.classList.remove('drag-over'));
            dropEl.addEventListener('drop', e => {
                e.preventDefault();
                dropEl.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file) _processUpload(file, statusEl);
            });
            fileInp.addEventListener('change', () => {
                if (fileInp.files[0]) _processUpload(fileInp.files[0], statusEl);
            });
        }

        // Portfolio premium upload
        const pDropEl   = document.getElementById('ol3-premium-upload-drop');
        const pFileInp  = document.getElementById('ol3-premium-file-upload');
        const pStatusEl = document.getElementById('ol3-premium-upload-status');

        if (pDropEl && pFileInp) {
            pDropEl.addEventListener('dragover', e => { e.preventDefault(); pDropEl.classList.add('drag-over'); });
            pDropEl.addEventListener('dragleave', () => pDropEl.classList.remove('drag-over'));
            pDropEl.addEventListener('drop', e => {
                e.preventDefault();
                pDropEl.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file) _processPremiumUpload(file, pStatusEl);
            });
            pFileInp.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    _processPremiumUpload(e.target.files[0], pStatusEl);
                    e.target.value = ''; // clear out input
                }
            });
        }
    }

    function _processUpload(file, statusEl) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv') {
            const reader = new FileReader();
            reader.onload = e => _parseCSV(e.target.result, statusEl);
            reader.readAsText(file);
        } else if (ext === 'xlsx' || ext === 'xls') {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const csv = XLSX.utils.sheet_to_csv(ws);
                    _parseCSV(csv, statusEl);
                } catch (err) {
                    _showUploadStatus(statusEl, `Error reading Excel: ${err.message}`, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            _showUploadStatus(statusEl, 'Unsupported file format. Use CSV or XLSX.', 'error');
        }
    }

    function _parseCSV(text, statusEl) {
        const lines = text.trim().split('\n').filter(l => l.trim());
        if (lines.length < 2) { _showUploadStatus(statusEl, 'File appears empty.', 'error'); return; }

        const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g,''));
        const dateIdx = header.findIndex(h => h.includes('date'));
        const pctIdx  = header.findIndex(h => h.includes('pct') || h.includes('rate') || h.includes('change'));

        if (dateIdx < 0 || pctIdx < 0) {
            _showUploadStatus(statusEl, 'Could not find "date" and "pct" columns.', 'error');
            return;
        }

        _rateRows = [];
        let count = 0;
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/"/g,''));
            const date = cols[dateIdx] || '';
            const pct  = cols[pctIdx]  || '';
            if (date || pct) { _addRateRow(date, pct); count++; }
        }
        _renderRateTable();
        _showUploadStatus(statusEl, `Loaded ${count} rate change${count !== 1 ? 's' : ''}.`, 'success');
    }

    function _showUploadStatus(el, msg, type) {
        if (!el) return;
        el.textContent = msg;
        el.className = `upload-status ${type}`;
    }

    // ── Portfolio premium upload ──
    function _processPremiumUpload(file, statusEl) {
        const showStatus = (msg, type) => {
            if (!statusEl) return;
            statusEl.textContent = msg;
            statusEl.className = `upload-status ${type}`;
        };
        showStatus('Reading file…', '');

        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = new Uint8Array(e.target.result);
                const wb   = XLSX.read(data, { type: 'array' });
                const ws   = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                
                if (rows.length === 0) { showStatus('File appears empty.', 'error'); return; }

                // Find column names case-insensitively
                const keys = Object.keys(rows[0]);
                const findKey = (...needles) => keys.find(k => needles.some(n => k.toLowerCase().includes(n)));
                const yearKey  = findKey('year');
                const premKey  = findKey('premium', 'prem');
                const exposKey = findKey('exposure', 'expo');

                if (!yearKey || !premKey) {
                    showStatus('Could not find "year" and "premium" columns in file.', 'error');
                    return;
                }

                _premiumRows = [];
                let count = 0;
                rows.forEach(r => {
                    const year      = String(r[yearKey]  ?? '').trim();
                    const premium   = String(r[premKey]  ?? '').trim();
                    const exposures = exposKey ? String(r[exposKey] ?? '').trim() : '';
                    if (year || premium) { _addPremiumRow(year, premium, exposures); count++; }
                });
                _renderPremiumTable();
                showStatus(`✓ Loaded ${count} premium row${count !== 1 ? 's' : ''}.`, 'success');
            } catch (err) {
                console.error("Error parsing OL3 premium file:", err);
                showStatus('Error parsing file: ' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }


    // ── Main calculate ──
    async function _calculate() {
        const errEl = document.getElementById('ol3-validation-errors');

        // Validate rate changes
        const rcs = _rateRows
            .filter(r => r.date && r.pct !== '')
            .map(r => ({ date: r.date, pct: parseFloat(r.pct) }));

        const errors = [];
        if (rcs.length === 0) errors.push('Please add at least one rate change.');
        _rateRows.forEach((r, i) => {
            if (r.date && r.pct === '') errors.push(`Row ${i+1}: Missing rate change %.`);
            if (!r.date && r.pct !== '') errors.push(`Row ${i+1}: Missing effective date.`);
        });

        if (errors.length > 0) {
            errEl.innerHTML = '<ul>' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
            errEl.classList.remove('hidden');
            return;
        }
        errEl.classList.add('hidden');

        // Get eval date (optional)
        const evalDateStr = document.getElementById('ol3-eval-date')?.value || null;

        try {
            _lastResult = await calculate(rcs, evalDateStr);
            if (!_lastResult) throw new Error('No result returned.');
            _renderResults(_lastResult);
        } catch (err) {
            errEl.innerHTML = `<ul><li>${err.message}</li></ul>`;
            errEl.classList.remove('hidden');
        }
    }

    // ── Render results ──
    function _renderResults(result) {
        // Show sections
        document.getElementById('ol3-placeholder')?.classList.add('hidden');
        document.getElementById('ol3-diagram-section')?.classList.remove('hidden');
        document.getElementById('ol3-results-section')?.classList.remove('hidden');
        document.getElementById('ol3-summary-section')?.classList.remove('hidden');
        document.getElementById('ol3-audit-section')?.classList.remove('hidden');

        // Canvas
        const canvasEl  = document.getElementById('ol3-canvas');
        const tooltipEl = document.getElementById('ol3-tooltip');
        render(canvasEl, result.yearResults, tooltipEl);

        // Strips results table
        const tbody = document.getElementById('ol3-results-body');
        tbody.innerHTML = '';

        result.yearResults.forEach(yr => {
            yr.strips.forEach((st, si) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${si === 0 ? `<strong>PY ${yr.year}</strong>` : ''}</td>
                    <td>${si + 1}</td>
                    <td>${st.label}</td>
                    <td>${st.days}</td>
                    <td>${(st.weight * 100).toFixed(4)}%</td>
                    <td>${st.level.toFixed(6)}</td>
                    <td>${(st.weight * st.level).toFixed(6)}</td>`;
                tbody.appendChild(tr);
            });

            // Total row per year
            const totTr = document.createElement('tr');
            totTr.className = 'total-row';
            const totalDays = yr.strips.reduce((s, st) => s + st.days, 0);
            totTr.innerHTML = `
                <td><strong>PY ${yr.year} Total</strong></td>
                <td></td>
                <td></td>
                <td>${totalDays}</td>
                <td>100.000%</td>
                <td></td>
                <td><strong>${yr.weightedAvgLevel.toFixed(6)}</strong></td>`;
            tbody.appendChild(totTr);
        });

        // Summary table
        const sbody = document.getElementById('ol3-summary-body');
        sbody.innerHTML = '';

        // Build a quick lookup: year → historical premium
        const premiumByYear = {};
        _premiumRows.forEach(r => {
            const yr = parseInt(r.year, 10);
            if (!isNaN(yr) && r.premium !== '') {
                premiumByYear[yr] = parseFloat(r.premium) || 0;
            }
        });

        result.yearResults.forEach(yr => {
            const histPrem = premiumByYear[yr.year];
            const hasPrem  = histPrem !== undefined;
            const olPrem   = hasPrem ? histPrem * yr.olFactor : null;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${yr.year}${yr.isLeap ? ' 🔵' : ''}</strong></td>
                <td>${yr.weightedAvgLevel.toFixed(6)}</td>
                <td>${yr.currentLevel.toFixed(6)}</td>
                <td><strong>${yr.olFactor.toFixed(6)}</strong></td>
                <td>${yr.daysInYr} ${yr.isLeap ? '(leap)' : ''}</td>
                <td>${hasPrem ? '$' + histPrem.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : '<span style="color:var(--text-muted)">—</span>'}</td>
                <td>${olPrem !== null ? '<strong>$' + olPrem.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</strong>' : '<span style="color:var(--text-muted)">—</span>'}</td>`;
            sbody.appendChild(tr);
        });

        // Audit trail
        const auditEl = document.getElementById('ol3-audit-trail');
        auditEl.innerHTML = '';
        _appendAudit(auditEl, 'Method', 'PY EP Parallelogram — Pure Time-Weighted Strips');
        _appendAudit(auditEl, 'Boundary Rule',
            'Rate change on date D starts a new segment from D (inclusive). Previous segment ends at D-1.');
        _appendAudit(auditEl, 'Weight Formula', 'weight_i = days_in_segment_i / daysInYear(policy_year)',
            'Each PY is independent — no cross-year earning (unlike CY EP).');
        _appendAudit(auditEl, 'Current Rate Level',
            `${result.currentLevel.toFixed(6)}`,
            `Cumulative product of all rate changes up to evaluation date.`);
        result.yearResults.forEach(yr => {
            _appendAudit(auditEl, `PY ${yr.year}`,
                `${yr.strips.length} segment(s). Days in year: ${yr.daysInYr}${yr.isLeap ? ' (leap)' : ''}.`,
                `Weighted Avg Level = ${yr.weightedAvgLevel.toFixed(6)} → OL Factor = ${yr.olFactor.toFixed(6)}`);
        });
    }

    function _appendAudit(container, label, detail, extra) {
        const div = document.createElement('div');
        div.className = 'audit-step';
        div.innerHTML = `<div class="step-label">${label}</div>
            <div class="step-detail">${detail}</div>
            ${extra ? `<div class="step-formula">${extra}</div>` : ''}`;
        container.appendChild(div);
    }

    // ── Public API ──
    return { init, calculate, render };

})();

// Auto-init when DOM ready
document.addEventListener('DOMContentLoaded', () => OnLevel3.init());

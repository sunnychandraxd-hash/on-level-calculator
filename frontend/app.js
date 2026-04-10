/* ────────────────────────────────────────────
   Actuarial Platform — Frontend
   Modules: Tab Switching | On-Leveling 2 (CY EP)
   On-Leveling 3 (PY EP) is self-contained in onlevel3.js
   ──────────────────────────────────────────── */
(() => {
    'use strict';

    const $$ = (s) => document.querySelectorAll(s);

    // ── Helpers ──
    const fmtCurrency = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ══════════════════════════════════════════
    //  TAB SWITCHING
    // ══════════════════════════════════════════
    $$('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            $$('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            $$('.tab-panel').forEach(p => p.classList.remove('active'));
            const panel = document.getElementById(`tab-panel-${tab}`);
            if (panel) panel.classList.add('active');
        });
    });

    // ══════════════════════════════════════════
    //  ON-LEVELING 2 (CY EP) — UI CONTROLLER
    // ══════════════════════════════════════════
    (() => {
        let ol2RateRows    = [];
        let ol2PremiumRows = [];

        const mkId = () => Date.now() + Math.random();

        const showStatus = (el, msg, type) => {
            if (!el) return;
            el.textContent = msg;
            el.className = `upload-status ${type}`;
        };

        // ── Rate Table ──────────────────────────────────────────────

        function ol2RenderRateTable() {
            const tbody    = document.getElementById('ol2-rate-table-body');
            const emptyMsg = document.getElementById('ol2-rate-table-empty');
            if (!tbody) return;
            tbody.innerHTML = '';

            ol2RateRows.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input type="date" class="ol2-rc-date" data-id="${row.id}" value="${row.date}" /></td>
                    <td><input type="text" class="ol2-rc-pct"  data-id="${row.id}" value="${row.pct}" placeholder="e.g. 5" inputmode="decimal" /></td>
                    <td><button class="btn-remove-row ol2-btn-remove" data-id="${row.id}" title="Remove">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button></td>`;
                tbody.appendChild(tr);
            });

            tbody.querySelectorAll('.ol2-rc-date, .ol2-rc-pct').forEach(inp => {
                inp.addEventListener('input', e => {
                    const row = ol2RateRows.find(r => String(r.id) === e.target.dataset.id);
                    if (row) {
                        if (inp.classList.contains('ol2-rc-date')) row.date = e.target.value;
                        else row.pct = e.target.value;
                    }
                });
            });

            tbody.querySelectorAll('.ol2-btn-remove').forEach(btn => {
                btn.addEventListener('click', e => {
                    ol2RateRows = ol2RateRows.filter(r => String(r.id) !== e.currentTarget.dataset.id);
                    ol2RenderRateTable();
                });
            });

            if (emptyMsg) emptyMsg.classList.toggle('hidden', ol2RateRows.length > 0);
        }

        function ol2AddRateRow(date = '', pct = '') {
            ol2RateRows.push({ id: mkId(), date, pct });
            ol2RenderRateTable();
        }

        // ── Premium Table ────────────────────────────────────────────

        function ol2RenderPremiumTable() {
            const tbody    = document.getElementById('ol2-premium-table-body');
            const emptyMsg = document.getElementById('ol2-premium-table-empty');
            if (!tbody) return;
            tbody.innerHTML = '';

            ol2PremiumRows.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input type="number" step="1"    placeholder="e.g. 2020"    value="${row.year}"      data-id="${row.id}" data-field="year"      class="ol2-prem-input" style="width:100%;"/></td>
                    <td><input type="number" step="0.01" placeholder="e.g. 1000000" value="${row.premium}"   data-id="${row.id}" data-field="premium"   class="ol2-prem-input" style="width:100%;"/></td>
                    <td><input type="number" step="0.01" placeholder="optional"     value="${row.exposures}" data-id="${row.id}" data-field="exposures" class="ol2-prem-input" style="width:100%;"/></td>
                    <td><button class="btn-remove-row ol2-prem-rm" data-id="${row.id}" title="Remove">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button></td>`;
                tbody.appendChild(tr);
            });

            tbody.querySelectorAll('.ol2-prem-input').forEach(inp => {
                inp.addEventListener('input', e => {
                    const row = ol2PremiumRows.find(r => String(r.id) === e.target.dataset.id);
                    if (row) row[e.target.dataset.field] = e.target.value;
                });
            });

            tbody.querySelectorAll('.ol2-prem-rm').forEach(btn => {
                btn.addEventListener('click', e => {
                    ol2PremiumRows = ol2PremiumRows.filter(r => String(r.id) !== e.currentTarget.dataset.id);
                    ol2RenderPremiumTable();
                });
            });

            if (emptyMsg) emptyMsg.style.display = ol2PremiumRows.length === 0 ? '' : 'none';
        }

        function ol2AddPremiumRow(year = '', premium = '', exposures = '') {
            ol2PremiumRows.push({ id: mkId(), year, premium, exposures });
            ol2RenderPremiumTable();
        }

        // ── Rate Change Upload ────────────────────────────────────────

        function ol2ProcessRateFile(file) {
            if (!file) return;
            const statusEl = document.getElementById('ol2-upload-status');
            showStatus(statusEl, 'Reading file…', '');

            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
                    const ws   = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                    if (!rows.length) { showStatus(statusEl, 'File is empty.', 'error'); return; }

                    const keys    = Object.keys(rows[0]);
                    const dateKey = keys.find(k => k.toLowerCase().includes('date'));
                    const pctKey  = keys.find(k => ['pct','rate','change'].some(n => k.toLowerCase().includes(n)));
                    if (!dateKey || !pctKey) { showStatus(statusEl, 'Cannot find "date" and "pct" columns.', 'error'); return; }

                    const fmt = v => {
                        if (!v) return '';
                        if (v instanceof Date) return v.toISOString().split('T')[0];
                        if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000)).toISOString().split('T')[0];
                        return String(v).split('T')[0];
                    };

                    ol2RateRows = [];
                    let count = 0;
                    rows.forEach(r => {
                        const d = fmt(r[dateKey]);
                        const p = String(r[pctKey]).replace(/[^0-9.\-]/g, '');
                        if (d || p) { ol2RateRows.push({ id: mkId(), date: d, pct: p }); count++; }
                    });
                    ol2RateRows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                    ol2RenderRateTable();
                    showStatus(statusEl, `✓ Loaded ${count} rate change${count !== 1 ? 's' : ''}.`, 'success');
                } catch (err) {
                    showStatus(statusEl, 'Error: ' + err.message, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        }

        // ── Portfolio Upload ──────────────────────────────────────────

        function ol2ProcessPremiumFile(file) {
            if (!file) return;
            const statusEl = document.getElementById('ol2-premium-upload-status');
            showStatus(statusEl, 'Reading file…', '');

            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                    const ws   = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                    if (!rows.length) { showStatus(statusEl, 'File is empty.', 'error'); return; }

                    const keys    = Object.keys(rows[0]);
                    const find    = (...ns) => keys.find(k => ns.some(n => k.toLowerCase().includes(n)));
                    const yearKey = find('year');
                    const premKey = find('premium', 'prem');
                    const expKey  = find('exposure', 'expo');
                    if (!yearKey || !premKey) { showStatus(statusEl, 'Cannot find "year" and "premium" columns.', 'error'); return; }

                    ol2PremiumRows = [];
                    let count = 0;
                    rows.forEach(r => {
                        const y  = String(r[yearKey]  ?? '').trim();
                        const p  = String(r[premKey]  ?? '').trim();
                        const ex = expKey ? String(r[expKey] ?? '').trim() : '';
                        if (y || p) { ol2PremiumRows.push({ id: mkId(), year: y, premium: p, exposures: ex }); count++; }
                    });
                    ol2RenderPremiumTable();
                    showStatus(statusEl, `✓ Loaded ${count} row${count !== 1 ? 's' : ''}.`, 'success');
                } catch (err) {
                    showStatus(statusEl, 'Error: ' + err.message, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        }

        // ── Calculate & Render ────────────────────────────────────────

        async function ol2Calculate() {
            const errEl = document.getElementById('ol2-validation-errors');

            const rcs = ol2RateRows
                .filter(r => r.date && r.pct !== '')
                .map(r => ({ date: r.date, pct: parseFloat(r.pct) }));

            const errors = [];
            if (rcs.length === 0) errors.push('Add at least one rate change with a date and percentage.');

            if (errors.length > 0) {
                errEl.innerHTML = '<ul>' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
                errEl.classList.remove('hidden');
                return;
            }
            errEl.classList.add('hidden');

            // Build premium lookup
            const premiumByYear = {};
            ol2PremiumRows.forEach(r => {
                const yr   = parseInt(r.year, 10);
                const prem = parseFloat(r.premium);
                if (!isNaN(yr) && !isNaN(prem) && prem > 0) premiumByYear[yr] = prem;
            });

            try {
                const result = await OnLevel2.calculate(rcs);
                if (!result) throw new Error('Calculation returned no result.');

                // Show panels
                document.getElementById('ol2-placeholder')?.classList.add('hidden');
                document.getElementById('ol2-diagram-section')?.classList.remove('hidden');
                document.getElementById('ol2-results-section')?.classList.remove('hidden');

                // Render canvas
                const canvas  = document.getElementById('ol2-canvas');
                const tooltip = document.getElementById('ol2-tooltip');
                OnLevel2.render(canvas, result);
                OnLevel2.setupTooltip(canvas, tooltip);

                // Region detail table
                const tbody = document.getElementById('ol2-results-body');
                if (tbody) {
                    tbody.innerHTML = '';
                    OnLevel2.buildResultsTable(result).forEach(r => {
                        const tr = document.createElement('tr');
                        if (r.isTotal) tr.classList.add('total-row');

                        let histHtml = '—', olHtml = '—';
                        if (!r.isTotal && premiumByYear[r.year] !== undefined) {
                            const hp   = premiumByYear[r.year];
                            const f    = result.yearData[r.year].olFactor;
                            histHtml = fmtCurrency(hp);
                            olHtml   = '<strong>' + fmtCurrency(hp * f) + '</strong>';
                        }

                        tr.innerHTML = `
                            <td>${r.year}</td>
                            <td>${r.regionIndex}</td>
                            <td>${r.regionLabel}</td>
                            <td>${r.vertices}</td>
                            <td>${r.rateLevel !== null ? r.rateLevel.toFixed(6) : '—'}</td>
                            <td>${r.areaPct}</td>
                            <td>${histHtml}</td>
                            <td>${olHtml}</td>`;
                        tbody.appendChild(tr);
                    });
                }

                // Summary table
                const sumBody = document.getElementById('ol2-summary-body');
                if (sumBody) {
                    sumBody.innerHTML = '';
                    result.years.forEach(yr => {
                        const wAvg    = result.yearData[yr].weightedAvgLevel;
                        const factor  = result.yearData[yr].olFactor;
                        const hp      = premiumByYear[yr];
                        const hasPrem = hp !== undefined;
                        const olPrem  = hasPrem ? hp * factor : null;

                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td><strong>${yr}</strong></td>
                            <td>${wAvg.toFixed(6)}</td>
                            <td>${result.currentLevel.toFixed(6)}</td>
                            <td><strong>${factor.toFixed(6)}</strong></td>
                            <td>${hasPrem ? fmtCurrency(hp) : '<span style="color:var(--text-muted)">—</span>'}</td>
                            <td>${olPrem !== null ? '<strong>' + fmtCurrency(olPrem) + '</strong>' : '<span style="color:var(--text-muted)">—</span>'}</td>`;
                        sumBody.appendChild(tr);
                    });
                    document.getElementById('ol2-summary-section')?.classList.remove('hidden');
                }

            } catch (err) {
                errEl.innerHTML = `<ul><li>${err.message}</li></ul>`;
                errEl.classList.remove('hidden');
            }
        }

        // ── Bind all OL2 UI ──────────────────────────────────────────

        function bindDropZone(dropId, fileId, handler) {
            const drop = document.getElementById(dropId);
            const file = document.getElementById(fileId);
            if (file) {
                file.addEventListener('change', e => {
                    if (e.target.files[0]) { handler(e.target.files[0]); e.target.value = ''; }
                });
            }
            if (drop) {
                drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('drag-over'); });
                drop.addEventListener('dragleave', ()  => drop.classList.remove('drag-over'));
                drop.addEventListener('drop', e => {
                    e.preventDefault(); drop.classList.remove('drag-over');
                    if (e.dataTransfer.files[0]) handler(e.dataTransfer.files[0]);
                });
            }
        }

        function ol2Init() {
            document.getElementById('ol2-btn-add-row')?.addEventListener('click', () => ol2AddRateRow());
            document.getElementById('ol2-btn-add-premium-row')?.addEventListener('click', () => ol2AddPremiumRow());
            document.getElementById('ol2-btn-sort-rows')?.addEventListener('click', () => {
                ol2RateRows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                ol2RenderRateTable();
            });
            document.getElementById('ol2-btn-calculate')?.addEventListener('click', ol2Calculate);

            bindDropZone('ol2-upload-drop',         'ol2-file-upload',         ol2ProcessRateFile);
            bindDropZone('ol2-premium-upload-drop', 'ol2-premium-file-upload', ol2ProcessPremiumFile);

            ol2AddRateRow();
            ol2AddPremiumRow();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', ol2Init);
        } else {
            ol2Init();
        }
    })();

})();

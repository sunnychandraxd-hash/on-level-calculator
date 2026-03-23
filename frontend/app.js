/* ────────────────────────────────────────────
   Actuarial Platform — Frontend (API Client)
   Multi-module: On-Level | Loss Trend | Workflow
   ──────────────────────────────────────────── */
(() => {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    // ══════════════════════════════════════════
    //  SHARED STATE (cross-module)
    // ══════════════════════════════════════════
    const sharedState = {
        onLevelResult: null,
        trendResult: null
    };

    // ══════════════════════════════════════════
    //  DOM REFERENCES
    // ══════════════════════════════════════════

    // On-Level DOM
    const dom = {
        evalDate: $('#evaluation-date'),
        basisToggle: $('#agg-basis-toggle'),
        dimToggle: $('#agg-dimension-toggle'),
        termField: $('#agg-term-field'),
        termInput: $('#agg-policy-term'),
        earningPatternField: $('#agg-earning-pattern-field'),
        earningSelect: $('#earning-pattern'),
        customSection: $('#custom-weights-section'),
        customWeights: $('#custom-weights'),
        midTermCheckbox: $('#agg-mid-term'),
        
        btnAddAggRow: $('#btn-add-agg-row'),
        aggYearBody: $('#agg-year-table-body'),
        fileUpload: $('#agg-file-upload'),
        uploadDrop: $('#agg-upload-drop'),
        uploadStatus: $('#agg-upload-status'),

        rateTableBody: $('#rate-table-body'),
        rateTableEmpty: $('#rate-table-empty'),
        btnAddRow: $('#btn-add-row'),
        btnSortRows: $('#btn-sort-rows'),
        btnCalculate: $('#btn-calculate'),
        btnReset: $('#btn-reset'),
        validationBox: $('#validation-errors'),
        rateFileUpload: $('#rate-file-upload'),
        rateUploadDrop: $('#rate-upload-drop'),
        rateUploadStatus: $('#rate-upload-status'),
        
        placeholderOutputs: $('#placeholder-outputs'),
        aggResultsSec: $('#aggregated-results-section'),
        aggResultsBody: $('#agg-results-body'),
        btnDownloadAgg: $('#btn-download-agg'),
        onLevelChartCanvas: $('#onlevel-chart'),
        auditTrailSec: $('#audit-trail-section'),
        auditTrail: $('#audit-trail'),
    };

    // Trend DOM (Loss Trending)
    const tDom = {
        baseValue: $('#trend-base-value'),
        histStart: $('#trend-hist-start'),
        histEnd: $('#trend-hist-end'),
        futureStart: $('#trend-future-start'),
        futureTerm: $('#trend-future-term'),
        modeToggle: $('#trend-mode-toggle'),
        currentRate: $('#trend-current-rate'),
        twoStepFields: $('#two-step-fields'),
        projectedRate: $('#trend-projected-rate'),
        latestData: $('#trend-latest-data'),
        btnCalculate: $('#btn-calculate-trend'),
        btnIcon: $('#trend-btn-icon'),
        btnText: $('#trend-btn-text'),
        btnSpinner: $('#trend-spinner'),
        fileUpload: $('#trend-file-upload'),
        uploadDrop: $('#trend-upload-drop'),
        uploadStatus: $('#trend-upload-status'),
        btnTemplate: $('#btn-trend-template'),
        portfolioSec: $('#trend-portfolio-section'),
        portfolioBody: $('#trend-portfolio-body'),
        btnDownload: $('#btn-download-trend-portfolio'),
        validationBox: $('#trend-validation-errors'),
        // KPIs
        kpiTrended: $('#trend-kpi-trended'),
        kpiFactor: $('#trend-kpi-factor'),
        kpiTime: $('#trend-kpi-time'),
        kpiImpact: $('#trend-kpi-impact'),
        kpiHistAvg: $('#trend-kpi-hist-avg'),
        kpiFutureAvg: $('#trend-kpi-future-avg'),
        twoStepKpiRow: $('#two-step-kpi-row'),
        kpiCurrentFactor: $('#trend-kpi-current-factor'),
        kpiProjectedFactor: $('#trend-kpi-projected-factor'),
        kpiRow: $('#trend-kpi-row'),
        chartCanvas: $('#trend-chart'),
        auditTrail: $('#trend-audit-trail'),
    };

    // Summary
    const sumDom = {
        onlevel: $('#summary-onlevel'),
        trend: $('#summary-trend'),
    };

    // ── State ──
    let rateRows = [];
    let rowIdCounter = 0;
    
    // Aggregated Mode State
    let aggBasis = 'EP';
    let aggDimension = 'CY';
    let aggRows = [];
    let aggRowCounter = 0;
    let aggResultsData = null;
    
    // Trend state
    let tMode = 'single';
    let uploadedTrendPortfolioRows = null;
    let trendPortfolioResultsData = null;
    let trendChartInstance = null;
    let onLevelChartInstance = null;

    // ── Helpers ──
    const parseNum = (v) => {
        const s = String(v).replace(/[^0-9.\-]/g, '');
        return s === '' ? NaN : parseFloat(s);
    };
    const fmtCurrency = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtPct = (n) => (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';
    const fmtFactor = (n) => n.toFixed(6);


    // ══════════════════════════════════════════
    //  TAB SWITCHING
    // ══════════════════════════════════════════
    $$('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            $$('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            $$('.tab-panel').forEach(p => p.classList.remove('active'));
            $(`#tab-panel-${tab}`).classList.add('active');
        });
    });

    // ══════════════════════════════════════════
    //  ON-LEVELING MODULE
    // ══════════════════════════════════════════

    function updateVisibilities() {
        if (aggBasis === 'WP') {
            dom.dimToggle.parentElement.classList.add('hidden');
            dom.termField.classList.add('hidden');
            dom.earningPatternField.classList.add('hidden');
            dom.customSection.classList.add('hidden');
        } else {
            dom.dimToggle.parentElement.classList.remove('hidden');
            dom.termField.classList.remove('hidden');
            if (aggDimension === 'CY') {
                dom.earningPatternField.classList.remove('hidden');
                dom.customSection.classList.toggle('hidden', dom.earningSelect.value !== 'custom');
            } else {
                // PY
                dom.earningPatternField.classList.add('hidden');
                dom.customSection.classList.add('hidden');
            }
        }
    }

    dom.basisToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('.toggle-btn');
        if (!btn) return;
        dom.basisToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        aggBasis = btn.dataset.value;
        updateVisibilities();
    });

    dom.dimToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('.toggle-btn');
        if (!btn) return;
        dom.dimToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        aggDimension = btn.dataset.value;
        updateVisibilities();
    });

    dom.earningSelect.addEventListener('change', updateVisibilities);

    function addAggRow() {
        aggRowCounter++;
        const lastYear = aggRows.length > 0 ? aggRows[aggRows.length-1].year + 1 : new Date().getFullYear() - 1;
        aggRows.push({ id: aggRowCounter, year: lastYear, premium: '', exposures: '' });
        renderAggTable();
    }
    
    function removeAggRow(id) {
        aggRows = aggRows.filter(r => r.id !== id);
        renderAggTable();
    }
    
    function renderAggTable() {
        if (!dom.aggYearBody) return;
        dom.aggYearBody.innerHTML = '';
        aggRows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="number" class="agg-year-input" data-id="${row.id}" value="${row.year}" style="width:100%" /></td>
                <td><input type="text" class="agg-premium-input" data-id="${row.id}" value="${row.premium}" placeholder="1000000" inputmode="decimal" style="width:100%" /></td>
                <td><input type="text" class="agg-exp-input" data-id="${row.id}" value="${row.exposures}" placeholder="optional" inputmode="decimal" style="width:100%" /></td>
                <td style="text-align:right;">
                  <button class="btn-remove-agg-row btn btn-ghost btn-sm" data-id="${row.id}" title="Remove row">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </td>
            `;
            dom.aggYearBody.appendChild(tr);
        });
    }

    if (dom.aggYearBody) {
        dom.aggYearBody.addEventListener('input', (e) => {
            const id = parseInt(e.target.dataset.id);
            const row = aggRows.find(r => r.id === id);
            if (!row) return;
            if (e.target.classList.contains('agg-year-input')) row.year = parseInt(e.target.value);
            if (e.target.classList.contains('agg-premium-input')) row.premium = e.target.value;
            if (e.target.classList.contains('agg-exp-input')) row.exposures = e.target.value;
        });

        dom.aggYearBody.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-remove-agg-row');
            if (btn) removeAggRow(parseInt(btn.dataset.id));
        });
    }

    dom.btnAddAggRow.addEventListener('click', addAggRow);
    addAggRow();

    dom.btnDownloadAgg.addEventListener('click', () => {
        if (!aggResultsData) return;
        const worksheet = XLSX.utils.json_to_sheet(aggResultsData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Aggregated Results");
        XLSX.writeFile(workbook, "Premium_OnLevel_Results.xlsx");
    });

    // Rate Changes
    function addRateRow(date = '', pct = '') {
        const id = ++rowIdCounter;
        rateRows.push({ id, date, pct });
        renderRateTable();
    }

    function removeRateRow(id) {
        rateRows = rateRows.filter(r => r.id !== id);
        renderRateTable();
    }

    function renderRateTable() {
        dom.rateTableBody.innerHTML = '';
        dom.rateTableEmpty.classList.toggle('hidden', rateRows.length > 0);
        rateRows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td><input type="date" class="rc-date" data-id="${row.id}" value="${row.date}" /></td>
        <td><input type="text" class="rc-pct" data-id="${row.id}" value="${row.pct}" placeholder="e.g. 5" inputmode="decimal" /></td>
        <td><button class="btn-remove-row" data-id="${row.id}" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button></td>`;
            dom.rateTableBody.appendChild(tr);
        });
    }

    dom.rateTableBody.addEventListener('input', (e) => {
        const id = parseInt(e.target.dataset.id);
        const row = rateRows.find(r => r.id === id);
        if (!row) return;
        if (e.target.classList.contains('rc-date')) row.date = e.target.value;
        if (e.target.classList.contains('rc-pct')) row.pct = e.target.value;
    });

    dom.rateTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-remove-row');
        if (btn) removeRateRow(parseInt(btn.dataset.id));
    });

    dom.btnAddRow.addEventListener('click', () => addRateRow());
    dom.btnSortRows.addEventListener('click', () => {
        rateRows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        renderRateTable();
    });

    // Upload Rate Changes
    dom.rateFileUpload.addEventListener('change', (e) => handleRateFileUpload(e.target.files[0]));
    dom.rateUploadDrop.addEventListener('dragover', (e) => { e.preventDefault(); dom.rateUploadDrop.classList.add('drag-over'); });
    dom.rateUploadDrop.addEventListener('dragleave', () => dom.rateUploadDrop.classList.remove('drag-over'));
    dom.rateUploadDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.rateUploadDrop.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleRateFileUpload(e.dataTransfer.files[0]);
        }
    });

    function handleRateFileUpload(file) {
        if (!file) return;
        dom.rateUploadStatus.classList.remove('hidden', 'success', 'error');
        dom.rateUploadStatus.textContent = 'Reading file...';
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
                
                if (rows.length === 0) throw new Error("File is empty.");
                
                const standardRows = rows.map(r => {
                    const norm = {};
                    for (let k in r) {
                        norm[k.toLowerCase().trim()] = r[k];
                    }
                    return norm;
                });

                const firstRow = standardRows[0];
                if (!('date' in firstRow) || !('pct' in firstRow)) {
                    throw new Error(`Required columns 'date' and 'pct' are missing.`);
                }
                
                const formatDate = (val) => {
                    if (!val) return '';
                    if (val instanceof Date) return val.toISOString().split('T')[0];
                    if (typeof val === 'number') {
                        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
                        return date.toISOString().split('T')[0];
                    }
                    return String(val).split('T')[0];
                };

                rateRows = [];
                rowIdCounter = 0;
                standardRows.forEach((r) => {
                    const d = formatDate(r.date);
                    const p = parseFloat(String(r.pct).replace(/[^0-9.-]/g, ''));
                    if (d && !isNaN(p)) {
                        rowIdCounter++;
                        rateRows.push({ id: rowIdCounter, date: d, pct: p });
                    }
                });
                
                rateRows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                renderRateTable();

                dom.rateUploadStatus.textContent = `Successfully loaded ${rateRows.length} rate change rows.`;
                dom.rateUploadStatus.classList.add('success');
                if (dom.rateFileUpload) { dom.rateFileUpload.value = ''; }
            } catch (err) {
                dom.rateUploadStatus.textContent = 'Error: ' + err.message;
                dom.rateUploadStatus.classList.add('error');
            }
        };
        reader.readAsArrayBuffer(file);
    }

    // Upload
    dom.fileUpload.addEventListener('change', (e) => handleAggFileUpload(e.target.files[0]));
    dom.uploadDrop.addEventListener('dragover', (e) => { e.preventDefault(); dom.uploadDrop.classList.add('drag-over'); });
    dom.uploadDrop.addEventListener('dragleave', () => dom.uploadDrop.classList.remove('drag-over'));
    dom.uploadDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.uploadDrop.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleAggFileUpload(e.dataTransfer.files[0]);
        }
    });

    function handleAggFileUpload(file) {
        if (!file) return;
        dom.uploadStatus.classList.remove('hidden', 'success', 'error');
        dom.uploadStatus.textContent = 'Reading file...';
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
                
                if (rows.length === 0) throw new Error("File is empty.");
                
                const standardRows = rows.map(r => {
                    const norm = {};
                    for (let k in r) {
                        norm[k.toLowerCase().trim()] = r[k];
                    }
                    return norm;
                });

                const firstRow = standardRows[0];
                if (!('year' in firstRow) || !('premium' in firstRow)) {
                    throw new Error(`Required columns 'year' and 'premium' are missing.`);
                }
                
                aggRows = [];
                aggRowCounter = 0;
                standardRows.forEach((r, idx) => {
                    const y = parseInt(r.year);
                    const p = parseFloat(String(r.premium).replace(/[^0-9.-]/g, ''));
                    const ex = ('exposures' in r && r.exposures !== '') ? parseFloat(String(r.exposures).replace(/[^0-9.-]/g, '')) : '';
                    if (!isNaN(y) && !isNaN(p)) {
                        aggRowCounter++;
                        aggRows.push({ id: aggRowCounter, year: y, premium: p, exposures: ex });
                    }
                });
                
                renderAggTable();

                dom.uploadStatus.textContent = `Successfully loaded ${aggRows.length} portfolio rows.`;
                dom.uploadStatus.classList.add('success');
                dom.fileUpload.value = '';
            } catch (err) {
                dom.uploadStatus.textContent = 'Error: ' + err.message;
                dom.uploadStatus.classList.add('error');
            }
        };
        reader.readAsArrayBuffer(file);
    }


    function validate() {
        const errors = [];
        if (!dom.evalDate.value) errors.push('Evaluation Date is required.');
        rateRows.forEach((r, i) => {
            if (!r.date) errors.push(`Rate change row ${i + 1}: date is missing.`);
            const p = parseNum(r.pct);
            if (isNaN(p)) errors.push(`Rate change row ${i + 1}: rate change must be a valid number.`);
        });

        if (aggRows.length === 0) errors.push('At least one portfolio year row is required.');
        
        const yearsSet = new Set();
        aggRows.forEach((r, i) => {
            if (isNaN(r.year)) {
               errors.push(`Row ${i + 1}: Year must be a valid number.`);
            } else {
               if (yearsSet.has(r.year)) {
                   errors.push(`Row ${i + 1}: Year ${r.year} is duplicated. Years must be unique.`);
               }
               yearsSet.add(r.year);
            }
            const prem = parseNum(r.premium);
            if (isNaN(prem) || prem <= 0) errors.push(`Row ${i + 1} (Year ${r.year}): Premium must be > 0.`);
        });
        
        if (aggBasis === 'EP') {
            const aterm = parseInt(dom.termInput.value);
            if (isNaN(aterm) || aterm < 1) errors.push('Policy Term must be at least 1 month.');
            
            if (aggDimension === 'CY' && dom.earningSelect.value === 'custom') {
                const customRaw = dom.customWeights.value.split(',').map(s => parseNum(s.trim()));
                if (customRaw.length !== 12 || customRaw.some(isNaN)) {
                    errors.push('Custom earning pattern requires exactly 12 valid comma-separated numbers.');
                } else {
                    const sum = customRaw.reduce((a,b) => a+b, 0);
                    if (Math.abs(sum - 1.0) > 0.01) {
                        errors.push('Custom weights must sum exactly to 1.0.');
                    }
                }
            }
        }
        return errors;
    }

    function showErrors(el, errors) {
        if (errors.length === 0) { el.classList.add('hidden'); return; }
        el.classList.remove('hidden');
        el.innerHTML = '<ul>' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
    }

    async function calculate() {
        const errors = validate();
        showErrors(dom.validationBox, errors);
        if (errors.length > 0) return null;

        dom.btnCalculate.disabled = true;
        dom.btnCalculate.innerHTML = 'Calculating...';

        try {
            const customRaw = dom.customWeights.value.split(',').map(s => parseNum(s.trim()));
            const customWeights = (aggBasis === 'EP' && aggDimension === 'CY' && dom.earningSelect.value === 'custom') ? customRaw : null;

            const payload = {
                rate_changes: rateRows.filter(r => r.date && r.pct !== '').map(r => ({ date: r.date, pct: parseNum(r.pct) })),
                premium_by_year: aggRows.map(r => ({
                    year: r.year,
                    premium: parseNum(r.premium),
                    exposures: r.exposures ? parseNum(r.exposures) : null
                })),
                aggregation: aggDimension,
                basis: aggBasis,
                policy_term_months: parseInt(dom.termInput.value) || 12,
                evaluation_date: dom.evalDate.value,
                mid_term_changes: dom.midTermCheckbox.checked,
                earning_pattern: (aggBasis === 'EP' && aggDimension === 'CY') ? dom.earningSelect.value : null,
                custom_weights: customWeights
            };

            const resp = await fetch('/api/onlevel/aggregated', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!resp.ok) {
                const err = await resp.json();
                showErrors(dom.validationBox, [err.detail || 'Server error']);
                return null;
            }

            const result = await resp.json();
            
            dom.placeholderOutputs.classList.add('hidden');
            dom.aggResultsSec.classList.remove('hidden');
            dom.auditTrailSec.classList.remove('hidden');
            
            dom.aggResultsBody.innerHTML = '';
            let totalOnLevel = 0;
            aggResultsData = result.results;
            
            result.results.forEach(r => {
                totalOnLevel += r.on_level_premium;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${r.year}</strong></td>
                    <td>${fmtCurrency(r.historical_premium)}</td>
                    <td>${fmtFactor(r.weighted_avg_rate_level)}</td>
                    <td>${fmtFactor(r.factor)}</td>
                    <td style="font-weight:bold; color:var(--accent);">${fmtCurrency(r.on_level_premium)}</td>
                `;
                dom.aggResultsBody.appendChild(tr);
            });
            
            renderOnLevelChart(result.results);
            
            dom.auditTrail.innerHTML = '';
            const mainAuditStr = document.createElement('div');
            mainAuditStr.className = 'audit-step';
            mainAuditStr.innerHTML = `<span class="step-label">Parallelogram Computation</span> <span class="step-detail">${result.audit_trail}</span>`;
            dom.auditTrail.appendChild(mainAuditStr);
            
            result.results.forEach(r => {
                const div = document.createElement('div');
                div.className = 'audit-step';
                div.innerHTML = `<span class="step-label">Year ${r.year}</span> <span class="step-detail">${r.audit_detail}</span>`;
                dom.auditTrail.appendChild(div);
            });
            
            sharedState.onLevelResult = result;
            sharedState.onLevelPremium = totalOnLevel;
            updateSummaryPanel();
            
            return result;
        } catch (e) {
            showErrors(dom.validationBox, [`Network error: ${e.message}`]);
            return null;
        } finally {
            dom.btnCalculate.disabled = false;
            dom.btnCalculate.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="14" y1="18" x2="16" y2="18"/></svg>
        Calculate Premium Onleveling`;
        }
    }

    function renderOnLevelChart(results) {
        if (!dom.onLevelChartCanvas) return;
        const labels = results.map(r => String(r.year));
        const histData = results.map(r => r.historical_premium);
        const onLevelData = results.map(r => r.on_level_premium);

        if (onLevelChartInstance) onLevelChartInstance.destroy();
        const ctx = dom.onLevelChartCanvas.getContext('2d');

        onLevelChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Historical Premium',
                        data: histData,
                        backgroundColor: 'rgba(148, 163, 184, 0.4)',
                        borderColor: '#94a3b8',
                        borderWidth: 1,
                        borderRadius: 4
                    },
                    {
                        label: 'On-Level Premium',
                        data: onLevelData,
                        backgroundColor: 'rgba(56, 189, 248, 0.8)',
                        borderColor: '#38bdf8',
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) { return '$' + value.toLocaleString(); },
                            color: '#94a3b8'
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: {
                        ticks: { color: '#94a3b8' },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#e2e8f0' } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed.y !== null) { label += '$' + context.parsed.y.toLocaleString(); }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    dom.btnCalculate.addEventListener('click', calculate);

    function updateSummaryPanel() {
        if (sharedState.onLevelPremium) {
            sumDom.onlevel.textContent = fmtCurrency(sharedState.onLevelPremium);
        }
        if (sharedState.trendResult && sharedState.trendResult.trendedValue) {
            sumDom.trend.textContent = fmtCurrency(sharedState.trendResult.trendedValue);
        }
        $('#summary-panel').classList.add('visible');
    }

    dom.btnReset.addEventListener('click', () => {
        if (confirm("Reset ALL data across all modules?")) {
            location.reload();
        }
    });

    // Initialize visibilities
    updateVisibilities();

    // ══════════════════════════════════════════
    //  LOSS TRENDING MODULE
    // ══════════════════════════════════════════

    tDom.modeToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('.toggle-btn');
        if (!btn) return;
        tDom.modeToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tMode = btn.dataset.value;
        tDom.twoStepFields.classList.toggle('hidden', tMode !== 'two-step');
    });

    function validateTrend() {
        const errors = [];
        const hasPortfolio = (uploadedTrendPortfolioRows && uploadedTrendPortfolioRows.length > 0);
        
        const val = parseNum(tDom.baseValue.value);
        if (!hasPortfolio || !isNaN(val)) {
            if (isNaN(val) || val <= 0) errors.push('Base Value must be a positive number.');
            if (!tDom.histStart.value) errors.push('Historical Period Start is required.');
            if (!tDom.histEnd.value) errors.push('Historical Period End is required.');
            if (!tDom.futureStart.value) errors.push('Future Effective Date is required.');
            
            const term = parseInt(tDom.futureTerm.value);
            if (isNaN(term) || term < 1) errors.push('Policy Term must be at least 1 month.');
            
            if (tDom.histStart.value && tDom.histEnd.value && tDom.histEnd.value <= tDom.histStart.value) {
                errors.push('Historical Period End must be after Start Date.');
            }
        }
        
        const crate = parseNum(tDom.currentRate.value);
        if (isNaN(crate)) errors.push('Current Trend Rate is required.');

        if (tMode === 'two-step') {
            const prate = parseNum(tDom.projectedRate.value);
            if (isNaN(prate)) errors.push('Projected Trend Rate is required for two-step trending.');
            if (!tDom.latestData.value) errors.push('Latest Data Point Date is required for two-step (used as global fallback for portfolio).');
        }

        return errors;
    }

    async function calculateTrend() {
        const errors = validateTrend();
        showErrors(tDom.validationBox, errors);
        if (errors.length > 0) return null;

        tDom.btnCalculate.disabled = true;
        tDom.btnIcon.classList.add('hidden');
        tDom.btnSpinner.classList.remove('hidden');
        tDom.btnText.textContent = 'Calculating…';

        try {
            if (uploadedTrendPortfolioRows && uploadedTrendPortfolioRows.length > 0) {
                await processTrendPortfolio(uploadedTrendPortfolioRows);
            }
            
            const val = parseNum(tDom.baseValue.value);
            if (!isNaN(val)) {
                const payload = {
                    baseValue: val,
                    historicalStartDate: tDom.histStart.value,
                    historicalEndDate: tDom.histEnd.value,
                    futureStartDate: tDom.futureStart.value,
                    policyTermMonths: parseInt(tDom.futureTerm.value) || 12,
                    currentTrendRate: parseNum(tDom.currentRate.value),
                    trendMode: tMode,
                };

                if (tMode === 'two-step') {
                    payload.projectedTrendRate = parseNum(tDom.projectedRate.value);
                    payload.latestDataPointDate = tDom.latestData.value;
                }

                const resp = await fetch('/api/trend', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (!resp.ok) {
                    const err = await resp.json();
                    showErrors(tDom.validationBox, [err.detail || 'Server error']);
                    return null;
                }

                const result = await resp.json();
                renderTrendOutputs(result);
                sharedState.trendResult = result;
                updateSummaryPanel();
                return result;
            } else {
                tDom.kpiTrended.textContent = '—';
                tDom.kpiFactor.textContent = '—';
                tDom.kpiTime.textContent = '—';
                tDom.kpiImpact.textContent = '—';
            }
        } catch (e) {
            showErrors(tDom.validationBox, [`Network error: ${e.message}`]);
            return null;
        } finally {
            tDom.btnCalculate.disabled = false;
            tDom.btnIcon.classList.remove('hidden');
            tDom.btnSpinner.classList.add('hidden');
            tDom.btnText.textContent = 'Calculate Loss Trend';
        }
    }

    tDom.btnCalculate.addEventListener('click', calculateTrend);

    function renderTrendOutputs(result) {
        tDom.kpiTrended.textContent = fmtCurrency(result.trendedValue);
        tDom.kpiFactor.textContent = fmtFactor(result.trendFactor);
        tDom.kpiTime.textContent = result.trendPeriodYears.toFixed(2) + ' yrs';
        tDom.kpiImpact.textContent = fmtPct(result.totalTrendImpact);
        
        tDom.kpiHistAvg.textContent = result.historicalAvgDate;
        tDom.kpiFutureAvg.textContent = result.futureAvgDate;

        if (tMode === 'two-step') {
            tDom.twoStepKpiRow.classList.remove('hidden');
            tDom.kpiCurrentFactor.textContent = fmtFactor(result.currentFactor);
            tDom.kpiProjectedFactor.textContent = fmtFactor(result.projectedFactor);
        } else {
            tDom.twoStepKpiRow.classList.add('hidden');
        }

        tDom.kpiRow.querySelectorAll('.kpi-card').forEach(card => {
            card.classList.remove('highlight'); void card.offsetWidth; card.classList.add('highlight');
        });

        renderTrendChart(result.growthCurve);
        
        tDom.auditTrail.innerHTML = '';
        result.auditTrail.forEach(step => {
            const div = document.createElement('div');
            div.className = 'audit-step';
            let html = `<span class="step-label">${step.label}</span> <span class="step-detail">${step.detail}</span>`;
            if (step.formula) html += `<br><span class="step-formula">${step.formula}</span>`;
            div.innerHTML = html;
            tDom.auditTrail.appendChild(div);
        });
    }

    function renderTrendChart(curve) {
        if (!curve || curve.length === 0) return;
        const labels = curve.map(p => new Date(p.date));
        const data = curve.map(p => p.value);

        if (trendChartInstance) trendChartInstance.destroy();
        const ctx = tDom.chartCanvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 280);
        gradient.addColorStop(0, 'rgba(129,140,248,.25)'); gradient.addColorStop(1, 'rgba(129,140,248,.02)');

        trendChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Trended Value', data, borderColor: '#818cf8', backgroundColor: gradient, borderWidth: 2.5, pointBackgroundColor: '#818cf8', pointBorderColor: '#0b0f1a', pointBorderWidth: 2, pointRadius: 3, fill: true, tension: 0.3 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { type: 'time', time: { unit: 'month' } } } }
        });
    }
    
    // Loss Trend Portfolio implementation
    tDom.btnTemplate.addEventListener('click', () => {
        const csvContent = "base_loss,historical_start_date,historical_end_date,future_start_date,policy_term_months,latest_data_point_date\n" +
                           "500000,2022-01-01,2022-12-31,2024-01-01,12,\n" +
                           "250000,2023-01-01,2023-12-31,2024-06-01,12,2023-12-31\n" +
                           "100000,2023-07-01,2024-06-30,2025-01-01,6,";
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "loss_trend_portfolio_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    tDom.fileUpload.addEventListener('change', (e) => handleTrendFileUpload(e.target.files[0]));
    tDom.uploadDrop.addEventListener('dragover', (e) => { e.preventDefault(); tDom.uploadDrop.classList.add('drag-over'); });
    tDom.uploadDrop.addEventListener('dragleave', () => tDom.uploadDrop.classList.remove('drag-over'));
    tDom.uploadDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        tDom.uploadDrop.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleTrendFileUpload(e.dataTransfer.files[0]);
        }
    });

    const expectedTrendColumns = ['base_loss', 'historical_start_date', 'historical_end_date', 'future_start_date', 'policy_term_months'];

    function handleTrendFileUpload(file) {
        if (!file) return;
        tDom.uploadStatus.classList.remove('hidden', 'success', 'error');
        tDom.uploadStatus.textContent = 'Reading file...';
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
                
                if (rows.length === 0) throw new Error("File is empty.");
                
                const firstRow = rows[0];
                const missing = expectedTrendColumns.filter(c => !(c in firstRow));
                if (missing.length > 0) {
                    throw new Error(`Missing columns: ${missing.join(', ')}`);
                }
                
                const formatDate = (val) => {
                    if (!val) return '';
                    if (val instanceof Date) return val.toISOString().split('T')[0];
                    if (typeof val === 'number') {
                        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
                        return date.toISOString().split('T')[0];
                    }
                    return String(val).split('T')[0];
                };

                uploadedTrendPortfolioRows = rows.map(r => ({
                    base_loss: parseFloat(r.base_loss),
                    historical_start_date: formatDate(r.historical_start_date),
                    historical_end_date: formatDate(r.historical_end_date),
                    future_start_date: formatDate(r.future_start_date),
                    policy_term_months: parseInt(r.policy_term_months) || 12,
                    latest_data_point_date: formatDate(r.latest_data_point_date)
                })).filter(r => !isNaN(r.base_loss));

                tDom.uploadStatus.textContent = `Successfully loaded ${uploadedTrendPortfolioRows.length} portfolio rows.`;
                tDom.uploadStatus.classList.add('success');
                tDom.fileUpload.value = '';
            } catch (err) {
                tDom.uploadStatus.textContent = 'Error: ' + err.message;
                tDom.uploadStatus.classList.add('error');
                uploadedTrendPortfolioRows = null;
            }
        };
        reader.readAsArrayBuffer(file);
    }

    async function processTrendPortfolio(policies) {
        const payload = {
            currentTrendRate: parseNum(tDom.currentRate.value),
            trendMode: tMode,
            policies: policies,
        };

        if (tMode === 'two-step') {
            payload.projectedTrendRate = parseNum(tDom.projectedRate.value);
            payload.latestDataPointDate = tDom.latestData.value;
        }

        const resp = await fetch('/api/trend/portfolio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Portfolio trend error');
        }

        const data = await resp.json();
        renderTrendPortfolio(data);
    }

    function renderTrendPortfolio(data) {
        tDom.portfolioSec.classList.remove('hidden');
        tDom.portfolioBody.innerHTML = '';
        trendPortfolioResultsData = data.results;
        
        let totalTrended = 0;

        data.results.forEach(r => {
            if (r.status === 'Success') totalTrended += r.trended_loss;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${r.idx}</td>
                <td>${fmtCurrency(r.base_loss)}</td>
                <td>${r.status === 'Success' ? fmtFactor(r.trend_factor) : '—'}</td>
                <td style="font-weight:bold; color:var(--accent);">${r.status === 'Success' ? fmtCurrency(r.trended_loss) : '—'}</td>
                <td class="${r.impact >= 0 ? 'val-pos' : 'val-neg'}">${r.status === 'Success' ? fmtPct(r.impact) : '—'}</td>
                <td style="color:${r.status === 'Success' ? 'inherit' : 'var(--danger)'}">${r.status}</td>
            `;
            tDom.portfolioBody.appendChild(tr);
        });
        
        data.summary_audit.forEach(step => {
            const div = document.createElement('div');
            div.className = 'audit-step';
            div.innerHTML = `<span class="step-label">${step.label}</span> <span class="step-detail">${step.detail}</span>`;
            tDom.auditTrail.appendChild(div);
        });

        if (isNaN(parseNum(tDom.baseValue.value))) {
            sharedState.trendResult = { trendedValue: totalTrended };
            updateSummaryPanel();
        }
    }

    tDom.btnDownload.addEventListener('click', () => {
        if (!trendPortfolioResultsData) return;
        const worksheet = XLSX.utils.json_to_sheet(trendPortfolioResultsData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Trend Portfolio");
        XLSX.writeFile(workbook, "Loss_Trend_Portfolio_Results.xlsx");
    });
})();

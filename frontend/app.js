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
        premium: $('#historical-premium'),
        policyDate: $('#policy-effective-date'),
        evalDate: $('#evaluation-date'),
        policyTerm: $('#policy-term'),
        basisToggle: $('#basis-toggle'),
        earningSelect: $('#earning-pattern'),
        customSection: $('#custom-weights-section'),
        customWeights: $('#custom-weights'),
        rateTableBody: $('#rate-table-body'),
        rateTableEmpty: $('#rate-table-empty'),
        btnAddRow: $('#btn-add-row'),
        btnSortRows: $('#btn-sort-rows'),
        btnCalculate: $('#btn-calculate'),
        btnReset: $('#btn-reset'),
        validationBox: $('#validation-errors'),
        kpiFactor: $('#kpi-factor-value'),
        kpiPremium: $('#kpi-premium-value'),
        kpiCumulative: $('#kpi-cumulative-value'),
        kpiAdequacy: $('#kpi-adequacy-value'),
        kpiRow: $('#kpi-row'),
        historyBody: $('#history-table-body'),
        historyEmpty: $('#history-empty'),
        chartCanvas: $('#rate-chart'),
        scenarioName: $('#scenario-name'),
        btnSaveScen: $('#btn-save-scenario'),
        btnClearScen: $('#btn-clear-scenarios'),
        scenarioCards: $('#scenario-cards'),
        auditTrail: $('#audit-trail'),
        fileUpload: $('#file-upload'),
        uploadDrop: $('#upload-drop'),
        uploadStatus: $('#upload-status'),
        portfolioSec: $('#portfolio-section'),
        portfolioBody: $('#portfolio-table-body'),
        btnDownload: $('#btn-download-portfolio'),
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
    let chartInstance = null;
    let trendChartInstance = null;
    let scenarios = [];
    let portfolioData = [];
    let uploadedPortfolioRows = null;
    let currentBasis = 'written';
    let rowIdCounter = 0;
    
    // Trend state
    let tMode = 'single';
    let uploadedTrendPortfolioRows = null;
    let trendPortfolioResultsData = null;

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

    dom.basisToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('.toggle-btn');
        if (!btn) return;
        dom.basisToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentBasis = btn.dataset.value;
    });

    dom.earningSelect.addEventListener('change', () => {
        dom.customSection.classList.toggle('hidden', dom.earningSelect.value !== 'custom');
    });

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

    function validate() {
        const errors = [];
        const premium = parseNum(dom.premium.value);
        if (isNaN(premium) || premium <= 0) errors.push('Historical Premium must be a positive number.');
        if (!dom.policyDate.value) errors.push('Policy Effective Date is required.');
        if (!dom.evalDate.value) errors.push('Evaluation Date is required.');
        const term = parseInt(dom.policyTerm.value);
        if (isNaN(term) || term < 1) errors.push('Policy Term must be at least 1 month.');
        if (dom.policyDate.value && dom.evalDate.value && dom.evalDate.value < dom.policyDate.value) {
            errors.push('Evaluation Date must be on or after Policy Effective Date.');
        }
        rateRows.forEach((r, i) => {
            if (!r.date) errors.push(`Rate change row ${i + 1}: date is missing.`);
            const p = parseNum(r.pct);
            if (isNaN(p)) errors.push(`Rate change row ${i + 1}: rate change must be a valid number.`);
        });
        return errors;
    }

    function showErrors(el, errors) {
        if (errors.length === 0) { el.classList.add('hidden'); return; }
        el.classList.remove('hidden');
        el.innerHTML = '<ul>' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
    }

    function buildPayload() {
        const customRaw = dom.customWeights.value.trim();
        let customWeights = null;
        if (currentBasis === 'earned' && dom.earningSelect.value === 'custom' && customRaw) {
            customWeights = customRaw.split(',').map(s => parseFloat(s.trim()));
        }
        return {
            historicalPremium: parseNum(dom.premium.value),
            policyEffectiveDate: dom.policyDate.value,
            evaluationDate: dom.evalDate.value,
            policyTerm: parseInt(dom.policyTerm.value),
            basis: currentBasis,
            earningPattern: dom.earningSelect.value,
            customWeights,
            rateChanges: rateRows
                .filter(r => r.date && r.pct !== '')
                .map(r => ({ date: r.date, pct: parseNum(r.pct) })),
        };
    }

    async function calculate() {
        const errors = validate();
        showErrors(dom.validationBox, errors);
        if (errors.length > 0) return null;

        const payload = buildPayload();
        dom.btnCalculate.disabled = true;
        dom.btnCalculate.textContent = 'Calculating…';

        try {
            const resp = await fetch('/api/calculate', {
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
            renderOutputs(result);

            sharedState.onLevelResult = result;
            sharedState.onLevelPremium = result.onLevelPremium;
            sharedState.historicalStartDate = dom.policyDate.value;
            sharedState.historicalEndDate = dom.evalDate.value;
            updateSummaryPanel();
            
            if (uploadedPortfolioRows && uploadedPortfolioRows.length > 0) {
                await processPortfolio(uploadedPortfolioRows);
            }
            return result;
        } catch (e) {
            showErrors(dom.validationBox, [`Network error: ${e.message}`]);
            return null;
        } finally {
            dom.btnCalculate.disabled = false;
            dom.btnCalculate.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="14" y1="18" x2="16" y2="18"/></svg>
        Calculate On-Level Premium`;
        }
    }

    function renderOutputs(result) {
        dom.kpiFactor.textContent = fmtFactor(result.onLevelFactor);
        dom.kpiPremium.textContent = fmtCurrency(result.onLevelPremium);
        dom.kpiCumulative.textContent = fmtPct(result.cumulativeChange);
        dom.kpiCumulative.className = 'kpi-value ' + (result.cumulativeChange >= 0 ? 'val-pos' : 'val-neg');
        const adeq = result.adequacy;
        dom.kpiAdequacy.textContent = adeq.label + ' (' + fmtPct(adeq.value) + ')';
        dom.kpiAdequacy.className = 'kpi-value ' + (adeq.direction === 'up' ? 'val-neg' : adeq.direction === 'down' ? 'val-pos' : '');
        
        dom.kpiRow.querySelectorAll('.kpi-card').forEach(card => {
            card.classList.remove('highlight'); void card.offsetWidth; card.classList.add('highlight');
        });

        renderHistoryTable(result.rateLevelHistory);
        renderChart(result);
        renderAudit(dom.auditTrail, result.auditTrail);
    }

    function renderHistoryTable(history) {
        dom.historyBody.innerHTML = '';
        dom.historyEmpty.classList.add('hidden');
        history.forEach(h => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td>${h.dateStr}</td>
        <td class="${h.rateChange > 0 ? 'val-pos' : h.rateChange < 0 ? 'val-neg' : ''}">${h.dateStr === 'Base' ? '—' : fmtPct(h.rateChange)}</td>
        <td>${fmtFactor(h.rateLevel)}</td>
        <td class="${h.cumulativeChange > 0 ? 'val-pos' : h.cumulativeChange < 0 ? 'val-neg' : ''}">${fmtPct(h.cumulativeChange)}</td>`;
            dom.historyBody.appendChild(tr);
        });
    }

    function renderChart(result) {
        const history = result.rateLevelHistory.filter(h => h.dateStr !== 'Base');
        if (history.length === 0) { if (chartInstance) chartInstance.destroy(); return; }
        const labels = history.map(h => new Date(h.dateStr));
        const data = history.map(h => h.rateLevel);

        if (chartInstance) chartInstance.destroy();
        const ctx = dom.chartCanvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 280);
        gradient.addColorStop(0, 'rgba(56,189,248,.25)'); gradient.addColorStop(1, 'rgba(56,189,248,.02)');

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Rate Level', data, borderColor: '#38bdf8', backgroundColor: gradient, borderWidth: 2.5, pointBackgroundColor: '#38bdf8', pointBorderColor: '#0b0f1a', pointBorderWidth: 2, pointRadius: 4, fill: true, tension: 0.25, stepped: 'before', }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { type: 'time', time: { unit: 'month' } } } }
        });
    }

    function renderAudit(container, auditSteps) {
        container.innerHTML = '';
        auditSteps.forEach(step => {
            const div = document.createElement('div');
            div.className = 'audit-step';
            let html = `<span class="step-label">${step.label}</span> <span class="step-detail">${step.detail}</span>`;
            if (step.formula) html += `<br><span class="step-formula">${step.formula}</span>`;
            div.innerHTML = html;
            container.appendChild(div);
        });
    }


    // ══════════════════════════════════════════
    //  LOSS TRENDING MODULE (NEW)
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
        
        // Single inputs are only strictly required if no portfolio is uploaded
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
                // Clear single outputs if only portfolio was processed
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
        renderAudit(tDom.auditTrail, result.auditTrail);
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





    // ══════════════════════════════════════════
    //  LOSS TREND PORTFOLIO
    // ══════════════════════════════════════════

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

                const parsed = rows.map(r => ({
                    base_loss: parseNum(r.base_loss),
                    historical_start_date: formatDate(r.historical_start_date),
                    historical_end_date: formatDate(r.historical_end_date),
                    future_start_date: formatDate(r.future_start_date),
                    policy_term_months: parseInt(r.policy_term_months) || 12,
                    latest_data_point_date: r.latest_data_point_date ? formatDate(r.latest_data_point_date) : null
                }));
                
                uploadedTrendPortfolioRows = parsed;
                tDom.uploadStatus.textContent = `Loaded ${parsed.length} rows successfully. Click Calculate to process.`;
                tDom.uploadStatus.className = 'upload-status success';
                tDom.portfolioSec.classList.add('hidden');
            } catch (err) {
                uploadedTrendPortfolioRows = null;
                tDom.uploadStatus.textContent = err.message;
                tDom.uploadStatus.className = 'upload-status error';
            }
        };
        reader.readAsArrayBuffer(file);
    }

    async function processTrendPortfolio(rows) {
        if (!rows || rows.length === 0) return;
        
        const crate = parseNum(tDom.currentRate.value);
        let prate = null;
        let globalLatestData = null;
        
        if (tMode === 'two-step') {
            prate = parseNum(tDom.projectedRate.value);
            globalLatestData = tDom.latestData.value;
        }
        
        const payload = {
            baseValue: parseNum(tDom.baseValue.value) || 1, 
            historicalStartDate: tDom.histStart.value || '2020-01-01',
            historicalEndDate: tDom.histEnd.value || '2020-12-31',
            futureStartDate: tDom.futureStart.value || '2021-01-01',
            policyTermMonths: parseInt(tDom.futureTerm.value) || 12,
            currentTrendRate: crate,
            trendMode: tMode,
            policies: rows
        };
        
        if (tMode === 'two-step') {
            payload.projectedTrendRate = prate;
            payload.latestDataPointDate = globalLatestData;
            
            payload.policies = rows.map(r => ({
                ...r,
                latest_data_point_date: r.latest_data_point_date || globalLatestData
            }));
        }
        
        try {
            const resp = await fetch('/api/trend/portfolio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            
            if (!resp.ok) {
                const err = await resp.json();
                showErrors(tDom.validationBox, [err.detail || 'Portfolio server error']);
                return;
            }
            
            const result = await resp.json();
            trendPortfolioResultsData = result.results;
            renderTrendPortfolioTable(result.results);
            tDom.portfolioSec.classList.remove('hidden');
        } catch (e) {
            showErrors(tDom.validationBox, [`Portfolio network error: ${e.message}`]);
        }
    }
    
    function renderTrendPortfolioTable(results) {
        tDom.portfolioBody.innerHTML = '';
        results.slice(0, 50).forEach(r => {
            const tr = document.createElement('tr');
            if (r.status === 'Error') {
                tr.innerHTML = `<td>${r.idx}</td><td colspan="4" class="val-neg">Error processing row</td><td>Error</td>`;
            } else {
                tr.innerHTML = `
                <td>${r.idx}</td>
                <td>${fmtCurrency(r.base_loss)}</td>
                <td>${fmtFactor(r.trend_factor)}</td>
                <td>${fmtCurrency(r.trended_loss)}</td>
                <td class="${r.impact >= 0 ? 'val-pos' : 'val-neg'}">${fmtPct(r.impact)}</td>
                <td class="val-pos">Success</td>`;
            }
            tDom.portfolioBody.appendChild(tr);
        });
        if (results.length > 50) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="6" style="text-align:center; color:var(--text-dim); font-size: 0.75rem;">Showing first 50 of ${results.length} rows...</td>`;
            tDom.portfolioBody.appendChild(tr);
        }
    }

    tDom.btnDownload.addEventListener('click', () => {
        if (!trendPortfolioResultsData) return;
        
        const worksheet = XLSX.utils.json_to_sheet(trendPortfolioResultsData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Trend Results");
        XLSX.writeFile(workbook, "Loss_Trend_Portfolio_Results.xlsx");
    });


    // ══════════════════════════════════════════
    //  SUMMARY PANEL
    // ══════════════════════════════════════════
    function updateSummaryPanel() {
        sumDom.onlevel.textContent = sharedState.onLevelPremium != null ? fmtCurrency(sharedState.onLevelPremium) : '—';
        sumDom.trend.textContent = sharedState.trendResult ? fmtCurrency(sharedState.trendResult.trendedValue) : '—';
    }


    // ── Utility ──
    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // Events
    dom.btnCalculate.addEventListener('click', calculate);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.target.closest('table') && !e.target.closest('.scenario-controls')) {
            const activePanel = document.querySelector('.tab-panel.active');
            if (activePanel && activePanel.id === 'tab-panel-onlevel') calculate();
            else if (activePanel && activePanel.id === 'tab-panel-trend') calculateTrend();
        }
    });

    // Reset handlers
    dom.btnReset.addEventListener('click', () => { window.location.reload(); }); // simplified reset

    // ── Init: sample rows ──
    addRateRow('2022-07-01', '5');
    addRateRow('2023-01-01', '3');
    addRateRow('2024-01-01', '-2');

})();

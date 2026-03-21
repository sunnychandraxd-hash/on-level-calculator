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
        onLevelResult: null,   // last on-level calculation result
        trendResult: null,     // last trend calculation result
        workflowResult: null,  // last workflow result
        // Cached values for interlinking
        onLevelPremium: null,
        historicalStartDate: null,
        historicalEndDate: null,
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
        useOnLevelToggle: $('#use-onlevel-toggle'),
        interlinkStatus: $('#interlink-status'),
        btnCalculate: $('#btn-calculate-trend'),
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

    // Workflow DOM
    const wDom = {
        // Step 1: On-Level
        premium: $('#wf-premium'),
        policyDate: $('#wf-policy-date'),
        evalDate: $('#wf-eval-date'),
        policyTerm: $('#wf-policy-term'),
        basisToggle: $('#wf-basis-toggle'),
        earningSelect: $('#wf-earning-pattern'),
        rateTableBody: $('#wf-rate-table-body'),
        btnAddRow: $('#wf-btn-add-row'),
        // Step 2: Loss Trend Config
        customDatesToggle: $('#wf-custom-dates-toggle'),
        dateSourceStatus: $('#wf-date-source-status'),
        customDatesFields: $('#wf-custom-dates'),
        customHistStart: $('#wf-custom-hist-start'),
        customHistEnd: $('#wf-custom-hist-end'),
        futureStart: $('#wf-future-start'),
        futureTerm: $('#wf-future-term'),
        modeToggle: $('#wf-trend-mode-toggle'),
        currentRate: $('#wf-trend-rate'),
        twoStepFields: $('#wf-two-step-fields'),
        projectedRate: $('#wf-projected-rate'),
        latestData: $('#wf-latest-data'),
        btnRun: $('#btn-run-workflow'),
        validationBox: $('#wf-validation-errors'),
        // Results
        olPremium: $('#wf-ol-premium'),
        olFactor: $('#wf-ol-factor'),
        finalValue: $('#wf-final-value'),
        trendImpact: $('#wf-trend-impact'),
        auditTrail: $('#wf-audit-trail'),
    };

    // Summary
    const sumDom = {
        onlevel: $('#summary-onlevel'),
        trend: $('#summary-trend'),
        workflow: $('#summary-workflow'),
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
    // Workflow state
    let wfRateRows = [];
    let wfRowIdCounter = 0;
    let wfBasis = 'written';
    let wfTMode = 'single';

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
            if (tab === 'trend') updateInterlinkStatus();
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

    function updateInterlinkStatus() {
        if (sharedState.onLevelResult) {
            tDom.interlinkStatus.textContent = `Available: ${fmtCurrency(sharedState.onLevelPremium)}`;
            tDom.interlinkStatus.classList.add('available');
        } else {
            tDom.interlinkStatus.textContent = 'No on-level result available';
            tDom.interlinkStatus.classList.remove('available');
        }
    }

    tDom.useOnLevelToggle.addEventListener('change', () => {
        const checked = tDom.useOnLevelToggle.checked;
        if (checked && !sharedState.onLevelResult) {
            tDom.useOnLevelToggle.checked = false;
            showErrors(tDom.validationBox, ['Run an On-Leveling calculation first.']);
            return;
        }
        if (checked) {
            tDom.baseValue.value = sharedState.onLevelPremium.toFixed(2);
            tDom.histStart.value = sharedState.historicalStartDate;
            tDom.histEnd.value = sharedState.historicalEndDate;
            [tDom.baseValue, tDom.histStart, tDom.histEnd].forEach(el => { el.classList.add('interlinked'); el.readOnly = true; });
        } else {
            [tDom.baseValue, tDom.histStart, tDom.histEnd].forEach(el => { el.classList.remove('interlinked'); el.readOnly = false; });
        }
    });

    function validateTrend() {
        const errors = [];
        const val = parseNum(tDom.baseValue.value);
        if (isNaN(val) || val <= 0) errors.push('Base Value must be a positive number.');
        if (!tDom.histStart.value) errors.push('Historical Period Start is required.');
        if (!tDom.histEnd.value) errors.push('Historical Period End is required.');
        if (!tDom.futureStart.value) errors.push('Future Effective Date is required.');
        
        const term = parseInt(tDom.futureTerm.value);
        if (isNaN(term) || term < 1) errors.push('Policy Term must be at least 1 month.');
        
        const crate = parseNum(tDom.currentRate.value);
        if (isNaN(crate)) errors.push('Current Trend Rate is required.');

        if (tMode === 'two-step') {
            const prate = parseNum(tDom.projectedRate.value);
            if (isNaN(prate)) errors.push('Projected Trend Rate is required for two-step trending.');
            if (!tDom.latestData.value) errors.push('Latest Data Point Date is required for two-step trending.');
        }

        if (tDom.histStart.value && tDom.histEnd.value && tDom.histEnd.value <= tDom.histStart.value) {
            errors.push('Historical Period End must be after Start Date.');
        }
        return errors;
    }

    async function calculateTrend() {
        const errors = validateTrend();
        showErrors(tDom.validationBox, errors);
        if (errors.length > 0) return null;

        tDom.btnCalculate.disabled = true;
        tDom.btnCalculate.textContent = 'Calculating…';

        try {
            const payload = {
                baseValue: parseNum(tDom.baseValue.value),
                historicalStartDate: tDom.histStart.value,
                historicalEndDate: tDom.histEnd.value,
                futureStartDate: tDom.futureStart.value,
                policyTermMonths: parseInt(tDom.futureTerm.value),
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
        } catch (e) {
            showErrors(tDom.validationBox, [`Network error: ${e.message}`]);
            return null;
        } finally {
            tDom.btnCalculate.disabled = false;
            tDom.btnCalculate.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Calculate Loss Trend`;
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
    //  WORKFLOW MODULE
    // ══════════════════════════════════════════

    wDom.basisToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('.toggle-btn');
        if (!btn) return;
        wDom.basisToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        wfBasis = btn.dataset.value;
    });

    wDom.customDatesToggle.addEventListener('change', () => {
        const checked = wDom.customDatesToggle.checked;
        wDom.customDatesFields.classList.toggle('hidden', !checked);
        wDom.dateSourceStatus.textContent = checked ? 'Using Custom Dates' : 'Using On-Level Dates';
        if (!checked) { wDom.customHistStart.value = ''; wDom.customHistEnd.value = ''; }
    });

    wDom.modeToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('.toggle-btn');
        if (!btn) return;
        wDom.modeToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        wfTMode = btn.dataset.value;
        wDom.twoStepFields.classList.toggle('hidden', wfTMode !== 'two-step');
    });

    function addWfRateRow(date = '', pct = '') {
        const id = ++wfRowIdCounter;
        wfRateRows.push({ id, date, pct });
        renderWfRateTable();
    }

    function renderWfRateTable() {
        wDom.rateTableBody.innerHTML = '';
        wfRateRows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td><input type="date" class="wf-rc-date" data-id="${row.id}" value="${row.date}" /></td>
        <td><input type="text" class="wf-rc-pct" data-id="${row.id}" value="${row.pct}" placeholder="e.g. 5" inputmode="decimal" /></td>
        <td><button class="btn-remove-row wf-remove" data-id="${row.id}" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button></td>`;
            wDom.rateTableBody.appendChild(tr);
        });
    }

    wDom.rateTableBody.addEventListener('input', (e) => {
        const id = parseInt(e.target.dataset.id);
        const row = wfRateRows.find(r => r.id === id);
        if (!row) return;
        if (e.target.classList.contains('wf-rc-date')) row.date = e.target.value;
        if (e.target.classList.contains('wf-rc-pct')) row.pct = e.target.value;
    });
    wDom.rateTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.wf-remove');
        if (btn) { wfRateRows = wfRateRows.filter(r => r.id !== parseInt(btn.dataset.id)); renderWfRateTable(); }
    });
    wDom.btnAddRow.addEventListener('click', () => addWfRateRow());

    function setPipelineStep(stepId, state) {
        const el = $(`#${stepId}`);
        el.classList.remove('active', 'done');
        if (state) el.classList.add(state);
    }
    function resetPipelineSteps() { ['pipe-step-ol', 'pipe-step-trend', 'pipe-step-final'].forEach(id => setPipelineStep(id, null)); }

    function validateWorkflow() {
        const errors = [];
        const premium = parseNum(wDom.premium.value);
        if (isNaN(premium) || premium <= 0) errors.push('Historical Premium must be a positive number.');
        if (!wDom.policyDate.value) errors.push('Policy Effective Date is required.');
        if (!wDom.evalDate.value) errors.push('Evaluation Date is required.');
        
        if (wDom.customDatesToggle.checked) {
            if (!wDom.customHistStart.value || !wDom.customHistEnd.value) errors.push('Custom Historical Start & End dates are required.');
        }

        const rate = parseNum(wDom.currentRate.value);
        if (isNaN(rate)) errors.push('Current Trend Rate is required.');

        if (wfTMode === 'two-step') {
            const prate = parseNum(wDom.projectedRate.value);
            if (isNaN(prate)) errors.push('Projected Trend Rate is required for two-step trending.');
            if (!wDom.latestData.value) errors.push('Latest Data Point Date is required for two-step trending.');
        }

        return errors;
    }

    async function runWorkflow() {
        const errors = validateWorkflow();
        showErrors(wDom.validationBox, errors);
        if (errors.length > 0) return;

        wDom.btnRun.disabled = true; wDom.btnRun.textContent = 'Running…';
        resetPipelineSteps(); setPipelineStep('pipe-step-ol', 'active');

        try {
            const payload = {
                onLevelInput: {
                    historicalPremium: parseNum(wDom.premium.value),
                    policyEffectiveDate: wDom.policyDate.value,
                    evaluationDate: wDom.evalDate.value,
                    policyTerm: parseInt(wDom.policyTerm.value) || 12,
                    basis: wfBasis,
                    earningPattern: wDom.earningSelect.value,
                    customWeights: null,
                    rateChanges: wfRateRows.filter(r => r.date && r.pct !== '').map(r => ({ date: r.date, pct: parseNum(r.pct) })),
                },
                trendConfig: {
                    currentTrendRate: parseNum(wDom.currentRate.value),
                    trendMode: wfTMode,
                    policyTermMonths: parseInt(wDom.futureTerm.value) || 12,
                    useCustomDates: wDom.customDatesToggle.checked,
                    futureStartDate: wDom.futureStart.value || wDom.evalDate.value,
                },
            };

            if (wDom.customDatesToggle.checked) {
                payload.trendConfig.customHistoricalStart = wDom.customHistStart.value;
                payload.trendConfig.customHistoricalEnd = wDom.customHistEnd.value;
            }
            if (wfTMode === 'two-step') {
                payload.trendConfig.projectedTrendRate = parseNum(wDom.projectedRate.value);
                payload.trendConfig.latestDataPointDate = wDom.latestData.value;
            }

            const resp = await fetch('/api/workflow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!resp.ok) { const err = await resp.json(); showErrors(wDom.validationBox, [err.detail || 'Server error']); resetPipelineSteps(); return; }
            const result = await resp.json();

            // Pipeline animation
            setPipelineStep('pipe-step-ol', 'done'); await sleep(300);
            setPipelineStep('pipe-step-trend', 'active'); await sleep(300);
            setPipelineStep('pipe-step-trend', 'done'); setPipelineStep('pipe-step-final', 'active');
            await sleep(200); setPipelineStep('pipe-step-final', 'done');

            // Render
            wDom.olPremium.textContent = fmtCurrency(result.onLevelResult.onLevelPremium);
            wDom.olFactor.textContent = `Factor: ${fmtFactor(result.onLevelResult.onLevelFactor)}`;
            wDom.finalValue.textContent = fmtCurrency(result.finalValue);
            wDom.trendImpact.textContent = `Impact: ${fmtPct(result.trendResult.totalTrendImpact)}`;
            
            wDom.finalValue.parentElement.classList.remove('highlight');
            void wDom.finalValue.parentElement.offsetWidth;
            wDom.finalValue.parentElement.classList.add('highlight');

            const combinedAudit = [
                { label: '── ON-LEVELING ──', detail: '' },
                ...result.onLevelResult.auditTrail,
                { label: '── LOSS TRENDING ──', detail: '' },
                ...result.trendResult.auditTrail,
                { label: 'FINAL RESULT', detail: `Workflow Final Value = ${fmtCurrency(result.finalValue)}` },
            ];
            renderAudit(wDom.auditTrail, combinedAudit);

            sharedState.workflowResult = result;
            sharedState.onLevelResult = result.onLevelResult;
            sharedState.onLevelPremium = result.onLevelResult.onLevelPremium;
            sharedState.historicalStartDate = wDom.policyDate.value;
            sharedState.historicalEndDate = wDom.evalDate.value;
            updateSummaryPanel();
        } catch (e) {
            showErrors(wDom.validationBox, [`Network error: ${e.message}`]); resetPipelineSteps();
        } finally {
            wDom.btnRun.disabled = false;
            wDom.btnRun.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/><line x1="8" y1="12" x2="16" y2="12"/></svg> Run Full Workflow`;
        }
    }

    wDom.btnRun.addEventListener('click', runWorkflow);


    // ══════════════════════════════════════════
    //  SUMMARY PANEL
    // ══════════════════════════════════════════
    function updateSummaryPanel() {
        sumDom.onlevel.textContent = sharedState.onLevelPremium != null ? fmtCurrency(sharedState.onLevelPremium) : '—';
        sumDom.trend.textContent = sharedState.trendResult ? fmtCurrency(sharedState.trendResult.trendedValue) : '—';
        sumDom.workflow.textContent = sharedState.workflowResult ? fmtCurrency(sharedState.workflowResult.finalValue) : '—';
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
            else if (activePanel && activePanel.id === 'tab-panel-workflow') runWorkflow();
        }
    });

    // Reset handlers
    dom.btnReset.addEventListener('click', () => { window.location.reload(); }); // simplified reset

    // ── Init: sample rows ──
    addRateRow('2022-07-01', '5');
    addRateRow('2023-01-01', '3');
    addRateRow('2024-01-01', '-2');
    addWfRateRow('2023-01-01', '5');

})();

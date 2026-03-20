/* ────────────────────────────────────────────
   On-Level Calculator — Frontend (API Client)
   All calculation logic runs on the backend.
   This file handles UI interaction only.
   ──────────────────────────────────────────── */
(() => {
    'use strict';

    const $ = (s) => document.querySelector(s);

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

    // ── State ──
    let rateRows = [];
    let chartInstance = null;
    let scenarios = [];
    let portfolioData = [];
    let uploadedPortfolioRows = null;
    let currentBasis = 'written';
    let rowIdCounter = 0;

    // ── Helpers ──
    const parseNum = (v) => {
        const s = String(v).replace(/[^0-9.\-]/g, '');
        return s === '' ? NaN : parseFloat(s);
    };
    const fmtCurrency = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtPct = (n) => (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';
    const fmtFactor = (n) => n.toFixed(6);

    // ── Basis Toggle ──
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

    // ── Rate Change Table ──
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
        <td><input type="text" class="rc-pct" data-id="${row.id}" value="${row.pct}" placeholder="e.g. 5 or -3" inputmode="decimal" /></td>
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

    // ── Validation (client-side quick check) ──
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

    function showErrors(errors) {
        if (errors.length === 0) { dom.validationBox.classList.add('hidden'); return; }
        dom.validationBox.classList.remove('hidden');
        dom.validationBox.innerHTML = '<ul>' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
    }

    // ── Build API Payload ──
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

    // ── Call Backend API ──
    async function calculate() {
        const errors = validate();
        showErrors(errors);
        if (errors.length > 0) return null;

        const payload = buildPayload();

        // Show loading state
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
                showErrors([err.detail || 'Server error']);
                return null;
            }

            const result = await resp.json();
            renderOutputs(result);
            if (uploadedPortfolioRows && uploadedPortfolioRows.length > 0) {
                await processPortfolio(uploadedPortfolioRows);
            }
            return result;
        } catch (e) {
            showErrors([`Network error: ${e.message}. Is the server running?`]);
            return null;
        } finally {
            dom.btnCalculate.disabled = false;
            dom.btnCalculate.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="14" y1="18" x2="16" y2="18"/></svg>
        Calculate On-Level Premium`;
        }
    }

    // ── Render Outputs ──
    function renderOutputs(result) {
        dom.kpiFactor.textContent = fmtFactor(result.onLevelFactor);
        dom.kpiPremium.textContent = fmtCurrency(result.onLevelPremium);
        dom.kpiCumulative.textContent = fmtPct(result.cumulativeChange);
        dom.kpiCumulative.className = 'kpi-value ' + (result.cumulativeChange >= 0 ? 'val-pos' : 'val-neg');

        const adeq = result.adequacy;
        dom.kpiAdequacy.textContent = adeq.label + ' (' + fmtPct(adeq.value) + ')';
        dom.kpiAdequacy.className = 'kpi-value ' + (adeq.direction === 'up' ? 'val-neg' : adeq.direction === 'down' ? 'val-pos' : '');

        dom.kpiRow.querySelectorAll('.kpi-card').forEach(card => {
            card.classList.remove('highlight');
            void card.offsetWidth;
            card.classList.add('highlight');
        });

        renderHistoryTable(result.rateLevelHistory);
        renderChart(result);
        renderAudit(result.auditTrail);
    }

    function renderHistoryTable(history) {
        dom.historyBody.innerHTML = '';
        dom.historyEmpty.classList.add('hidden');
        history.forEach(h => {
            const tr = document.createElement('tr');
            const changeCls = h.rateChange > 0 ? 'val-pos' : h.rateChange < 0 ? 'val-neg' : '';
            const cumCls = h.cumulativeChange > 0 ? 'val-pos' : h.cumulativeChange < 0 ? 'val-neg' : '';
            tr.innerHTML = `
        <td>${h.dateStr}</td>
        <td class="${changeCls}">${h.dateStr === 'Base' ? '—' : fmtPct(h.rateChange)}</td>
        <td>${fmtFactor(h.rateLevel)}</td>
        <td class="${cumCls}">${fmtPct(h.cumulativeChange)}</td>`;
            dom.historyBody.appendChild(tr);
        });
    }

    function renderChart(result) {
        const history = result.rateLevelHistory.filter(h => h.dateStr !== 'Base');
        if (history.length === 0) {
            if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
            return;
        }
        const labels = history.map(h => new Date(h.dateStr));
        const data = history.map(h => h.rateLevel);

        if (chartInstance) chartInstance.destroy();

        const ctx = dom.chartCanvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 280);
        gradient.addColorStop(0, 'rgba(56,189,248,.25)');
        gradient.addColorStop(1, 'rgba(56,189,248,.02)');

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Rate Level',
                    data,
                    borderColor: '#38bdf8',
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    pointBackgroundColor: '#38bdf8',
                    pointBorderColor: '#0b0f1a',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.25,
                    stepped: 'before',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17,24,39,.92)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255,255,255,.1)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            label: (ctx) => `Rate Level: ${ctx.parsed.y.toFixed(4)}`,
                        }
                    },
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'month', tooltipFormat: 'MMM yyyy' },
                        grid: { color: 'rgba(255,255,255,.05)' },
                        ticks: { color: '#64748b', font: { size: 11 } },
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,.05)' },
                        ticks: { color: '#64748b', font: { size: 11 }, callback: v => v.toFixed(2) },
                        beginAtZero: false,
                    }
                }
            }
        });
    }

    function renderAudit(auditSteps) {
        dom.auditTrail.innerHTML = '';
        auditSteps.forEach(step => {
            const div = document.createElement('div');
            div.className = 'audit-step';
            let html = `<span class="step-label">${step.label}</span> <span class="step-detail">${step.detail}</span>`;
            if (step.formula) html += `<br><span class="step-formula">${step.formula}</span>`;
            div.innerHTML = html;
            dom.auditTrail.appendChild(div);
        });
    }

    // ── Scenarios ──
    function getCurrentInputs() {
        return {
            premium: dom.premium.value,
            policyDate: dom.policyDate.value,
            evalDate: dom.evalDate.value,
            policyTerm: dom.policyTerm.value,
            basis: currentBasis,
            earningPattern: dom.earningSelect.value,
            customWeights: dom.customWeights.value,
            rateRows: rateRows.map(r => ({ date: r.date, pct: r.pct })),
        };
    }

    function loadInputs(inputs) {
        dom.premium.value = inputs.premium;
        dom.policyDate.value = inputs.policyDate;
        dom.evalDate.value = inputs.evalDate;
        dom.policyTerm.value = inputs.policyTerm;
        currentBasis = inputs.basis;
        dom.basisToggle.querySelectorAll('.toggle-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.value === currentBasis);
        });
        dom.earningSelect.value = inputs.earningPattern;
        dom.customSection.classList.toggle('hidden', inputs.earningPattern !== 'custom');
        dom.customWeights.value = inputs.customWeights;
        rateRows = inputs.rateRows.map(r => ({ id: ++rowIdCounter, date: r.date, pct: r.pct }));
        renderRateTable();
    }

    dom.btnSaveScen.addEventListener('click', async () => {
        const name = dom.scenarioName.value.trim() || `Scenario ${scenarios.length + 1}`;
        const result = await calculate();
        if (!result) return;
        scenarios.push({
            name,
            inputs: getCurrentInputs(),
            factor: result.onLevelFactor,
            premium: result.onLevelPremium,
            cumulativeChange: result.cumulativeChange,
            adequacy: result.adequacy,
        });
        dom.scenarioName.value = '';
        renderScenarios();
    });

    dom.btnClearScen.addEventListener('click', () => { scenarios = []; renderScenarios(); });

    function renderScenarios() {
        dom.scenarioCards.innerHTML = '';
        scenarios.forEach((sc, i) => {
            const card = document.createElement('div');
            card.className = 'scenario-card';
            card.innerHTML = `
        <button class="btn-delete-scenario" data-idx="${i}" title="Delete">✕</button>
        <h4>${sc.name}</h4>
        <div class="sc-row"><span>On-Level Factor</span><span class="sc-val">${fmtFactor(sc.factor)}</span></div>
        <div class="sc-row"><span>On-Level Premium</span><span class="sc-val">${fmtCurrency(sc.premium)}</span></div>
        <div class="sc-row"><span>Cumulative Change</span><span class="sc-val ${sc.cumulativeChange >= 0 ? 'val-pos' : 'val-neg'}">${fmtPct(sc.cumulativeChange)}</span></div>
        <div class="sc-row"><span>Adequacy</span><span class="sc-val">${sc.adequacy.label}</span></div>
        <button class="btn btn-sm btn-accent btn-load-scenario" data-idx="${i}">Load</button>`;
            dom.scenarioCards.appendChild(card);
        });
    }

    dom.scenarioCards.addEventListener('click', async (e) => {
        const loadBtn = e.target.closest('.btn-load-scenario');
        if (loadBtn) { loadInputs(scenarios[parseInt(loadBtn.dataset.idx)]); await calculate(); return; }
        const delBtn = e.target.closest('.btn-delete-scenario');
        if (delBtn) { scenarios.splice(parseInt(delBtn.dataset.idx), 1); renderScenarios(); }
    });

    // ── CSV/Excel Upload → Portfolio API ──
    function handleFileUpload(file) {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                let rows;
                if (ext === 'csv') {
                    rows = parseCSV(e.target.result);
                } else {
                    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                    const sheet = wb.Sheets[wb.SheetNames[0]];
                    rows = XLSX.utils.sheet_to_json(sheet);
                }
                if (!rows || rows.length === 0) throw new Error('No data found in file.');
                uploadedPortfolioRows = rows;
                await processPortfolio(rows);
                showUploadStatus(`Successfully processed ${rows.length} policies.`, 'success');
            } catch (err) {
                showUploadStatus('Error: ' + err.message, 'error');
            }
        };

        if (ext === 'csv') reader.readAsText(file);
        else reader.readAsArrayBuffer(file);
    }

    function parseCSV(text) {
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        return lines.slice(1).map(line => {
            const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const obj = {};
            headers.forEach((h, i) => obj[h] = vals[i]);
            return obj;
        });
    }

    function normalizeExcelDate(val) {
        if (!val) return '';
        if (typeof val === 'number' || /^\d{5}$/.test(String(val).trim())) {
            const serial = typeof val === 'number' ? val : parseInt(val);
            const utcDays = Math.floor(serial - 25569);
            const d = new Date(utcDays * 86400000);
            return d.toISOString().slice(0, 10);
        }
        return String(val).trim();
    }

    async function processPortfolio(rows) {
        // Build the rate changes from the current table
        const rateChanges = rateRows
            .filter(r => r.date && r.pct !== '')
            .map(r => ({ date: r.date, pct: parseNum(r.pct) }));

        const policies = rows.map(row => {
            const prem = parseNum(row.HistoricalPremium || row.historicalpremium || row.Premium || row.premium || 0);
            const polDate = normalizeExcelDate(row.PolicyEffectiveDate || row.policyeffectivedate || row.PolicyDate || row.policydate || '');
            const evDate = normalizeExcelDate(row.EvaluationDate || row.evaluationdate || row.EvalDate || row.evaldate || '');
            const term = parseInt(row.PolicyTerm || row.policyterm || row.Term || row.term || 12) || 12;
            return { historicalPremium: prem, policyEffectiveDate: polDate, evaluationDate: evDate, policyTerm: term };
        });

        const customRaw = dom.customWeights.value.trim();
        let customWeights = null;
        if (currentBasis === 'earned' && dom.earningSelect.value === 'custom' && customRaw) {
            customWeights = customRaw.split(',').map(s => parseFloat(s.trim()));
        }

        try {
            const resp = await fetch('/api/portfolio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    basis: currentBasis,
                    earningPattern: dom.earningSelect.value,
                    customWeights,
                    rateChanges,
                    policies,
                }),
            });
            if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || 'Server error'); }
            const data = await resp.json();
            portfolioData = data.results;
            renderPortfolio();
        } catch (e) {
            showUploadStatus('Error: ' + e.message, 'error');
        }
    }

    function renderPortfolio() {
        dom.portfolioSec.classList.remove('hidden');
        dom.portfolioBody.innerHTML = '';
        portfolioData.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td>${p.idx}</td>
        <td>${fmtCurrency(p.historicalPremium)}</td>
        <td>${p.policyEffectiveDate}</td>
        <td>${p.evaluationDate}</td>
        <td>${p.policyTerm}</td>
        <td>${p.onLevelFactor ? fmtFactor(p.onLevelFactor) : 'Error'}</td>
        <td>${p.onLevelPremium ? fmtCurrency(p.onLevelPremium) : 'Error'}</td>
        <td>${p.adequacy}</td>`;
            dom.portfolioBody.appendChild(tr);
        });
    }

    function showUploadStatus(msg, type) {
        dom.uploadStatus.classList.remove('hidden', 'success', 'error');
        dom.uploadStatus.classList.add(type);
        dom.uploadStatus.textContent = msg;
    }

    dom.fileUpload.addEventListener('change', (e) => handleFileUpload(e.target.files[0]));
    dom.uploadDrop.addEventListener('dragover', (e) => { e.preventDefault(); dom.uploadDrop.classList.add('drag-over'); });
    dom.uploadDrop.addEventListener('dragleave', () => dom.uploadDrop.classList.remove('drag-over'));
    dom.uploadDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.uploadDrop.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
    });

    dom.btnDownload.addEventListener('click', () => {
        if (!portfolioData.length) return;
        const headers = ['#', 'HistoricalPremium', 'PolicyEffectiveDate', 'EvaluationDate', 'PolicyTerm', 'OnLevelFactor', 'OnLevelPremium', 'Adequacy'];
        const csvRows = [headers.join(',')];
        portfolioData.forEach(p => {
            csvRows.push([p.idx, p.historicalPremium, p.policyEffectiveDate, p.evaluationDate, p.policyTerm, p.onLevelFactor.toFixed(6), p.onLevelPremium.toFixed(2), `"${p.adequacy}"`].join(','));
        });
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'portfolio_on_level_results.csv';
        a.click();
    });

    // ── Reset ──
    dom.btnReset.addEventListener('click', () => {
        dom.premium.value = '';
        dom.policyDate.value = '';
        dom.evalDate.value = '';
        dom.policyTerm.value = '12';
        currentBasis = 'written';
        dom.basisToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.value === 'written'));
        dom.earningSelect.value = '12-linear';
        dom.customSection.classList.add('hidden');
        dom.customWeights.value = '';
        rateRows = [];
        renderRateTable();
        dom.kpiFactor.textContent = '—';
        dom.kpiPremium.textContent = '—';
        dom.kpiCumulative.textContent = '—'; dom.kpiCumulative.className = 'kpi-value';
        dom.kpiAdequacy.textContent = '—'; dom.kpiAdequacy.className = 'kpi-value';
        dom.historyBody.innerHTML = '';
        dom.historyEmpty.classList.remove('hidden');
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        dom.auditTrail.innerHTML = '<p class="empty-msg">Calculation audit trail will appear here.</p>';
        dom.validationBox.classList.add('hidden');
        uploadedPortfolioRows = null;
        dom.portfolioSec.classList.add('hidden');
        dom.portfolioBody.innerHTML = '';
        dom.uploadStatus.classList.add('hidden');
    });

    // ── Events ──
    dom.btnCalculate.addEventListener('click', calculate);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.target.closest('table') && !e.target.closest('.scenario-controls')) calculate();
    });

    // ── Init: sample rows ──
    addRateRow('2022-07-01', '5');
    addRateRow('2023-01-01', '3');
    addRateRow('2024-01-01', '-2');

})();

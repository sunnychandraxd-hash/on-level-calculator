"""
FastAPI server — serves the frontend static files and exposes the calculation API.
Run with: python main.py
"""
import pathlib
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

import sys
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))

from models import (
    CalculateRequest,
    CalculateResponse,
    PortfolioRequest,
    PortfolioResponse,
    PortfolioResultRow,
    LossTrendRequest,
    LossTrendResponse,
    LossTrendPortfolioRequest,
    LossTrendPortfolioResponse,
)
from engine import calculate, compute_adequacy
from trend import apply_loss_trend

# ── App ──
app = FastAPI(title="Actuarial Platform API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API Routes ──


@app.post("/api/calculate", response_model=CalculateResponse)
def api_calculate(req: CalculateRequest):
    """Run an on-leveling calculation for a single policy."""
    if req.evaluationDate < req.policyEffectiveDate:
        raise HTTPException(400, "Evaluation date must be on or after policy effective date.")

    if req.basis == "earned" and req.earningPattern == "custom":
        if not req.customWeights:
            raise HTTPException(400, "Custom weights are required when earning pattern is 'custom'.")
        if abs(sum(req.customWeights) - 1.0) > 0.01:
            raise HTTPException(400, "Custom weights must sum to 1.0.")

    raw_changes = [{"date": rc.date, "pct": rc.pct} for rc in req.rateChanges]

    result = calculate(
        historical_premium=req.historicalPremium,
        policy_date=req.policyEffectiveDate,
        eval_date=req.evaluationDate,
        policy_term=req.policyTerm,
        basis=req.basis,
        earning_pattern=req.earningPattern,
        custom_weights=req.customWeights,
        raw_rate_changes=raw_changes,
    )
    return result


@app.post("/api/portfolio", response_model=PortfolioResponse)
def api_portfolio(req: PortfolioRequest):
    """Run on-leveling for a batch of policies."""
    if not req.policies:
        raise HTTPException(400, "No policies provided.")

    raw_changes = [{"date": rc.date, "pct": rc.pct} for rc in req.rateChanges]
    results = []

    for i, pol in enumerate(req.policies):
        try:
            res = calculate(
                historical_premium=pol.historicalPremium,
                policy_date=pol.policyEffectiveDate,
                eval_date=pol.evaluationDate,
                policy_term=pol.policyTerm,
                basis=req.basis,
                earning_pattern=req.earningPattern,
                custom_weights=req.customWeights,
                raw_rate_changes=raw_changes,
            )
            adeq = res["adequacy"]
            results.append(PortfolioResultRow(
                idx=i + 1,
                historicalPremium=pol.historicalPremium,
                policyEffectiveDate=pol.policyEffectiveDate.isoformat(),
                evaluationDate=pol.evaluationDate.isoformat(),
                policyTerm=pol.policyTerm,
                onLevelFactor=res["onLevelFactor"],
                onLevelPremium=res["onLevelPremium"],
                adequacy=f"{adeq['label']} ({adeq['value'] * 100:.2f}%)",
            ))
        except Exception:
            results.append(PortfolioResultRow(
                idx=i + 1,
                historicalPremium=pol.historicalPremium,
                policyEffectiveDate=pol.policyEffectiveDate.isoformat(),
                evaluationDate=pol.evaluationDate.isoformat(),
                policyTerm=pol.policyTerm,
                onLevelFactor=0,
                onLevelPremium=0,
                adequacy="Error",
            ))

    return PortfolioResponse(results=results)


@app.post("/api/trend", response_model=LossTrendResponse)
def api_trend(req: LossTrendRequest):
    """Run an actuarially sound loss trend calculation."""
    if req.historicalEndDate < req.historicalStartDate:
        raise HTTPException(400, "Historical end date must be on or after start date.")

    if req.trendMode == "two-step":
        if req.projectedTrendRate is None:
            raise HTTPException(400, "Projected trend rate is required for two-step trending.")
        if req.latestDataPointDate is None:
            raise HTTPException(400, "Latest data point date is required for two-step trending.")

    result = apply_loss_trend(
        base_value=req.baseValue,
        historical_start=req.historicalStartDate,
        historical_end=req.historicalEndDate,
        future_start=req.futureStartDate,
        policy_term_months=req.policyTermMonths,
        current_trend_rate=req.currentTrendRate,
        projected_trend_rate=req.projectedTrendRate,
        latest_data_point=req.latestDataPointDate,
        trend_mode=req.trendMode,
    )
    return result


@app.post("/api/trend/portfolio", response_model=LossTrendPortfolioResponse)
def api_trend_portfolio(req: LossTrendPortfolioRequest):
    """Run actuarially sound loss trend for a batch of policies."""
    if not req.policies:
        raise HTTPException(status_code=400, detail="No policies provided.")
        
    results = []
    success_count = 0
    error_count = 0
    
    for i, pol in enumerate(req.policies):
        try:
            res = apply_loss_trend(
                base_value=pol.base_loss,
                historical_start=pol.historical_start_date,
                historical_end=pol.historical_end_date,
                future_start=pol.future_start_date,
                policy_term_months=pol.policy_term_months,
                current_trend_rate=req.currentTrendRate,
                projected_trend_rate=req.projectedTrendRate,
                latest_data_point=pol.latest_data_point_date or req.latestDataPointDate,
                trend_mode=req.trendMode,
            )
            
            results.append({
                "idx": i + 1,
                "base_loss": pol.base_loss,
                "trend_factor": res["trendFactor"],
                "trended_loss": res["trendedValue"],
                "impact": res["totalTrendImpact"],
                "trend_period_years": res["trendPeriodYears"],
                "historical_avg_date": res["historicalAvgDate"],
                "future_avg_date": res["futureAvgDate"],
                "status": "Success"
            })
            success_count += 1
        except Exception:
            results.append({
                "idx": i + 1,
                "base_loss": pol.base_loss,
                "trend_factor": 1.0,
                "trended_loss": pol.base_loss,
                "impact": 0.0,
                "trend_period_years": 0.0,
                "historical_avg_date": "",
                "future_avg_date": "",
                "status": "Error"
            })
            error_count += 1
            
    audit = [
        {"label": "Batch Processing", "detail": f"Processed {len(req.policies)} rows.", "formula": None},
        {"label": "Results", "detail": f"Success: {success_count}, Errors: {error_count}.", "formula": None}
    ]
    
    return LossTrendPortfolioResponse(results=results, summary_audit=audit)


# ── Serve Frontend ──
FRONTEND_DIR = pathlib.Path(__file__).parent.parent / "frontend"


@app.get("/")
def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")


app.mount("/", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")

# ── Run ──
if __name__ == "__main__":
    import uvicorn
    print("Starting Actuarial Platform server at http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)


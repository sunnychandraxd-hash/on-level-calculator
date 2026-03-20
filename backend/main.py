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
)
from engine import calculate, compute_adequacy

# ── App ──
app = FastAPI(title="On-Level Calculator API", version="1.0.0")

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


# ── Serve Frontend ──
FRONTEND_DIR = pathlib.Path(__file__).parent.parent / "frontend"


@app.get("/")
def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")


app.mount("/", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")

# ── Run ──
if __name__ == "__main__":
    import uvicorn
    print("Starting On-Level Calculator server at http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)

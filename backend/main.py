"""
FastAPI server — serves the frontend static files and exposes the calculation API.
Run with: python main.py
"""
import pathlib
import sys
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from models import (
    LossTrendRequest,
    LossTrendResponse,
    LossTrendPortfolioRequest,
    LossTrendPortfolioResponse,
    AggregatedOnLevelRequest,
    AggregatedOnLevelResponse,
)
from trend import apply_loss_trend
from parallelogram import calculate_aggregated
from excel_textbook import generate_textbook_rater_stream

# ── App ──
app = FastAPI(title="Actuarial Platform API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API Routes ──

@app.post("/api/onlevel/aggregated", response_model=AggregatedOnLevelResponse)
def api_onlevel_aggregated(req: AggregatedOnLevelRequest):
    """Run the parallelogram method for aggregated historical premium (CY/PY)."""
    if not req.premium_by_year:
        raise HTTPException(status_code=400, detail="No historical premium data provided.")
    
    try:
        result = calculate_aggregated(req)
        return AggregatedOnLevelResponse(**result)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@app.post("/api/excel/analytic")
def api_excel_analytic(req: AggregatedOnLevelRequest):
    """Generate the exact analytic Rater Excel file natively."""
    try:
        excel_io = generate_textbook_rater_stream(req)
        return StreamingResponse(
            excel_io,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=Exact_Analytic_Rater.xlsx"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating Excel: {str(e)}")


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

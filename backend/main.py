"""
FastAPI server — serves the frontend static files and exposes the calculation API.
Run with: python main.py
"""
import pathlib
import sys
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from models import OL2CalculateRequest, OL3CalculateRequest
from calculator import ol2_calculate, ol3_calculate

# ── App ──
app = FastAPI(title="Actuarial Platform API", version="5.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API Endpoints ──

@app.post("/api/onlevel2/calculate")
def api_ol2_calculate(request: OL2CalculateRequest):
    rate_changes = [{"date": rc.date, "pct": rc.pct} for rc in request.rate_changes]
    result = ol2_calculate(rate_changes)
    if result is None:
        return JSONResponse(status_code=400, content={"error": "No rate changes provided"})
    return result


@app.post("/api/onlevel3/calculate")
def api_ol3_calculate(request: OL3CalculateRequest):
    rate_changes = [{"date": rc.date, "pct": rc.pct} for rc in request.rate_changes]
    result = ol3_calculate(rate_changes, request.eval_date)
    if result is None:
        return JSONResponse(status_code=400, content={"error": "No rate changes provided"})
    return result


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

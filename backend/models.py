"""
Pydantic models for request/response validation.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date


class RateChange(BaseModel):
    date: date
    pct: float = Field(..., description="Rate change percentage, e.g. 5.0 for +5%")


class CalculateRequest(BaseModel):
    historicalPremium: float = Field(..., gt=0)
    policyEffectiveDate: date
    evaluationDate: date
    policyTerm: int = Field(12, ge=1, le=120)
    basis: str = Field("written", pattern="^(written|earned)$")
    earningPattern: str = Field("12-linear", pattern="^(12-linear|24-linear|custom)$")
    customWeights: Optional[list[float]] = None
    rateChanges: list[RateChange] = []


class AuditStep(BaseModel):
    label: str
    detail: str
    formula: Optional[str] = None


class RateLevelHistoryEntry(BaseModel):
    dateStr: str
    rateChange: float
    rateLevel: float
    cumulativeChange: float


class AdequacyResult(BaseModel):
    label: str
    value: float
    direction: str


class CalculateResponse(BaseModel):
    onLevelFactor: float
    onLevelPremium: float
    cumulativeChange: float
    adequacy: AdequacyResult
    rateLevelHistory: list[RateLevelHistoryEntry]
    auditTrail: list[AuditStep]


class PortfolioRow(BaseModel):
    historicalPremium: float
    policyEffectiveDate: date
    evaluationDate: date
    policyTerm: int = 12


class PortfolioRequest(BaseModel):
    basis: str = "written"
    earningPattern: str = "12-linear"
    customWeights: Optional[list[float]] = None
    rateChanges: list[RateChange] = []
    policies: list[PortfolioRow] = []


class PortfolioResultRow(BaseModel):
    idx: int
    historicalPremium: float
    policyEffectiveDate: str
    evaluationDate: str
    policyTerm: int
    onLevelFactor: float
    onLevelPremium: float
    adequacy: str


class PortfolioResponse(BaseModel):
    results: list[PortfolioResultRow]


# ── Loss Trending ───────────────────────────────────────────────────


class LossTrendRequest(BaseModel):
    baseValue: float = Field(..., gt=0, description="Historical losses or value to trend")
    historicalStartDate: date
    historicalEndDate: date
    futureStartDate: date
    policyTermMonths: int = Field(12, ge=1, le=120)
    currentTrendRate: float = Field(..., description="Current annual trend rate as %, e.g. 3.0")
    trendMode: str = Field("single", pattern="^(single|two-step)$")
    projectedTrendRate: Optional[float] = Field(None, description="Projected rate for two-step, as %")
    latestDataPointDate: Optional[date] = Field(None, description="Split date for two-step trending")


class GrowthPoint(BaseModel):
    date: str
    value: float


class LossTrendResponse(BaseModel):
    trendedValue: float
    trendFactor: float
    trendPeriodYears: float
    historicalAvgDate: str
    futureAvgDate: str
    currentFactor: Optional[float] = None
    projectedFactor: Optional[float] = None
    totalTrendImpact: float
    growthCurve: list[GrowthPoint]
    auditTrail: list[AuditStep]


# ── Workflow (Pipeline) ─────────────────────────────────────────────


class WorkflowTrendConfig(BaseModel):
    currentTrendRate: float = Field(..., description="Current annual trend rate as %, e.g. 3.0")
    trendMode: str = Field("single", pattern="^(single|two-step)$")
    projectedTrendRate: Optional[float] = None
    latestDataPointDate: Optional[date] = None
    futureStartDate: Optional[date] = None
    policyTermMonths: int = Field(12, ge=1, le=120)
    useCustomDates: bool = Field(False, description="If true, use custom historical dates instead of on-level dates")
    customHistoricalStart: Optional[date] = None
    customHistoricalEnd: Optional[date] = None


class WorkflowRequest(BaseModel):
    onLevelInput: CalculateRequest
    trendConfig: WorkflowTrendConfig


class WorkflowResponse(BaseModel):
    onLevelResult: CalculateResponse
    trendResult: LossTrendResponse
    finalValue: float


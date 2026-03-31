"""
Pydantic models for request/response validation.
"""
from pydantic import BaseModel, Field, model_validator
from typing import Optional
from datetime import date


class RateChange(BaseModel):
    date: date
    pct: float = Field(..., description="Rate change percentage, e.g. 5.0 for +5%")

class AuditStep(BaseModel):
    label: str
    detail: str
    formula: Optional[str] = None

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


# ── Loss Trending Portfolio ─────────────────────────────────────────

class LossTrendPortfolioRow(BaseModel):
    base_loss: float
    historical_start_date: date
    historical_end_date: date
    future_start_date: date
    policy_term_months: int = 12
    latest_data_point_date: Optional[date] = None


class LossTrendPortfolioRequest(BaseModel):
    currentTrendRate: float
    trendMode: str = Field("single", pattern="^(single|two-step)$")
    projectedTrendRate: Optional[float] = None
    latestDataPointDate: Optional[date] = None
    policies: list[LossTrendPortfolioRow] = []


class LossTrendPortfolioResultRow(BaseModel):
    idx: int
    base_loss: float
    trend_factor: float
    trended_loss: float
    impact: float
    trend_period_years: float
    historical_avg_date: str
    future_avg_date: str
    status: str


class LossTrendPortfolioResponse(BaseModel):
    results: list[LossTrendPortfolioResultRow]
    summary_audit: list[AuditStep]


# ── Aggregated On-Leveling (Parallelogram) ─────────────────────────────────

class AggregatedYearRow(BaseModel):
    year: int
    premium: float = Field(..., gt=0)
    exposures: Optional[float] = None


class AggregatedOnLevelRequest(BaseModel):
    rate_changes: list[RateChange] = Field(default_factory=list)
    evaluation_date: date
    basis: str = Field("EP", pattern="^(EP|WP)$")
    aggregation: Optional[str] = Field("CY", pattern="^(CY|PY)$")
    policy_term_months: int = 12
    earning_pattern: Optional[str] = "linear"
    custom_weights: Optional[list[float]] = None
    premium_by_year: list[AggregatedYearRow] = Field(default_factory=list)

    @model_validator(mode='after')
    def validate_custom_earning(self) -> 'AggregatedOnLevelRequest':
        if self.earning_pattern == "custom":
            if self.basis != "EP" or self.aggregation != "CY":
                raise ValueError("Custom earning patterns are strictly supported for Earned Premium (EP) Calendar Year (CY) aggregation.")
            if not self.custom_weights or len(self.custom_weights) != 12:
                raise ValueError("Custom earning pattern requires exactly 12 custom weights.")
            if abs(sum(self.custom_weights) - 1.0) > 0.01:
                raise ValueError("Custom weights must sum exactly to 1.0.")
        return self


class AggregatedYearResult(BaseModel):
    year: int
    historical_premium: float
    weighted_avg_rate_level: float
    factor: float
    on_level_premium: float
    audit_detail: str


class AggregatedOnLevelResponse(BaseModel):
    results: list[AggregatedYearResult]
    current_rate_level: float
    audit_trail: str

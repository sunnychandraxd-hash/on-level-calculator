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

"""
Pydantic models for request/response validation.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date


class RateChange(BaseModel):
    date: date
    pct: float = Field(..., description="Rate change percentage, e.g. 5.0 for +5%")


class OL2CalculateRequest(BaseModel):
    rate_changes: list[RateChange]


class OL3CalculateRequest(BaseModel):
    rate_changes: list[RateChange]
    eval_date: Optional[date] = None

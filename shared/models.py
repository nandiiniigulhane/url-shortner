from pydantic import BaseModel, AnyUrl, field_validator
from datetime import datetime
from typing import Optional
import re


class ShortenRequest(BaseModel):
    long_url: AnyUrl
    custom_alias: Optional[str] = None
    expires_in_days: Optional[int] = None
    password: Optional[str] = None

    @field_validator("custom_alias")
    @classmethod
    def validate_alias(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if len(v) < 4 or len(v) > 20:
            raise ValueError("Custom alias must be between 4 and 20 characters")
        if not re.match(r"^[a-zA-Z0-9_-]+$", v):
            raise ValueError("Custom alias can only contain letters, numbers, hyphens, and underscores")
        return v.lower()

    @field_validator("expires_in_days")
    @classmethod
    def validate_expiry(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return v
        if v < 1 or v > 365:
            raise ValueError("Expiration must be between 1 and 365 days")
        return v

    @field_validator("password")
    @classmethod
    def validate_password_field(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if len(v) < 4:
            raise ValueError("Password must be at least 4 characters")
        return v


class ShortenResponse(BaseModel):
    short_url: str
    long_url: str
    alias: str
    expires_at: Optional[datetime] = None
    is_custom: bool
    has_password: bool = False


class PasswordVerifyRequest(BaseModel):
    password: str


class AliasLookupResponse(BaseModel):
    needs_password: bool = False
    alias: str


class RegisterRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$", v):
            raise ValueError("Invalid email format")
        return v.lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str

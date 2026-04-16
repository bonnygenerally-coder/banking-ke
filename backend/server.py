from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Form, Query, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi.responses import StreamingResponse, Response
import os
import re
import html as html_module
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, validator
from typing import List, Optional, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import random
import string
from jose import jwt, JWTError
import io
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from bson import ObjectId
from utils.sms_service import send_otp_sms
from utils.instalipa_service import send_airtime, detect_network, are_credentials_configured
from utils.sms_notifications import (
    send_deposit_notification, send_deposit_pending_notification,
    send_withdrawal_notification, send_withdrawal_pending_notification,
    send_withdrawal_approved_notification, send_withdrawal_rejected_notification,
    send_airtime_notification, send_loan_disbursement_notification,
    send_loan_application_notification, send_loan_approved_notification,
    send_loan_rejected_notification, send_loan_repayment_notification,
    send_savings_deposit_notification, send_savings_withdrawal_notification,
    send_savings_maturity_notification, send_mmf_invest_notification,
    send_mmf_withdrawal_notification, send_wallet_credit_notification,
    send_wallet_debit_notification, send_kyc_approved_notification,
    send_kyc_rejected_notification, send_statement_ready_notification,
    send_statement_sms, send_mini_statement_sms, is_sms_configured
)
import requests
import base64
import asyncio

def normalize_phone(phone: str):
    phone = phone.strip()

    # remove + sign
    phone = phone.replace("+", "")

    # remove spaces
    phone = phone.replace(" ", "")

    # convert 07xxxxxxxx to 2547xxxxxxxx
    if phone.startswith("0"):
        phone = "254" + phone[1:]

    # convert 7xxxxxxxx to 2547xxxxxxxx
    if phone.startswith("7"):
        phone = "254" + phone

    return phone
    
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'dolaglobo-finance-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Security
security = HTTPBearer()

# Create the main app without a prefix
app = FastAPI(title="Dolaglobo Finance API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ================== SECURITY MIDDLEWARE ==================

def sanitize_string(value: str) -> str:
    """Sanitize string input to prevent XSS attacks."""
    sanitized = html_module.escape(value, quote=True)
    sanitized = re.sub(r'javascript:', '', sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r'on\w+\s*=', '', sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r'data:\s*text/html', '', sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r'vbscript:', '', sanitized, flags=re.IGNORECASE)
    return sanitized.strip()


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add comprehensive security headers to all responses to fix:
    - HTTPS page internal links to HTTP (HSTS + upgrade-insecure-requests)
    - Defence against XSS (CSP + X-XSS-Protection + X-Content-Type-Options)
    - HTTP URLs at site-level (HSTS preload)
    - Form posting to HTTP (CSP form-action directive)
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # HSTS: Force HTTPS for 1 year, include subdomains, preload
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )

        # CSP: Restrict resource loading, upgrade HTTP to HTTPS, restrict form actions
        csp = [
            "default-src 'self' https:",
            "script-src 'self' https: 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' https: 'unsafe-inline'",
            "img-src 'self' https: data: blob:",
            "font-src 'self' https: data:",
            "connect-src 'self' https:",
            "frame-ancestors 'self'",
            "base-uri 'self'",
            "form-action 'self' https:",
            "upgrade-insecure-requests",
        ]
        response.headers["Content-Security-Policy"] = "; ".join(csp)

        # Prevent MIME-type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # XSS filter for legacy browsers
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Clickjacking protection
        response.headers["X-Frame-Options"] = "DENY"

        # Control referrer leakage
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Restrict browser APIs
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )

        # No caching on API responses
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"

        return response


class HTTPSRedirectMiddleware(BaseHTTPMiddleware):
    """Redirect HTTP to HTTPS (via X-Forwarded-Proto from reverse proxy)."""

    async def dispatch(self, request: Request, call_next):
        forwarded_proto = request.headers.get("x-forwarded-proto", "https")
        if forwarded_proto == "http":
            https_url = str(request.url).replace("http://", "https://", 1)
            return Response(status_code=301, headers={"Location": https_url})
        return await call_next(request)


# ================== SECURITY STATUS ENDPOINT ==================

@api_router.get("/security/status")
async def security_status():
    """Report current security headers and protections."""
    return {
        "security_headers": {
            "strict_transport_security": True,
            "content_security_policy": True,
            "x_content_type_options": True,
            "x_xss_protection": True,
            "x_frame_options": True,
            "referrer_policy": True,
            "permissions_policy": True,
        },
        "xss_protection": {
            "input_sanitization": True,
            "csp_enabled": True,
            "upgrade_insecure_requests": True,
        },
        "https_enforcement": {
            "hsts_enabled": True,
            "http_redirect": True,
            "form_action_https_only": True,
        },
        "cors_configured": True,
    }

# ================== UTILITY FUNCTIONS ==================

def generate_otp(length: int = 6) -> str:
    """Generate a random numeric OTP"""
    return ''.join(random.choices('0123456789', k=length))

def hash_pin(pin: str) -> str:
    """Hash a PIN using bcrypt"""
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()

def verify_pin(pin: str, hashed: str) -> bool:
    """Verify a PIN against its hash"""
    return bcrypt.checkpw(pin.encode(), hashed.encode())

def create_token(data: dict) -> str:
    """Create a JWT token"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def normalize_phone(phone: str) -> str:
    """Normalize Kenyan phone number to +254 format"""
    phone = phone.strip().replace(" ", "")
    if phone.startswith('0'):
        phone = '+254' + phone[1:]
    elif phone.startswith('254'):
        phone = '+' + phone
    elif not phone.startswith('+254'):
        phone = '+254' + phone
    return phone

def serialize_doc(doc: dict) -> dict:
    """Convert MongoDB document to JSON-serializable dict"""
    if doc is None:
        return None
    result = {}
    for key, value in doc.items():
        if key == '_id':
            # Only use _id as id if there's no existing id field
            if 'id' not in doc:
                result['id'] = str(value)
        elif isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        else:
            result[key] = value
    return result

async def calculate_transaction_fee(transaction_type: str, amount: float) -> dict:
    """Calculate fee for a transaction based on active fee rules"""
    # Find all active fee rules for this transaction type
    rules = await db.fee_rules.find({
        "$or": [
            {"transaction_type": transaction_type},
            {"transaction_type": "all"}
        ],
        "is_active": True
    }).to_list(100)
    
    if not rules:
        return {"total_fee": 0, "fee_breakdown": [], "net_amount": amount}
    
    total_fee = 0
    fee_breakdown = []
    
    for rule in rules:
        # Check transaction amount limits
        min_txn = rule.get("min_transaction_amount")
        max_txn = rule.get("max_transaction_amount")
        
        if min_txn and amount < min_txn:
            continue
        if max_txn and amount > max_txn:
            continue
        
        fee = 0
        fee_type = rule.get("fee_type")
        
        if fee_type == "percentage":
            rate = rule.get("percentage_rate", 0)
            fee = amount * (rate / 100)
        
        elif fee_type == "flat":
            fee = rule.get("flat_amount", 0)
        
        elif fee_type == "tiered":
            tiers = rule.get("tiers", [])
            for tier in sorted(tiers, key=lambda x: x.get("min", 0)):
                tier_min = tier.get("min", 0)
                tier_max = tier.get("max", float('inf'))
                if tier_min <= amount <= tier_max:
                    # Tier can have percentage or flat fee
                    if "percentage" in tier:
                        fee = amount * (tier["percentage"] / 100)
                    else:
                        fee = tier.get("fee", 0)
                    break
        
        # Apply min/max fee caps
        min_fee = rule.get("min_fee")
        max_fee = rule.get("max_fee")
        
        if min_fee and fee < min_fee:
            fee = min_fee
        if max_fee and fee > max_fee:
            fee = max_fee
        
        if fee > 0:
            fee = round(fee, 2)
            total_fee += fee
            fee_breakdown.append({
                "rule_id": rule.get("id"),
                "rule_name": rule.get("name"),
                "fee_type": fee_type,
                "fee_amount": fee,
                "description": rule.get("description", "")
            })
    
    return {
        "total_fee": round(total_fee, 2),
        "fee_breakdown": fee_breakdown,
        "net_amount": round(amount - total_fee, 2),
        "gross_amount": amount
    }

# ================== PYDANTIC MODELS ==================

class UserRegister(BaseModel):
    phone: str
    pin: str
    name: str
    terms_version_accepted: Optional[str] = None
    privacy_version_accepted: Optional[str] = None
    
    @validator('phone')
    def validate_phone(cls, v):
        v = normalize_phone(v)
        if len(v) != 13:
            raise ValueError('Invalid phone number format')
        return v
    
    @validator('pin')
    def validate_pin(cls, v):
        if len(v) != 4 or not v.isdigit():
            raise ValueError('PIN must be 4 digits')
        return v

class UserLogin(BaseModel):
    phone: str
    pin: str

class OTPVerify(BaseModel):
    phone: str
    otp: str

class PINReset(BaseModel):
    phone: str
    otp: str
    new_pin: str

class KYCSubmit(BaseModel):
    id_type: str  # national_id, passport, driving_license
    id_number: str
    business_name: Optional[str] = None
    business_type: Optional[str] = None

class LockSavingsCreate(BaseModel):
    amount: float
    term_months: int  # 3, 6, 9, or 12
    
    @validator('term_months')
    def validate_term(cls, v):
        if v not in [3, 6, 9, 12]:
            raise ValueError('Term must be 3, 6, 9, or 12 months')
        return v
    
    @validator('amount')
    def validate_amount(cls, v):
        if v < 1000:
            raise ValueError('Minimum amount is KES 1,000')
        return v

class MMFInvest(BaseModel):
    amount: float
    
    @validator('amount')
    def validate_amount(cls, v):
        if v < 100:
            raise ValueError('Minimum investment is KES 100')
        return v

class LoanApply(BaseModel):
    loan_type: str  # short_term, long_term
    amount: float
    term_months: int
    purpose: str
    
    @validator('loan_type')
    def validate_type(cls, v):
        if v not in ['short_term', 'long_term']:
            raise ValueError('Invalid loan type')
        return v

class LoanLimitUpdate(BaseModel):
    loan_limit: float
    
    @validator('loan_limit')
    def validate_loan_limit(cls, v):
        if v < 0:
            raise ValueError('Loan limit cannot be negative')
        return v

class LoanRepaymentRequest(BaseModel):
    amount: float
    repayment_method: str  # wallet, mpesa
    mpesa_ref: Optional[str] = None
    sender_phone: Optional[str] = None
    
    @validator('repayment_method')
    def validate_method(cls, v):
        if v not in ['wallet', 'mpesa']:
            raise ValueError('Invalid repayment method. Must be "wallet" or "mpesa"')
        return v
    
    @validator('amount')
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError('Amount must be greater than 0')
        return v

class OverpaymentAction(BaseModel):
    action: str  # credit_wallet, hold_advance, refund
    notes: Optional[str] = None
    
    @validator('action')
    def validate_action(cls, v):
        if v not in ['credit_wallet', 'hold_advance', 'refund']:
            raise ValueError('Invalid action')
        return v

class LoanBalanceAdjustment(BaseModel):
    adjustment_amount: float
    adjustment_type: str  # increase, decrease
    reason: str
    
    @validator('adjustment_type')
    def validate_type(cls, v):
        if v not in ['increase', 'decrease']:
            raise ValueError('Invalid adjustment type')
        return v

class AdminLogin(BaseModel):
    email: str
    password: str

class AdminCreate(BaseModel):
    email: str
    password: str
    name: str

class InterestRateUpdate(BaseModel):
    rate_type: str  # lock_savings_3, lock_savings_6, lock_savings_9, lock_savings_12, mmf, loan_short, loan_long
    rate: float

class WalletTransfer(BaseModel):
    amount: float
    
    @validator('amount')
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError('Amount must be positive')
        return v

# ================== NEW MODELS FOR MPESA & WALLET EXTENSIONS ==================

class MPESADepositRequest(BaseModel):
    amount: float
    mpesa_ref: str
    sender_phone: str
    
    @validator('amount')
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError('Amount must be positive')
        return v

class WithdrawalRequest(BaseModel):
    amount: float
    withdrawal_type: str  # mpesa, bank
    destination_phone: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_account_name: Optional[str] = None
    pin: str  # Required 4-digit PIN for security
    
    @validator('withdrawal_type')
    def validate_type(cls, v):
        if v not in ['mpesa', 'bank']:
            raise ValueError('Invalid withdrawal type')
        return v
    
    @validator('pin')
    def validate_pin(cls, v):
        if len(v) != 4 or not v.isdigit():
            raise ValueError('PIN must be 4 digits')
        return v

class AdminWalletAdjustment(BaseModel):
    user_id: str
    amount: float
    adjustment_type: str  # credit, debit
    reason: str
    
    @validator('adjustment_type')
    def validate_type(cls, v):
        if v not in ['credit', 'debit']:
            raise ValueError('Invalid adjustment type')
        return v

class AdminWalletHold(BaseModel):
    user_id: str
    amount: float
    hold_type: str  # transaction_fee, service_fee, penalty, other
    reason: str
    
    @validator('hold_type')
    def validate_hold_type(cls, v):
        valid_types = ['transaction_fee', 'service_fee', 'penalty', 'withdrawal_fee', 'loan_fee', 'other']
        if v not in valid_types:
            raise ValueError(f'Invalid hold type. Must be one of: {valid_types}')
        return v

class AdminMMFHold(BaseModel):
    user_id: str
    amount: float
    hold_type: str  # withdrawal_fee, penalty, regulatory, other
    reason: str
    
    @validator('hold_type')
    def validate_hold_type(cls, v):
        valid_types = ['withdrawal_fee', 'penalty', 'regulatory', 'investigation', 'other']
        if v not in valid_types:
            raise ValueError(f'Invalid hold type. Must be one of: {valid_types}')
        return v

class AdminLockSavingsHold(BaseModel):
    savings_id: str
    amount: float
    hold_type: str  # early_withdrawal, penalty, regulatory, other
    reason: str
    
    @validator('hold_type')
    def validate_hold_type(cls, v):
        valid_types = ['early_withdrawal', 'penalty', 'regulatory', 'investigation', 'other']
        if v not in valid_types:
            raise ValueError(f'Invalid hold type. Must be one of: {valid_types}')
        return v

class AdminReleaseHold(BaseModel):
    user_id: str
    hold_id: str
    action: str  # release (return to available), deduct (remove from balance)
    
    @validator('action')
    def validate_action(cls, v):
        if v not in ['release', 'deduct']:
            raise ValueError('Invalid action. Must be "release" or "deduct"')
        return v

class AdminReleaseMMFHold(BaseModel):
    user_id: str
    hold_id: str
    action: str  # release, deduct
    
    @validator('action')
    def validate_action(cls, v):
        if v not in ['release', 'deduct']:
            raise ValueError('Invalid action. Must be "release" or "deduct"')
        return v

class AdminReleaseSavingsHold(BaseModel):
    savings_id: str
    hold_id: str
    action: str  # release, deduct
    
    @validator('action')
    def validate_action(cls, v):
        if v not in ['release', 'deduct']:
            raise ValueError('Invalid action. Must be "release" or "deduct"')
        return v

# ================== FEE RULES MODELS ==================

class FeeRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    transaction_type: str  # withdrawal, deposit, transfer, loan_disbursement, savings_withdrawal
    fee_type: str  # percentage, flat, tiered
    percentage_rate: Optional[float] = None  # For percentage type (e.g., 1.5 for 1.5%)
    flat_amount: Optional[float] = None  # For flat type
    tiers: Optional[list] = None  # For tiered type: [{"min": 0, "max": 1000, "fee": 50}, ...]
    min_fee: Optional[float] = None  # Minimum fee amount
    max_fee: Optional[float] = None  # Maximum fee amount (cap)
    min_transaction_amount: Optional[float] = None  # Only apply if transaction >= this
    max_transaction_amount: Optional[float] = None  # Only apply if transaction <= this
    is_active: bool = True
    
    @validator('transaction_type')
    def validate_transaction_type(cls, v):
        valid_types = ['withdrawal', 'deposit', 'transfer', 'loan_disbursement', 'savings_withdrawal', 'mmf_withdrawal', 'all']
        if v not in valid_types:
            raise ValueError(f'Invalid transaction type. Must be one of: {valid_types}')
        return v
    
    @validator('fee_type')
    def validate_fee_type(cls, v):
        if v not in ['percentage', 'flat', 'tiered']:
            raise ValueError('Fee type must be "percentage", "flat", or "tiered"')
        return v

class FeeRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    transaction_type: Optional[str] = None
    fee_type: Optional[str] = None
    percentage_rate: Optional[float] = None
    flat_amount: Optional[float] = None
    tiers: Optional[list] = None
    min_fee: Optional[float] = None
    max_fee: Optional[float] = None
    min_transaction_amount: Optional[float] = None
    max_transaction_amount: Optional[float] = None
    is_active: Optional[bool] = None

class StatementRequest(BaseModel):
    start_date: str
    end_date: str
    delivery_method: str  # sms, email
    email: Optional[str] = None
    
    @validator('delivery_method')
    def validate_delivery_method(cls, v):
        if v not in ['sms', 'email']:
            raise ValueError('Delivery method must be "sms" or "email"')
        return v
    
    @validator('email', always=True)
    def validate_email_required(cls, v, values):
        if values.get('delivery_method') == 'email' and not v:
            raise ValueError('Email address is required when delivery method is email')
        return v

class EnhancedKYCSubmit(BaseModel):
    id_type: str  # national_id, passport, driving_license
    id_number: str
    id_front_url: Optional[str] = None
    id_back_url: Optional[str] = None
    business_name: Optional[str] = None
    business_type: Optional[str] = None
    business_reg_url: Optional[str] = None

class PaybillConfig(BaseModel):
    paybill_number: str

# ================== SYSTEM CONFIGURATION MODELS ==================

class SystemSettingsUpdate(BaseModel):
    deposit_mode: Optional[str] = None  # manual, stk_push
    withdrawal_mode: Optional[str] = None  # manual, automatic
    mpesa_paybill: Optional[str] = None
    kyc_email: Optional[str] = None  # Email for receiving KYC documents
    otp_verification_enabled: Optional[bool] = None  # Enable/disable OTP verification during registration
    lock_savings_early_withdrawal_penalty: Optional[float] = None  # Early withdrawal penalty percentage
    
    @validator('deposit_mode')
    def validate_deposit_mode(cls, v):
        if v and v not in ['manual', 'stk_push']:
            raise ValueError('Invalid deposit mode. Must be "manual" or "stk_push"')
        return v
    
    @validator('withdrawal_mode')
    def validate_withdrawal_mode(cls, v):
        if v and v not in ['manual', 'automatic']:
            raise ValueError('Invalid withdrawal mode. Must be "manual" or "automatic"')
        return v
    
    @validator('kyc_email')
    def validate_kyc_email(cls, v):
        if v and '@' not in v:
            raise ValueError('Invalid email format')
        return v
    
    @validator('lock_savings_early_withdrawal_penalty')
    def validate_penalty(cls, v):
        if v is not None and (v < 0 or v > 100):
            raise ValueError('Penalty must be between 0 and 100 percent')
        return v

class STKPushRequest(BaseModel):
    amount: float
    phone_number: str  # Phone number that will pay (can be different from user's phone)
    beneficiary_phone: Optional[str] = None  # Optional: Account to credit (defaults to current user)
    pin: str  # Required PIN for authorization
    
    @validator('amount')
    def validate_amount(cls, v):
        if v < 10:
            raise ValueError('Minimum amount is KES 10')
        return v
    
    @validator('pin')
    def validate_pin(cls, v):
        if len(v) != 4 or not v.isdigit():
            raise ValueError('PIN must be 4 digits')
        return v

class AdminRoleUpdate(BaseModel):
    role: str  # admin, super_admin
    
    @validator('role')
    def validate_role(cls, v):
        if v not in ['admin', 'super_admin']:
            raise ValueError('Invalid role. Must be "admin" or "super_admin"')
        return v

# ================== CONTENT MANAGEMENT MODELS ==================

class FAQCreate(BaseModel):
    question: str
    answer: str
    order: Optional[int] = 0
    status: Optional[str] = "active"  # active, inactive
    
    @validator('status')
    def validate_status(cls, v):
        if v not in ['active', 'inactive']:
            raise ValueError('Status must be "active" or "inactive"')
        return v

class FAQUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    order: Optional[int] = None
    status: Optional[str] = None
    
    @validator('status')
    def validate_status(cls, v):
        if v and v not in ['active', 'inactive']:
            raise ValueError('Status must be "active" or "inactive"')
        return v

class TermsCreate(BaseModel):
    version: str
    content: str
    
class PrivacyCreate(BaseModel):
    version: str
    content: str

class UserRegistrationWithConsent(BaseModel):
    name: str
    phone: str
    pin: str
    terms_version_accepted: Optional[str] = None
    privacy_version_accepted: Optional[str] = None

# ================== AIRTIME MODELS ==================

class AirtimePurchaseRequest(BaseModel):
    phone_number: str
    amount: int
    network: Optional[str] = None  # safaricom, airtel - auto-detected if not provided
    
    @validator('amount')
    def validate_amount(cls, v):
        if v < 10:
            raise ValueError('Minimum airtime amount is KES 10')
        if v > 10000:
            raise ValueError('Maximum airtime amount is KES 10,000')
        return v
    
    @validator('network')
    def validate_network(cls, v):
        if v and v not in ['safaricom', 'airtel']:
            raise ValueError('Network must be "safaricom" or "airtel"')
        return v

# ================== DEPENDENCY INJECTION ==================

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Decode JWT and get current user"""
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        user_type = payload.get("type", "user")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"user_id": user_id, "type": user_type}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_admin_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify admin token"""
    user = await get_current_user(credentials)
    if user.get("type") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    # Fetch admin details to get role
    admin = await db.admin_users.find_one({"id": user["user_id"]})
    if admin:
        user["role"] = admin.get("role", "admin")
    else:
        user["role"] = "admin"
    return user

async def get_super_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify super admin token - required for system settings"""
    user = await get_admin_user(credentials)
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required for this action")
    return user

# ================== HELPER FUNCTIONS FOR SYSTEM CONFIG ==================

async def get_system_settings():
    """Get current system settings with defaults"""
    settings = await db.system_config.find_one({"key": "system_settings"})
    if not settings:
        # Return defaults
        return {
            "deposit_mode": "manual",
            "withdrawal_mode": "manual",
            "mpesa_paybill": "4114517",
            "kyc_email": "kyc@dolaglobo.com",
            "otp_verification_enabled": True,  # OTP enabled by default
            "lock_savings_early_withdrawal_penalty": 0.5  # Default 0.5% penalty
        }
    return {
        "deposit_mode": settings.get("deposit_mode", "manual"),
        "withdrawal_mode": settings.get("withdrawal_mode", "manual"),
        "mpesa_paybill": settings.get("mpesa_paybill", "4114517"),
        "kyc_email": settings.get("kyc_email", "kyc@dolaglobo.com"),
        "otp_verification_enabled": settings.get("otp_verification_enabled", True),
        "lock_savings_early_withdrawal_penalty": settings.get("lock_savings_early_withdrawal_penalty", 0.5)
    }

async def log_config_change(admin_id: str, setting_name: str, old_value: str, new_value: str):
    """Log configuration changes for audit"""
    await db.config_change_logs.insert_one({
        "id": str(uuid.uuid4()),
        "admin_id": admin_id,
        "setting_name": setting_name,
        "old_value": old_value,
        "new_value": new_value,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

async def log_content_change(admin_id: str, content_type: str, content_id: str, action: str, old_content: dict = None, new_content: dict = None):
    """Log content management changes for audit"""
    await db.content_audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "admin_id": admin_id,
        "content_type": content_type,  # faq, terms, privacy
        "content_id": content_id,
        "action": action,  # create, update, delete, activate, deactivate
        "old_content": old_content,
        "new_content": new_content,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

# ================== AUTH ROUTES ==================

@api_router.post("/auth/register")
async def register(data: UserRegister):
    phone = normalize_phone(data.phone)

    existing = await db.users.find_one({"phone": phone})
    if existing:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    # Check if OTP verification is enabled
    system_settings = await get_system_settings()
    otp_enabled = system_settings.get("otp_verification_enabled", True)

    user_doc = {
        "id": str(uuid.uuid4()),
        "phone": phone,
        "name": data.name,
        "pin_hash": hash_pin(data.pin),
        "kyc_status": "pending",
        "phone_verified": not otp_enabled,  # Auto-verify if OTP is disabled
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.users.insert_one(user_doc)

    await db.wallets.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_doc["id"],
        "balance": 0.0,
        "withheld_amount": 0.0,
        "holds": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    if otp_enabled:
        otp = generate_otp()

        await db.otps.insert_one({
            "phone": phone,
            "otp": otp,
            "type": "verification",
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            "verified": False,
            "attempts": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        send_otp_sms(phone, otp)

        return {
            "success": True,
            "message": "Registration successful. OTP sent to your phone.",
            "user_id": user_doc["id"],
            "requires_otp": True
        }
    else:
        # OTP disabled - auto-login the user
        user = await db.users.find_one({"phone": phone}, {"_id": 0})
        token = create_token({"user_id": user["id"], "type": "user"})
        return {
            "success": True,
            "message": "Registration successful. You are now logged in.",
            "user_id": user_doc["id"],
            "requires_otp": False,
            "token": token,
            "user": {k: v for k, v in user.items() if k != "pin_hash"}
        }


@api_router.post("/auth/verify-otp")
async def verify_otp(data: OTPVerify):
    phone = normalize_phone(data.phone)

    otp_doc = await db.otps.find_one({
        "phone": phone,
        "verified": False,
        "type": "verification"
    })

    if not otp_doc:
        raise HTTPException(status_code=400, detail="No pending OTP found")

    if otp_doc["otp"] != data.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    await db.otps.update_one(
        {"_id": otp_doc["_id"]},
        {"$set": {"verified": True}}
    )

    await db.users.update_one(
        {"phone": phone},
        {"$set": {"phone_verified": True}}
    )

    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    token = create_token({"user_id": user["id"], "type": "user"})

    return {"success": True, "token": token, "user": user}


@api_router.post("/auth/login")
async def login(data: UserLogin):
    phone = normalize_phone(data.phone)

    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user or not verify_pin(data.pin, user["pin_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Check if OTP verification is enabled in system settings
    system_settings = await get_system_settings()
    otp_enabled = system_settings.get("otp_verification_enabled", True)

    if not user.get("phone_verified"):
        if otp_enabled:
            # OTP is enabled - send OTP for verification
            otp = generate_otp()

            await db.otps.insert_one({
                "phone": phone,
                "otp": otp,
                "type": "verification",
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
                "verified": False,
                "attempts": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

            send_otp_sms(phone, otp)
            return {"requires_verification": True, "message": "OTP sent to your phone for verification"}
        else:
            # OTP is disabled - auto-verify and login
            await db.users.update_one({"phone": phone}, {"$set": {"phone_verified": True}})
            user["phone_verified"] = True

    token = create_token({"user_id": user["id"], "type": "user"})
    return {"success": True, "token": token, "user": user}


@api_router.post("/auth/request-otp")
async def request_otp(phone: str):
    phone = normalize_phone(phone)

    otp = generate_otp()

    await db.otps.insert_one({
        "phone": phone,
        "otp": otp,
        "type": "pin_reset",
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "verified": False,
        "attempts": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    send_otp_sms(phone, otp)
    return {"success": True}


@api_router.post("/auth/reset-pin")
async def reset_pin(data: PINReset):
    phone = normalize_phone(data.phone)

    otp_doc = await db.otps.find_one({
        "phone": phone,
        "type": "pin_reset",
        "verified": False
    })

    if not otp_doc or otp_doc["otp"] != data.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    await db.users.update_one(
        {"phone": phone},
        {"$set": {"pin_hash": hash_pin(data.new_pin)}}
    )

    await db.otps.update_one(
        {"_id": otp_doc["_id"]},
        {"$set": {"verified": True}}
    )

    return {"success": True, "message": "PIN reset successful"}


# ================== USER PROFILE ROUTES ==================

@api_router.get("/user/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get current user profile"""
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0, "pin_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return serialize_doc(user)

@api_router.get("/user/dashboard")
async def get_dashboard(current_user: dict = Depends(get_current_user)):
    """Get user dashboard data"""
    user_id = current_user["user_id"]
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "pin_hash": 0})
    wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    
    # Calculate wallet balances (same logic as /wallet endpoint)
    actual_balance = wallet.get("balance", 0) if wallet else 0
    withheld_amount = wallet.get("withheld_amount", 0) if wallet else 0
    available_balance = max(0, actual_balance - withheld_amount)
    
    # Get lock savings
    savings = await db.lock_savings.find({"user_id": user_id, "status": "active"}, {"_id": 0}).to_list(100)
    total_savings = sum(s.get("current_value", s.get("amount", 0)) for s in savings)
    
    # Get MMF
    mmf = await db.mmf_accounts.find_one({"user_id": user_id}, {"_id": 0})
    mmf_balance = mmf.get("balance", 0) if mmf else 0
    
    # Get active loans
    active_loans = await db.loans.find({"user_id": user_id, "status": {"$in": ["approved", "disbursed"]}}, {"_id": 0}).to_list(100)
    total_loan_balance = sum(loan_item.get("outstanding_balance", loan_item.get("amount", 0)) for loan_item in active_loans)
    
    # Get recent transactions
    transactions = await db.transactions.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(5)
    
    # Get unread notifications count
    unread_count = await db.notifications.count_documents({"user_id": user_id, "read": False})
    
    # Enhance wallet data with calculated balances
    wallet_data = serialize_doc(wallet) if wallet else {"balance": 0}
    wallet_data["actual_balance"] = actual_balance
    wallet_data["available_balance"] = available_balance
    wallet_data["withheld_amount"] = withheld_amount
    
    return {
        "user": serialize_doc(user),
        "wallet": wallet_data,
        "summary": {
            "wallet_balance": actual_balance,
            "available_balance": available_balance,
            "held_balance": withheld_amount,
            "total_savings": total_savings,
            "mmf_balance": mmf_balance,
            "total_loan_balance": total_loan_balance,
            "unread_notifications": unread_count
        },
        "recent_transactions": [serialize_doc(t) for t in transactions]
    }

# ================== KYC ROUTES ==================

@api_router.post("/kyc/submit")
async def submit_kyc(data: EnhancedKYCSubmit, current_user: dict = Depends(get_current_user)):
    """Submit KYC documents with optional file uploads"""
    user_id = current_user["user_id"]
    
    # Check if KYC already submitted
    existing = await db.kyc_documents.find_one({"user_id": user_id})
    if existing and existing.get("status") in ["submitted", "approved"]:
        raise HTTPException(status_code=400, detail="KYC already submitted")
    
    kyc_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "id_type": data.id_type,
        "id_number": data.id_number,
        "id_front_url": data.id_front_url,
        "id_back_url": data.id_back_url,
        "business_name": data.business_name,
        "business_type": data.business_type,
        "business_reg_url": data.business_reg_url,
        "status": "submitted",
        "admin_notes": None,
        "reviewed_by": None,
        "reviewed_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    if existing:
        await db.kyc_documents.update_one({"_id": existing["_id"]}, {"$set": kyc_doc})
    else:
        await db.kyc_documents.insert_one(kyc_doc)
    
    # Update user KYC status
    await db.users.update_one({"id": user_id}, {"$set": {"kyc_status": "submitted"}})
    
    # Create notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "kyc",
        "title": "KYC Submitted",
        "message": "Your KYC documents have been submitted for review. We'll notify you once approved.",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    
    return {"success": True, "message": "KYC submitted successfully", "kyc": serialize_doc(kyc_doc)}

@api_router.get("/kyc/status")
async def get_kyc_status(current_user: dict = Depends(get_current_user)):
    """Get KYC status"""
    kyc = await db.kyc_documents.find_one({"user_id": current_user["user_id"]}, {"_id": 0})
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    return {
        "kyc_status": user.get("kyc_status", "pending"),
        "kyc_details": serialize_doc(kyc) if kyc else None
    }

@api_router.post("/kyc/upload-document")
async def upload_kyc_document(
    file: UploadFile = File(...),
    document_type: str = Form(...),  # id_front, id_back, business_reg, selfie
    current_user: dict = Depends(get_current_user)
):
    """Upload KYC document file directly"""
    user_id = current_user["user_id"]
    
    # Validate document type
    valid_types = ["id_front", "id_back", "business_reg", "selfie"]
    if document_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid document type. Must be one of: {', '.join(valid_types)}")
    
    # Validate file type
    allowed_extensions = [".jpg", ".jpeg", ".png", ".pdf"]
    file_ext = Path(file.filename).suffix.lower() if file.filename else ""
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}")
    
    # Validate file size (max 5MB)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 5MB limit")
    
    # Create unique filename
    unique_filename = f"{user_id}_{document_type}_{uuid.uuid4().hex[:8]}{file_ext}"
    upload_path = Path(__file__).parent / "uploads" / "kyc" / unique_filename
    
    # Ensure directory exists
    upload_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Save file
    with open(upload_path, "wb") as f:
        f.write(content)
    
    # Store document reference in database
    doc_record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "document_type": document_type,
        "filename": unique_filename,
        "original_filename": file.filename,
        "file_path": str(upload_path),
        "file_size": len(content),
        "content_type": file.content_type,
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Update or insert document record
    await db.kyc_uploads.update_one(
        {"user_id": user_id, "document_type": document_type},
        {"$set": doc_record},
        upsert=True
    )
    
    # Return the file URL (relative path for serving)
    file_url = f"/api/kyc/documents/{unique_filename}"
    
    return {
        "success": True,
        "message": f"Document '{document_type}' uploaded successfully",
        "document": {
            "type": document_type,
            "filename": unique_filename,
            "url": file_url,
            "size": len(content)
        }
    }

@api_router.get("/kyc/documents/{filename}")
async def get_kyc_document(filename: str, current_user: dict = Depends(get_current_user)):
    """Serve KYC document file"""
    user_id = current_user["user_id"]
    
    # Verify the file belongs to this user or admin
    doc = await db.kyc_uploads.find_one({"filename": filename})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Users can only access their own documents
    if doc["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    file_path = Path(__file__).parent / "uploads" / "kyc" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine content type
    content_type = doc.get("content_type", "application/octet-stream")
    
    return StreamingResponse(
        open(file_path, "rb"),
        media_type=content_type,
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )

@api_router.get("/kyc/my-uploads")
async def get_my_kyc_uploads(current_user: dict = Depends(get_current_user)):
    """Get all uploaded KYC documents for current user"""
    user_id = current_user["user_id"]
    uploads = await db.kyc_uploads.find({"user_id": user_id}, {"_id": 0}).to_list(10)
    
    # Add URL to each upload
    for upload in uploads:
        upload["url"] = f"/api/kyc/documents/{upload['filename']}"
    
    return {"uploads": [serialize_doc(u) for u in uploads]}

@api_router.get("/kyc/email-info")
async def get_kyc_email_info():
    """Get KYC email address for document submission - Public endpoint"""
    settings = await get_system_settings()
    return {
        "kyc_email": settings["kyc_email"],
        "instructions": "You can email your KYC documents (ID front, ID back, selfie with ID) to this address. Include your registered phone number in the email subject."
    }

@api_router.post("/kyc/confirm-email-submission")
async def confirm_kyc_email_submission(current_user: dict = Depends(get_current_user)):
    """User confirms they have sent KYC documents via email"""
    user_id = current_user["user_id"]
    now = datetime.now(timezone.utc)
    
    # Check if user already has KYC submitted
    user = await db.users.find_one({"id": user_id})
    if user.get("kyc_status") == "approved":
        raise HTTPException(status_code=400, detail="KYC already approved")
    
    # Update or create KYC document record
    kyc_doc = await db.kyc_documents.find_one({"user_id": user_id})
    
    if kyc_doc:
        # Update existing KYC record
        await db.kyc_documents.update_one(
            {"user_id": user_id},
            {"$set": {
                "email_submission_confirmed": True,
                "email_submission_confirmed_at": now.isoformat(),
                "status": "email_submitted",
                "updated_at": now.isoformat()
            }}
        )
    else:
        # Create new KYC record for email submission
        kyc_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "submission_type": "email",
            "email_submission_confirmed": True,
            "email_submission_confirmed_at": now.isoformat(),
            "status": "email_submitted",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.kyc_documents.insert_one(kyc_doc)
    
    # Update user's KYC status
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"kyc_status": "email_submitted"}}
    )
    
    # Create notification for user
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "kyc_email_confirmed",
        "title": "KYC Email Submission Confirmed",
        "message": "You have confirmed sending your KYC documents via email. Our team will review them shortly.",
        "read": False,
        "created_at": now.isoformat()
    })
    
    # Create admin notification (for all admins)
    admin_notification = {
        "id": str(uuid.uuid4()),
        "type": "admin_kyc_email_submission",
        "user_id": user_id,
        "user_name": user.get("name"),
        "user_phone": user.get("phone"),
        "title": "New KYC Email Submission",
        "message": f"User {user.get('name')} ({user.get('phone')}) has confirmed sending KYC documents via email.",
        "read": False,
        "created_at": now.isoformat()
    }
    await db.admin_notifications.insert_one(admin_notification)
    
    return {
        "success": True,
        "message": "Email submission confirmed. Our team will review your documents shortly.",
        "kyc_status": "email_submitted"
    }

@api_router.get("/kyc/email-submission-status")
async def get_kyc_email_submission_status(current_user: dict = Depends(get_current_user)):
    """Check if user has confirmed email KYC submission"""
    user_id = current_user["user_id"]
    kyc_doc = await db.kyc_documents.find_one({"user_id": user_id}, {"_id": 0})
    
    if kyc_doc and kyc_doc.get("email_submission_confirmed"):
        return {
            "email_submitted": True,
            "confirmed_at": kyc_doc.get("email_submission_confirmed_at"),
            "status": kyc_doc.get("status")
        }
    return {"email_submitted": False}

# ================== PUBLIC CONTENT ROUTES ==================

@api_router.get("/content/faqs")
async def get_public_faqs():
    """Get all active FAQs - Public endpoint, no auth required"""
    faqs = await db.faqs.find({"status": "active"}, {"_id": 0}).sort("order", 1).to_list(100)
    return {"faqs": [serialize_doc(f) for f in faqs]}

@api_router.get("/content/terms")
async def get_public_terms():
    """Get current active Terms & Conditions - Public endpoint, no auth required"""
    terms = await db.terms_conditions.find_one({"is_active": True}, {"_id": 0})
    if not terms:
        return {"terms": None, "message": "No terms and conditions available"}
    return {"terms": serialize_doc(terms)}

@api_router.get("/content/privacy")
async def get_public_privacy():
    """Get current active Privacy Policy - Public endpoint, no auth required"""
    privacy = await db.privacy_policies.find_one({"is_active": True}, {"_id": 0})
    if not privacy:
        return {"privacy": None, "message": "No privacy policy available"}
    return {"privacy": serialize_doc(privacy)}

@api_router.get("/content/legal")
async def get_legal_documents():
    """Get both Terms and Privacy for registration - Public endpoint"""
    terms = await db.terms_conditions.find_one({"is_active": True}, {"_id": 0})
    privacy = await db.privacy_policies.find_one({"is_active": True}, {"_id": 0})
    return {
        "terms": serialize_doc(terms) if terms else None,
        "privacy": serialize_doc(privacy) if privacy else None
    }

# ================== WALLET ROUTES ==================

@api_router.get("/wallet")
async def get_wallet(current_user: dict = Depends(get_current_user)):
    """Get wallet balance with actual and available amounts"""
    wallet = await db.wallets.find_one({"user_id": current_user["user_id"]}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    
    # Calculate balances
    actual_balance = wallet.get("balance", 0)
    withheld_amount = wallet.get("withheld_amount", 0)
    available_balance = max(0, actual_balance - withheld_amount)
    
    wallet_data = serialize_doc(wallet)
    wallet_data["actual_balance"] = actual_balance
    wallet_data["available_balance"] = available_balance
    wallet_data["withheld_amount"] = withheld_amount
    
    return wallet_data

# NOTE: Direct wallet deposit endpoint removed for security
# All deposits must go through proper approval channels:
# - Manual Mode: POST /mpesa/deposit → Admin approval
# - STK Push Mode: POST /mpesa/stk-push → MPESA confirmation

# ================== MPESA DEPOSIT ROUTES ==================

@api_router.get("/mpesa/paybill")
async def get_paybill_config(current_user: dict = Depends(get_current_user)):
    """Get MPESA Paybill configuration"""
    config = await db.system_config.find_one({"key": "mpesa_paybill"}, {"_id": 0})
    paybill = config.get("value", "4114517") if config else "4114517"
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    return {
        "paybill_number": paybill,
        "account_number": user.get("phone", ""),
        "instructions": f"Send money to Paybill {paybill}, Account: {user.get('phone', '')}"
    }

@api_router.post("/mpesa/deposit")
async def request_mpesa_deposit(data: MPESADepositRequest, current_user: dict = Depends(get_current_user)):
    """Submit MPESA deposit request for admin approval"""
    user_id = current_user["user_id"]
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    
    now = datetime.now(timezone.utc)
    
    # Check for duplicate MPESA reference
    existing = await db.mpesa_deposits.find_one({"mpesa_ref": data.mpesa_ref})
    if existing:
        raise HTTPException(status_code=400, detail="This MPESA reference has already been submitted")
    
    deposit_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_phone": user.get("phone"),
        "user_name": user.get("name"),
        "amount": data.amount,
        "mpesa_ref": data.mpesa_ref,
        "sender_phone": normalize_phone(data.sender_phone),
        "status": "pending",  # pending, approved, rejected
        "admin_notes": None,
        "reviewed_by": None,
        "reviewed_at": None,
        "created_at": now.isoformat(),
    }
    
    await db.mpesa_deposits.insert_one(deposit_doc)
    
    # Create notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "deposit",
        "title": "MPESA Deposit Submitted",
        "message": f"Your MPESA deposit of KES {data.amount:,.2f} (Ref: {data.mpesa_ref}) is pending approval.",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {"success": True, "message": "Deposit request submitted for approval", "deposit": serialize_doc(deposit_doc)}

@api_router.get("/mpesa/deposits")
async def get_my_mpesa_deposits(current_user: dict = Depends(get_current_user)):
    """Get user's MPESA deposit history"""
    deposits = await db.mpesa_deposits.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return [serialize_doc(d) for d in deposits]

class STKPushRequest(BaseModel):
    phone_number: str
    amount: float
    pin: str
    beneficiary_phone: Optional[str] = None

@api_router.post("/mpesa/stk-push")
async def stk_push(
    data: STKPushRequest,
    current_user: dict = Depends(get_current_user)
):
    """Initiate MPESA STK Push deposit with PIN verification."""
    user_id = current_user["user_id"]
    
    user_full = await db.users.find_one({"id": user_id})
    if not user_full:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not user_full.get("pin_hash"):
        raise HTTPException(status_code=400, detail="PIN not set. Please set your PIN first.")
    
    if not verify_pin(data.pin, user_full["pin_hash"]):
        raise HTTPException(status_code=401, detail="Invalid PIN. Please try again.")

    payer_phone = normalize_phone(data.phone_number).replace("+", "")
    
    if data.beneficiary_phone:
        beneficiary_phone = normalize_phone(data.beneficiary_phone)
        beneficiary_user = await db.users.find_one({"phone": beneficiary_phone})
        if not beneficiary_user:
            raise HTTPException(status_code=404, detail=f"Beneficiary account {data.beneficiary_phone} not found")
        beneficiary_user_id = beneficiary_user["id"]
        beneficiary_name = beneficiary_user.get("name", "Unknown")
        is_third_party = True
    else:
        beneficiary_phone = user_full.get("phone")
        beneficiary_user_id = user_id
        beneficiary_name = user_full.get("name", "Unknown")
        is_third_party = payer_phone != beneficiary_phone.replace("+", "")

    amount = int(data.amount)
    if amount < 10:
        raise HTTPException(status_code=400, detail="Minimum deposit is KES 10")

    shortcode = os.getenv("DARAJA_SHORTCODE")
    passkey = os.getenv("DARAJA_PASSKEY")
    callback = os.getenv("DARAJA_CALLBACK_URL")
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    password = base64.b64encode(f"{shortcode}{passkey}{timestamp}".encode()).decode()
    consumer_key = os.getenv("DARAJA_CONSUMER_KEY")
    consumer_secret = os.getenv("DARAJA_CONSUMER_SECRET")
    
    if not all([shortcode, passkey, callback, consumer_key, consumer_secret]):
        stk_reference = f"STK{uuid.uuid4().hex[:12].upper()}"
        stk_request_doc = {
            "id": str(uuid.uuid4()),
            "reference": stk_reference,
            "initiator_user_id": user_id,
            "beneficiary_user_id": beneficiary_user_id,
            "beneficiary_phone": beneficiary_phone,
            "beneficiary_name": beneficiary_name,
            "payer_phone": payer_phone,
            "amount": amount,
            "is_third_party": is_third_party,
            "pin_verified": True,
            "status": "pending",
            "checkout_request_id": f"SIM{uuid.uuid4().hex[:16].upper()}",
            "mpesa_receipt": None,
            "simulated": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.stk_push_requests.insert_one(stk_request_doc)
        return {
            "ResponseCode": "0",
            "ResponseDescription": "SIMULATED - M-Pesa not configured",
            "CustomerMessage": "STK Push simulated",
            "CheckoutRequestID": stk_request_doc["checkout_request_id"],
            "reference": stk_reference,
            "beneficiary": beneficiary_name if is_third_party else "Self",
            "beneficiary_phone": beneficiary_phone,
            "is_third_party": is_third_party,
            "pin_verified": True,
            "simulated": True
        }

    auth_url = "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    try:
        auth_response = requests.get(auth_url, auth=(consumer_key, consumer_secret), timeout=30)
        auth_response.raise_for_status()
        access_token = auth_response.json().get("access_token")
    except Exception as e:
        print(f"M-Pesa auth error: {e}")
        raise HTTPException(status_code=503, detail="M-Pesa service temporarily unavailable")

    headers = {"Authorization": f"Bearer {access_token}"}
    stk_reference = f"STK{uuid.uuid4().hex[:12].upper()}"
    
    stk_request_doc = {
        "id": str(uuid.uuid4()),
        "reference": stk_reference,
        "initiator_user_id": user_id,
        "beneficiary_user_id": beneficiary_user_id,
        "beneficiary_phone": beneficiary_phone,
        "beneficiary_name": beneficiary_name,
        "payer_phone": payer_phone,
        "amount": amount,
        "is_third_party": is_third_party,
        "pin_verified": True,
        "status": "pending",
        "checkout_request_id": None,
        "mpesa_receipt": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.stk_push_requests.insert_one(stk_request_doc)

    payload = {
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": amount,
        "PartyA": payer_phone,
        "PartyB": shortcode,
        "PhoneNumber": payer_phone,
        "CallBackURL": callback,
        "AccountReference": stk_reference,
        "TransactionDesc": f"Deposit to {beneficiary_name}" if is_third_party else "Wallet Deposit"
    }

    response = requests.post("https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest", json=payload, headers=headers)
    mpesa_response = response.json()
    
    if mpesa_response.get("CheckoutRequestID"):
        await db.stk_push_requests.update_one(
            {"reference": stk_reference},
            {"$set": {"checkout_request_id": mpesa_response.get("CheckoutRequestID")}}
        )

    return {
        **mpesa_response,
        "reference": stk_reference,
        "beneficiary": beneficiary_name if is_third_party else "Self",
        "beneficiary_phone": beneficiary_phone,
        "is_third_party": is_third_party,
        "pin_verified": True
    }

@api_router.post("/mpesa/callback")
async def mpesa_callback(request: Request):
    body = await request.json()
    print("FULL CALLBACK BODY:", body)

    try:
        callback = body.get("Body", {}).get("stkCallback", {})
        result_code = callback.get("ResultCode")
        result_desc = callback.get("ResultDesc")
        checkout_request_id = callback.get("CheckoutRequestID")

        print("RESULT CODE:", result_code)
        print("CHECKOUT ID:", checkout_request_id)

        # ❌ Failed transaction
        if result_code != 0:
            if checkout_request_id:
                await db.stk_push_requests.update_one(
                    {"checkout_request_id": checkout_request_id},
                    {"$set": {"status": "failed", "error": result_desc}}
                )
            return {"status": "failed", "message": result_desc}

        # ✅ Extract metadata safely
        items = callback.get("CallbackMetadata", {}).get("Item", [])
        metadata = {item["Name"]: item.get("Value") for item in items}

        print("METADATA:", metadata)

        amount = float(metadata.get("Amount", 0))
        payer_phone = normalize_phone(str(metadata.get("PhoneNumber", "")))
        mpesa_receipt = metadata.get("MpesaReceiptNumber")

        if not mpesa_receipt:
            print("ERROR: Missing MpesaReceiptNumber")
            return {"status": "error", "message": "Invalid callback"}

        # جلوگیری duplicates
        existing = await db.transactions.find_one({"mpesa_ref": mpesa_receipt})
        if existing:
            print("DUPLICATE CALLBACK")
            return {"status": "duplicate"}

        # 🔍 Find STK request
        stk_request = await db.stk_push_requests.find_one({
            "checkout_request_id": checkout_request_id
        })

        if not stk_request:
            print("ERROR: STK request not found")
            return {"status": "error", "message": "STK request not found"}

        beneficiary_user_id = stk_request["beneficiary_user_id"]
        is_third_party = stk_request.get("is_third_party", False)
        initiator_user_id = stk_request.get("initiator_user_id")

        # 🔍 Get wallet
        wallet = await db.wallets.find_one({"user_id": beneficiary_user_id})
        if not wallet:
            print("ERROR: Wallet not found")
            return {"status": "error", "message": "Wallet not found"}

        # ✅ CREDIT WALLET
        print("CREDITING WALLET:", beneficiary_user_id, amount)

        await db.wallets.update_one(
            {"user_id": beneficiary_user_id},
            {"$inc": {"balance": amount}}
        )

        updated_wallet = await db.wallets.find_one({"user_id": beneficiary_user_id})
        print("UPDATED BALANCE:", updated_wallet.get("balance"))

        # ✅ SAVE TRANSACTION
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": beneficiary_user_id,
            "type": "deposit",
            "amount": amount,
            "mpesa_ref": mpesa_receipt,
            "payer_phone": payer_phone,
            "is_third_party": is_third_party,
            "initiator_user_id": initiator_user_id,
            "description": "M-Pesa deposit",
            "balance_after": updated_wallet["balance"],
            "status": "completed",
            "created_at": datetime.now(timezone.utc).isoformat()
        })

        print("TRANSACTION SAVED")

        # ✅ UPDATE STK STATUS
        await db.stk_push_requests.update_one(
            {"checkout_request_id": checkout_request_id},
            {"$set": {
                "status": "completed",
                "mpesa_receipt": mpesa_receipt,
                "completed_at": datetime.now(timezone.utc).isoformat()
            }}
        )

        # ✅ SEND NOTIFICATION (SAFE)
        try:
            beneficiary_user = await db.users.find_one({"id": beneficiary_user_id})
            if beneficiary_user and beneficiary_user.get("phone"):
                send_deposit_notification(
                    phone=beneficiary_user["phone"],
                    amount=amount,
                    balance=updated_wallet["balance"],
                    ref=mpesa_receipt
                )
                print("SMS SENT")
        except Exception as sms_error:
            print("SMS ERROR:", sms_error)

        return {"status": "success"}

    except Exception as e:
        print("MPESA CALLBACK ERROR:", str(e))
        return {"status": "error"}

    
        
# ================== WITHDRAWAL ROUTES (UPDATED) ==================

@api_router.post("/withdrawals/request")
async def request_withdrawal(data: WithdrawalRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]

    user = await db.users.find_one({"id": user_id})
    wallet = await db.wallets.find_one({"user_id": user_id})

    if not user or not wallet:
        raise HTTPException(status_code=404, detail="User or wallet not found")

    # PIN verification
    if not user.get("pin_hash") or not verify_pin(data.pin, user["pin_hash"]):
        raise HTTPException(status_code=401, detail="Invalid PIN")

    amount = int(data.amount)

    # Balance check
    actual_balance = wallet.get("balance", 0)
    withheld_amount = wallet.get("withheld_amount") or 0
    available_balance = max(0, actual_balance - withheld_amount)

    if available_balance < amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    # Normalize phone
    phone = normalize_phone(data.destination_phone).replace("+", "")

    now = datetime.now(timezone.utc)

    # Calculate withdrawal fee in real-time
    fee_info = await calculate_transaction_fee("withdrawal", amount)
    fee_amount = fee_info["total_fee"]
    net_amount = fee_info["net_amount"]
    
    # Check if user can afford the withdrawal + fee
    total_deduction = amount  # We deduct the full amount, user receives net_amount
    if available_balance < total_deduction:
        raise HTTPException(
            status_code=400, 
            detail=f"Insufficient balance. Withdrawal amount: KES {amount:,.2f}, Fee: KES {fee_amount:,.2f}"
        )

    # ================= ADMIN APPROVAL CASE =================
    if amount > 10000:
        print("⏳ ADMIN APPROVAL REQUIRED")

        withdrawal_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "amount": amount,
            "fee_amount": fee_amount,
            "net_amount": net_amount,
            "fee_breakdown": fee_info["fee_breakdown"],
            "destination_phone": phone,
            "status": "pending",
            "requires_approval": True,
            "created_at": now.isoformat(),
        }

        await db.withdrawals.insert_one(withdrawal_doc)
        
        # Remove MongoDB _id from response
        withdrawal_doc.pop("_id", None)

        # Send SMS notification for pending withdrawal (requires admin approval)
        send_withdrawal_pending_notification(
            phone=user.get("phone"),
            amount=amount
        )

        return {
            "success": True,
            "message": f"Withdrawal pending admin approval. Fee: KES {fee_amount:,.2f}, You will receive: KES {net_amount:,.2f}",
            "withdrawal": withdrawal_doc,
            "fee_info": fee_info
        }

    # ================= INSTANT B2C =================
    print("\n🔥 INITIATING B2C PAYMENT")
    print("Phone:", phone)
    print("Amount:", amount)
    print("Fee:", fee_amount)
    print("Net Amount (user receives):", net_amount)

    shortcode = os.getenv("DARAJA_SHORTCODE")
    initiator = os.getenv("DARAJA_INITIATOR_NAME")
    security_credential = os.getenv("DARAJA_SECURITY_CREDENTIAL")
    result_url = os.getenv("DARAJA_B2C_RESULT_URL")
    timeout_url = os.getenv("DARAJA_B2C_TIMEOUT_URL")

    consumer_key = os.getenv("DARAJA_CONSUMER_KEY")
    consumer_secret = os.getenv("DARAJA_CONSUMER_SECRET")

    # Get access token
    auth = requests.get(
        "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
        auth=(consumer_key, consumer_secret)
    )

    access_token = auth.json().get("access_token")
    print("TOKEN:", access_token)

    headers = {"Authorization": f"Bearer {access_token}"}

    reference = str(uuid.uuid4())

    # B2C sends the net amount (after fee deduction) to user
    payload = {
        "InitiatorName": initiator,
        "SecurityCredential": security_credential,
        "CommandID": "BusinessPayment",
        "Amount": int(net_amount),  # User receives net amount after fee
        "PartyA": shortcode,
        "PartyB": phone,
        "Remarks": "Wallet Withdrawal",
        "QueueTimeOutURL": timeout_url,
        "ResultURL": result_url,
        "Occasion": reference
    }

    print("B2C PAYLOAD:", payload)

    try:
        response = requests.post(
            "https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest",
            json=payload,
            headers=headers
        )

        mpesa_response = response.json()
        print("MPESA RESPONSE:", mpesa_response)

        # Deduct full amount from wallet (includes fee)
        await db.wallets.update_one(
            {"user_id": user_id},
            {"$inc": {"balance": -amount}}
        )

        print("💸 Wallet deducted (full amount including fee)")

        # Save withdrawal record with fee details
        withdrawal_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "amount": amount,
            "fee_amount": fee_amount,
            "net_amount": net_amount,
            "fee_breakdown": fee_info["fee_breakdown"],
            "destination_phone": phone,
            "status": "processing",
            "mpesa_conversation_id": mpesa_response.get("ConversationID"),
            "mpesa_originator_conversation_id": mpesa_response.get("OriginatorConversationID"),
            "reference": reference,
            "created_at": now.isoformat(),
        }

        await db.withdrawals.insert_one(withdrawal_doc)

        # Save to transactions with fee details
        updated_wallet = await db.wallets.find_one({"user_id": user_id})
        
        # Main withdrawal transaction
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "withdrawal",
            "amount": amount,
            "fee_amount": fee_amount,
            "net_amount": net_amount,
            "phone": phone,
            "description": f"M-Pesa Withdrawal (Fee: KES {fee_amount:,.2f})",
            "status": "completed",
            "reference": reference,
            "balance_after": updated_wallet.get("balance", 0),
            "applied_fee_rules": [f.get("rule_id") for f in fee_info["fee_breakdown"]],
            "created_at": now.isoformat()
        })
        
        # Record fee as separate transaction for revenue tracking
        if fee_amount > 0:
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "type": "withdrawal_fee",
                "amount": fee_amount,
                "description": "Withdrawal Fee",
                "reference": reference,
                "balance_after": updated_wallet.get("balance", 0),
                "created_at": now.isoformat()
            })
            
            # Also record in fee_collections for revenue tracking
            await db.fee_collections.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "transaction_type": "withdrawal",
                "transaction_id": withdrawal_doc["id"],
                "amount": fee_amount,
                "fee_breakdown": fee_info["fee_breakdown"],
                "created_at": now.isoformat()
            })

        print("✅ TRANSACTION SAVED WITH FEE")

        # Send SMS notification for B2C instant withdrawal (show net amount user receives)
        send_withdrawal_notification(
            phone=user.get("phone"),
            amount=net_amount,  # Show what user actually receives
            balance=updated_wallet.get("balance", 0),
            destination=phone
        )

        return {
            "success": True,
            "message": f"Withdrawal successful. Fee: KES {fee_amount:,.2f}, Sent: KES {net_amount:,.2f}",
            "mpesa": mpesa_response,
            "fee_info": fee_info
        }

    except Exception as e:
        print("❌ B2C ERROR:", str(e))
        raise HTTPException(status_code=500, detail="B2C request failed")


# ================== USER WITHDRAWALS ==================

@api_router.get("/withdrawals")
async def get_my_withdrawals(current_user: dict = Depends(get_current_user)):
    withdrawals = await db.withdrawals.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)

    return withdrawals


# ================== ADMIN VIEW (OPTIONAL) ==================

@api_router.get("/admin/withdrawals")
async def get_all_withdrawals():
    withdrawals = await db.withdrawals.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return withdrawals




# ================== STATEMENT REQUEST ROUTES ==================

@api_router.post("/statements/request")
async def request_statement(data: StatementRequest, current_user: dict = Depends(get_current_user)):
    """Request account statement generation"""
    user_id = current_user["user_id"]
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    now = datetime.now(timezone.utc)
    
    statement_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_name": user.get("name"),
        "user_phone": user.get("phone"),
        "start_date": data.start_date,
        "end_date": data.end_date,
        "delivery_method": data.delivery_method,
        "delivery_email": data.email if data.delivery_method == "email" else None,
        "delivery_phone": user.get("phone") if data.delivery_method == "sms" else None,
        "status": "pending",  # pending, approved, generated, rejected
        "pdf_url": None,
        "admin_notes": None,
        "reviewed_by": None,
        "reviewed_at": None,
        "created_at": now.isoformat(),
    }
    
    await db.statement_requests.insert_one(statement_doc)
    
    # Create notification
    delivery_info = f"via {'Email to ' + data.email if data.delivery_method == 'email' else 'SMS to ' + user.get('phone', '')}"
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "statement",
        "title": "Statement Request Submitted",
        "message": f"Your statement request for {data.start_date} to {data.end_date} ({delivery_info}) is pending approval.",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {"success": True, "message": "Statement request submitted", "statement": serialize_doc(statement_doc)}

@api_router.get("/statements")
async def get_my_statements(current_user: dict = Depends(get_current_user)):
    """Get user's statement request history"""
    statements = await db.statement_requests.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return [serialize_doc(s) for s in statements]

@api_router.get("/statements/{statement_id}/download")
async def download_statement(statement_id: str, current_user: dict = Depends(get_current_user)):
    """Download approved statement PDF"""
    statement = await db.statement_requests.find_one({
        "id": statement_id,
        "user_id": current_user["user_id"]
    })
    
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    if statement["status"] != "generated":
        raise HTTPException(status_code=400, detail="Statement not yet generated")
    
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0})
    wallet = await db.wallets.find_one({"user_id": current_user["user_id"]}, {"_id": 0})
    
    # Helper function to mask phone numbers (e.g., 0721677360 -> 0721***360)
    def mask_phone(phone):
        if not phone or len(phone) < 7:
            return phone or "N/A"
        return phone[:4] + "***" + phone[-3:]
    
    # Build query for transactions
    query = {"user_id": current_user["user_id"]}
    if statement["start_date"]:
        query["created_at"] = {"$gte": statement["start_date"]}
    if statement["end_date"]:
        if "created_at" in query:
            query["created_at"]["$lte"] = statement["end_date"]
        else:
            query["created_at"] = {"$lte": statement["end_date"]}
    
    transactions = await db.transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Calculate opening and closing balances
    closing_balance = wallet.get("balance", 0) if wallet else 0
    total_credits = sum(t.get("amount", 0) for t in transactions if t.get("type") in ["deposit", "mpesa_deposit", "loan_disbursement", "mmf_withdrawal", "savings_withdrawal", "admin_credit", "credit"])
    total_debits = sum(t.get("amount", 0) for t in transactions if t.get("type") in ["withdrawal", "loan_repayment", "savings_deposit", "mmf_invest", "admin_debit", "debit"])
    total_fees = sum(t.get("fee", 0) for t in transactions)
    opening_balance = closing_balance - total_credits + total_debits
    
    # Generate PDF
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    
    # Logo path
    logo_path = "/app/backend/assets/logo_pdf.png"
    
    # Header with logo
    if os.path.exists(logo_path):
        try:
            p.drawImage(logo_path, 50, height - 70, width=120, height=36, preserveAspectRatio=True, mask='auto')
        except Exception as e:
            # Fallback to text if logo fails
            p.setFont("Helvetica-Bold", 20)
            p.drawString(50, height - 50, "Dolaglobo Finance")
    else:
        p.setFont("Helvetica-Bold", 20)
        p.drawString(50, height - 50, "Dolaglobo Finance")
    
    # Statement title on the right
    p.setFont("Helvetica-Bold", 14)
    p.drawRightString(width - 50, height - 45, "OFFICIAL ACCOUNT STATEMENT")
    p.setFont("Helvetica", 9)
    p.drawRightString(width - 50, height - 58, "Digital Finance Solutions | Kenya")
    
    # Line
    p.line(50, height - 80, width - 50, height - 80)
    
    # User info - with masked phone
    p.setFont("Helvetica", 10)
    p.drawString(50, height - 100, f"Account Holder: {user.get('name', 'N/A')}")
    p.drawString(50, height - 115, f"Account Phone: {mask_phone(user.get('phone', ''))}")
    p.drawString(300, height - 100, f"Statement Period: {statement['start_date']} to {statement['end_date']}")
    p.drawString(300, height - 115, f"Date Generated: {datetime.now().strftime('%d %B %Y, %H:%M')}")
    p.drawString(50, height - 130, f"Statement ID: {statement_id[:8].upper()}")
    
    # Summary Box
    p.setStrokeColor(colors.grey)
    p.setFillColor(colors.Color(0.95, 0.95, 0.95))
    p.rect(50, height - 200, width - 100, 55, fill=True, stroke=True)
    p.setFillColor(colors.black)
    
    p.setFont("Helvetica-Bold", 10)
    p.drawString(60, height - 160, "ACCOUNT SUMMARY")
    p.setFont("Helvetica", 9)
    p.drawString(60, height - 175, f"Opening Balance: KES {opening_balance:,.2f}")
    p.drawString(200, height - 175, f"Total Credits: KES {total_credits:,.2f}")
    p.drawString(350, height - 175, f"Total Debits: KES {total_debits:,.2f}")
    p.drawString(60, height - 190, f"Total Fees: KES {total_fees:,.2f}")
    p.drawString(200, height - 190, f"No. of Transactions: {len(transactions)}")
    p.setFont("Helvetica-Bold", 9)
    p.drawString(350, height - 190, f"Closing Balance: KES {closing_balance:,.2f}")
    
    # Transactions table header
    y = height - 230
    p.setFillColor(colors.Color(0.2, 0.3, 0.2))
    p.rect(50, y - 5, width - 100, 20, fill=True, stroke=False)
    p.setFillColor(colors.white)
    p.setFont("Helvetica-Bold", 8)
    p.drawString(55, y + 2, "DATE")
    p.drawString(110, y + 2, "REF NO.")
    p.drawString(175, y + 2, "TYPE")
    p.drawString(240, y + 2, "DESCRIPTION")
    p.drawString(380, y + 2, "FEE")
    p.drawString(430, y + 2, "AMOUNT")
    p.drawString(510, y + 2, "BALANCE")
    
    # Reset fill color
    p.setFillColor(colors.black)
    
    # Transactions
    p.setFont("Helvetica", 7)
    y -= 25
    row_count = 0
    
    for txn in transactions:
        if y < 100:
            # Add page footer before new page
            p.setFont("Helvetica", 7)
            p.drawString(50, 50, f"Page {p.getPageNumber()} | Statement ID: {statement_id[:8].upper()}")
            p.drawRightString(width - 50, 50, "Continued on next page...")
            p.showPage()
            y = height - 50
            # Re-add header on new page
            p.setFont("Helvetica-Bold", 10)
            p.drawString(50, y, "Dolaglobo Finance - Account Statement (Continued)")
            y -= 30
            # Re-add column headers
            p.setFillColor(colors.Color(0.2, 0.3, 0.2))
            p.rect(50, y - 5, width - 100, 20, fill=True, stroke=False)
            p.setFillColor(colors.white)
            p.setFont("Helvetica-Bold", 8)
            p.drawString(55, y + 2, "DATE")
            p.drawString(110, y + 2, "REF NO.")
            p.drawString(175, y + 2, "TYPE")
            p.drawString(240, y + 2, "DESCRIPTION")
            p.drawString(380, y + 2, "FEE")
            p.drawString(430, y + 2, "AMOUNT")
            p.drawString(510, y + 2, "BALANCE")
            p.setFillColor(colors.black)
            y -= 25
        
        # Alternate row colors
        if row_count % 2 == 0:
            p.setFillColor(colors.Color(0.97, 0.97, 0.97))
            p.rect(50, y - 3, width - 100, 14, fill=True, stroke=False)
            p.setFillColor(colors.black)
        
        p.setFont("Helvetica", 7)
        
        # Date and time
        date_str = txn.get("created_at", "")[:16].replace("T", " ") if txn.get("created_at") else ""
        p.drawString(55, y, date_str[:10])
        
        # Reference number (transaction ID)
        ref_no = txn.get("id", "")[:8].upper() if txn.get("id") else ""
        p.drawString(110, y, ref_no)
        
        # Transaction type
        txn_type = txn.get("type", "").replace("_", " ").title()[:12]
        p.drawString(175, y, txn_type)
        
        # Description with masked phone numbers
        description = txn.get("description", "")
        # Mask any phone numbers in description (10 digit Kenyan format)
        import re
        phone_pattern = r'(\d{4})(\d{3})(\d{3})'
        description = re.sub(phone_pattern, r'\1***\3', description)
        # Also handle +254 format
        phone_pattern_intl = r'(\+254)(\d{3})(\d{3})(\d{3})'
        description = re.sub(phone_pattern_intl, r'\1***\4', description)
        p.drawString(240, y, description[:28])
        
        # Fee
        fee = txn.get("fee", 0)
        if fee > 0:
            p.drawString(380, y, f"KES {fee:,.2f}")
        else:
            p.drawString(380, y, "-")
        
        # Amount (with +/- indicator)
        amount = txn.get("amount", 0)
        txn_type_raw = txn.get("type", "")
        if txn_type_raw in ["deposit", "mpesa_deposit", "loan_disbursement", "mmf_withdrawal", "savings_withdrawal", "admin_credit", "credit"]:
            p.setFillColor(colors.Color(0, 0.5, 0))
            amount_str = f"+{amount:,.2f}"
        else:
            p.setFillColor(colors.Color(0.7, 0, 0))
            amount_str = f"-{amount:,.2f}"
        p.drawString(430, y, amount_str)
        p.setFillColor(colors.black)
        
        # Balance after
        balance_after = txn.get("balance_after", 0)
        p.drawString(510, y, f"{balance_after:,.2f}")
        
        y -= 14
        row_count += 1
    
    # End of Statement Section
    y -= 30
    if y < 150:
        p.showPage()
        y = height - 100
    
    # End of Statement line
    p.line(50, y, width - 50, y)
    y -= 25
    
    # End of Statement header
    p.setFont("Helvetica-Bold", 12)
    p.drawCentredString(width / 2, y, "***End Of Statement***")
    y -= 30
    
    # Disclaimer text
    p.setFont("Helvetica", 9)
    disclaimer_text = (
        "This statement will be considered correct unless advice to the contrary has been received. "
        "All queries must be advised to the Branch Manager personally or through a private and "
        "confidential cover within 14 days of dispatch."
    )
    
    # Word wrap the disclaimer
    from reportlab.lib.utils import simpleSplit
    lines = simpleSplit(disclaimer_text, "Helvetica", 9, width - 100)
    for line in lines:
        p.drawCentredString(width / 2, y, line)
        y -= 14
    
    y -= 20
    
    # Additional footer info
    p.setFont("Helvetica", 7)
    p.drawCentredString(width / 2, y, "Dolaglobo Finance | Digital Banking Solutions | www.dolaglobo.co.ke")
    y -= 12
    p.drawCentredString(width / 2, y, "Customer Support: support@dolaglobo.co.ke | This is a computer-generated statement.")
    
    # Page number at bottom
    p.drawString(50, 30, f"Page {p.getPageNumber()}")
    p.drawRightString(width - 50, 30, f"Statement ID: {statement_id[:8].upper()}")
    
    p.save()
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=statement_{statement_id}.pdf"}
    )

@api_router.get("/transactions")
async def get_transactions(
    current_user: dict = Depends(get_current_user),
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0)
):
    """Get transaction history"""
    transactions = await db.transactions.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    total = await db.transactions.count_documents({"user_id": current_user["user_id"]})
    
    return {
        "transactions": [serialize_doc(t) for t in transactions],
        "total": total,
        "limit": limit,
        "skip": skip
    }

@api_router.get("/transactions/statement")
async def get_statement_pdf(
    current_user: dict = Depends(get_current_user),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Generate PDF statement"""
    import re
    from reportlab.lib.utils import simpleSplit
    
    user_id = current_user["user_id"]
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    
    # Helper function to mask phone numbers
    def mask_phone(phone):
        if not phone or len(phone) < 7:
            return phone or "N/A"
        return phone[:4] + "***" + phone[-3:]
    
    # Build query
    query = {"user_id": user_id}
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = end_date
        else:
            query["created_at"] = {"$lte": end_date}
    
    transactions = await db.transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Calculate totals
    closing_balance = wallet.get("balance", 0) if wallet else 0
    total_credits = sum(t.get("amount", 0) for t in transactions if t.get("type") in ["deposit", "mpesa_deposit", "loan_disbursement", "mmf_withdrawal", "savings_withdrawal", "admin_credit", "credit"])
    total_debits = sum(t.get("amount", 0) for t in transactions if t.get("type") in ["withdrawal", "loan_repayment", "savings_deposit", "mmf_invest", "admin_debit", "debit"])
    total_fees = sum(t.get("fee", 0) for t in transactions)
    opening_balance = closing_balance - total_credits + total_debits
    
    # Generate statement ID
    statement_id = str(uuid.uuid4())
    period_str = f"{start_date or 'Beginning'} to {end_date or 'Today'}"
    
    # Generate PDF
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    
    # Logo path
    logo_path = "/app/backend/assets/logo_pdf.png"
    
    # Header with logo
    if os.path.exists(logo_path):
        try:
            p.drawImage(logo_path, 50, height - 70, width=120, height=36, preserveAspectRatio=True, mask='auto')
        except Exception as e:
            p.setFont("Helvetica-Bold", 20)
            p.drawString(50, height - 50, "Dolaglobo Finance")
    else:
        p.setFont("Helvetica-Bold", 20)
        p.drawString(50, height - 50, "Dolaglobo Finance")
    
    # Statement title on the right
    p.setFont("Helvetica-Bold", 14)
    p.drawRightString(width - 50, height - 45, "OFFICIAL ACCOUNT STATEMENT")
    p.setFont("Helvetica", 9)
    p.drawRightString(width - 50, height - 58, "Digital Finance Solutions | Kenya")
    
    # Line
    p.line(50, height - 80, width - 50, height - 80)
    
    # User info - with masked phone
    p.setFont("Helvetica", 10)
    p.drawString(50, height - 100, f"Account Holder: {user.get('name', 'N/A')}")
    p.drawString(50, height - 115, f"Account Phone: {mask_phone(user.get('phone', ''))}")
    p.drawString(300, height - 100, f"Statement Period: {period_str}")
    p.drawString(300, height - 115, f"Date Generated: {datetime.now().strftime('%d %B %Y, %H:%M')}")
    p.drawString(50, height - 130, f"Statement ID: {statement_id[:8].upper()}")
    
    # Summary Box
    p.setStrokeColor(colors.grey)
    p.setFillColor(colors.Color(0.95, 0.95, 0.95))
    p.rect(50, height - 200, width - 100, 55, fill=True, stroke=True)
    p.setFillColor(colors.black)
    
    p.setFont("Helvetica-Bold", 10)
    p.drawString(60, height - 160, "ACCOUNT SUMMARY")
    p.setFont("Helvetica", 9)
    p.drawString(60, height - 175, f"Opening Balance: KES {opening_balance:,.2f}")
    p.drawString(200, height - 175, f"Total Credits: KES {total_credits:,.2f}")
    p.drawString(350, height - 175, f"Total Debits: KES {total_debits:,.2f}")
    p.drawString(60, height - 190, f"Total Fees: KES {total_fees:,.2f}")
    p.drawString(200, height - 190, f"No. of Transactions: {len(transactions)}")
    p.setFont("Helvetica-Bold", 9)
    p.drawString(350, height - 190, f"Closing Balance: KES {closing_balance:,.2f}")
    
    # Transactions table header
    y = height - 230
    p.setFillColor(colors.Color(0.2, 0.3, 0.2))
    p.rect(50, y - 5, width - 100, 20, fill=True, stroke=False)
    p.setFillColor(colors.white)
    p.setFont("Helvetica-Bold", 8)
    p.drawString(55, y + 2, "DATE")
    p.drawString(110, y + 2, "REF NO.")
    p.drawString(175, y + 2, "TYPE")
    p.drawString(240, y + 2, "DESCRIPTION")
    p.drawString(380, y + 2, "FEE")
    p.drawString(430, y + 2, "AMOUNT")
    p.drawString(510, y + 2, "BALANCE")
    
    # Reset fill color
    p.setFillColor(colors.black)
    
    # Transactions
    p.setFont("Helvetica", 7)
    y -= 25
    row_count = 0
    
    for txn in transactions:
        if y < 100:
            p.setFont("Helvetica", 7)
            p.drawString(50, 50, f"Page {p.getPageNumber()} | Statement ID: {statement_id[:8].upper()}")
            p.drawRightString(width - 50, 50, "Continued on next page...")
            p.showPage()
            y = height - 50
            p.setFont("Helvetica-Bold", 10)
            p.drawString(50, y, "Dolaglobo Finance - Account Statement (Continued)")
            y -= 30
            p.setFillColor(colors.Color(0.2, 0.3, 0.2))
            p.rect(50, y - 5, width - 100, 20, fill=True, stroke=False)
            p.setFillColor(colors.white)
            p.setFont("Helvetica-Bold", 8)
            p.drawString(55, y + 2, "DATE")
            p.drawString(110, y + 2, "REF NO.")
            p.drawString(175, y + 2, "TYPE")
            p.drawString(240, y + 2, "DESCRIPTION")
            p.drawString(380, y + 2, "FEE")
            p.drawString(430, y + 2, "AMOUNT")
            p.drawString(510, y + 2, "BALANCE")
            p.setFillColor(colors.black)
            y -= 25
        
        if row_count % 2 == 0:
            p.setFillColor(colors.Color(0.97, 0.97, 0.97))
            p.rect(50, y - 3, width - 100, 14, fill=True, stroke=False)
            p.setFillColor(colors.black)
        
        p.setFont("Helvetica", 7)
        
        date_str = txn.get("created_at", "")[:10] if txn.get("created_at") else ""
        p.drawString(55, y, date_str)
        
        ref_no = txn.get("id", "")[:8].upper() if txn.get("id") else ""
        p.drawString(110, y, ref_no)
        
        txn_type = txn.get("type", "").replace("_", " ").title()[:12]
        p.drawString(175, y, txn_type)
        
        description = txn.get("description", "")
        phone_pattern = r'(\d{4})(\d{3})(\d{3})'
        description = re.sub(phone_pattern, r'\1***\3', description)
        # Also handle +254 format
        phone_pattern_intl = r'(\+254)(\d{3})(\d{3})(\d{3})'
        description = re.sub(phone_pattern_intl, r'\1***\4', description)
        p.drawString(240, y, description[:28])
        
        fee = txn.get("fee", 0)
        if fee > 0:
            p.drawString(380, y, f"KES {fee:,.2f}")
        else:
            p.drawString(380, y, "-")
        
        amount = txn.get("amount", 0)
        txn_type_raw = txn.get("type", "")
        if txn_type_raw in ["deposit", "mpesa_deposit", "loan_disbursement", "mmf_withdrawal", "savings_withdrawal", "admin_credit", "credit"]:
            p.setFillColor(colors.Color(0, 0.5, 0))
            amount_str = f"+{amount:,.2f}"
        else:
            p.setFillColor(colors.Color(0.7, 0, 0))
            amount_str = f"-{amount:,.2f}"
        p.drawString(430, y, amount_str)
        p.setFillColor(colors.black)
        
        balance_after = txn.get("balance_after", 0)
        p.drawString(510, y, f"{balance_after:,.2f}")
        
        y -= 14
        row_count += 1
    
    # End of Statement Section
    y -= 30
    if y < 150:
        p.showPage()
        y = height - 100
    
    p.line(50, y, width - 50, y)
    y -= 25
    
    p.setFont("Helvetica-Bold", 12)
    p.drawCentredString(width / 2, y, "***End Of Statement***")
    y -= 30
    
    p.setFont("Helvetica", 9)
    disclaimer_text = (
        "This statement will be considered correct unless advice to the contrary has been received. "
        "All queries must be advised to the Branch Manager personally or through a private and "
        "confidential cover within 14 days of dispatch."
    )
    
    lines = simpleSplit(disclaimer_text, "Helvetica", 9, width - 100)
    for line in lines:
        p.drawCentredString(width / 2, y, line)
        y -= 14
    
    y -= 20
    
    p.setFont("Helvetica", 7)
    p.drawCentredString(width / 2, y, "Dolaglobo Finance | Digital Banking Solutions | www.dolaglobo.co.ke")
    y -= 12
    p.drawCentredString(width / 2, y, "Customer Support: support@dolaglobo.co.ke | This is a computer-generated statement.")
    
    p.drawString(50, 30, f"Page {p.getPageNumber()}")
    p.drawRightString(width - 50, 30, f"Statement ID: {statement_id[:8].upper()}")
    
    p.save()
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=statement_{datetime.now().strftime('%Y%m%d')}.pdf"}
    )

# ================== LOCK SAVINGS ROUTES ==================

@api_router.get("/savings")
async def get_savings(current_user: dict = Depends(get_current_user)):
    """Get all lock savings accounts"""
    savings = await db.lock_savings.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(100)
    return [serialize_doc(s) for s in savings]

@api_router.post("/savings/create")
async def create_lock_savings(data: LockSavingsCreate, current_user: dict = Depends(get_current_user)):
    """Create new lock savings"""
    user_id = current_user["user_id"]
    
    # Check KYC status
    user = await db.users.find_one({"id": user_id})
    if user.get("kyc_status") != "approved":
        raise HTTPException(status_code=403, detail="KYC approval required to access savings")
    
    # Check wallet balance
    wallet = await db.wallets.find_one({"user_id": user_id})
    if wallet["balance"] < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")
    
    # Get interest rate
    rate_doc = await db.interest_rates.find_one({"rate_type": f"lock_savings_{data.term_months}"})
    interest_rate = rate_doc["rate"] if rate_doc else (8 + data.term_months * 0.5)  # Default rates
    
    # Get early withdrawal penalty from system settings
    system_settings = await get_system_settings()
    early_penalty = system_settings.get("lock_savings_early_withdrawal_penalty", 0.5)
    
    # Calculate maturity
    start_date = datetime.now(timezone.utc)
    maturity_date = start_date + timedelta(days=data.term_months * 30)
    
    savings_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "amount": data.amount,
        "current_value": data.amount,
        "term_months": data.term_months,
        "interest_rate": interest_rate,
        "start_date": start_date.isoformat(),
        "maturity_date": maturity_date.isoformat(),
        "status": "active",
        "early_withdrawal_penalty": early_penalty,  # Use admin-configured penalty
        "accrued_interest": 0,
        "created_at": start_date.isoformat(),
    }
    
    await db.lock_savings.insert_one(savings_doc)
    
    # Deduct from wallet
    await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": -data.amount}})
    
    # Create transaction
    new_balance = wallet["balance"] - data.amount
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "savings_deposit",
        "amount": data.amount,
        "description": f"Lock Savings ({data.term_months} months)",
        "reference_id": savings_doc["id"],
        "balance_after": new_balance,
        "created_at": start_date.isoformat(),
    })
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "savings",
        "title": "Lock Savings Created",
        "message": f"Your {data.term_months}-month lock savings of KES {data.amount:,.2f} has been created at {interest_rate}% p.a.",
        "read": False,
        "created_at": start_date.isoformat(),
    })
    
    return {"success": True, "savings": serialize_doc(savings_doc)}

@api_router.post("/savings/{savings_id}/withdraw")
async def withdraw_savings(savings_id: str, current_user: dict = Depends(get_current_user)):
    """Withdraw from lock savings (with penalty if early)"""
    user_id = current_user["user_id"]
    
    savings = await db.lock_savings.find_one({"id": savings_id, "user_id": user_id})
    if not savings:
        raise HTTPException(status_code=404, detail="Savings not found")
    
    if savings["status"] != "active":
        raise HTTPException(status_code=400, detail="Savings not active")
    
    now = datetime.now(timezone.utc)
    maturity_date = datetime.fromisoformat(savings["maturity_date"].replace('Z', '+00:00'))
    
    # Calculate payout
    days_elapsed = (now - datetime.fromisoformat(savings["start_date"].replace('Z', '+00:00'))).days
    daily_rate = savings["interest_rate"] / 365 / 100
    accrued_interest = savings["amount"] * daily_rate * days_elapsed
    
    total_value = savings["amount"] + accrued_interest
    
    penalty = 0
    if now < maturity_date:
        # Early withdrawal - apply penalty
        penalty = total_value * (savings["early_withdrawal_penalty"] / 100)
        total_value -= penalty
    
    # Update savings status
    await db.lock_savings.update_one(
        {"id": savings_id},
        {"$set": {
            "status": "withdrawn",
            "withdrawn_at": now.isoformat(),
            "final_value": total_value,
            "penalty_applied": penalty
        }}
    )
    
    # Add to wallet
    await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": total_value}})
    
    # Create transaction
    wallet = await db.wallets.find_one({"user_id": user_id})
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "savings_withdrawal",
        "amount": total_value,
        "description": "Lock Savings Withdrawal" + (" (Early)" if penalty > 0 else " (Matured)"),
        "reference_id": savings_id,
        "balance_after": wallet["balance"],
        "created_at": now.isoformat(),
    })
    
    return {
        "success": True,
        "principal": savings["amount"],
        "interest_earned": accrued_interest,
        "penalty": penalty,
        "total_payout": total_value
    }

# ================== MONEY MARKET FUND ROUTES ==================

@api_router.get("/mmf")
async def get_mmf(current_user: dict = Depends(get_current_user)):
    """Get MMF account"""
    mmf = await db.mmf_accounts.find_one({"user_id": current_user["user_id"]}, {"_id": 0})
    if not mmf:
        return {"balance": 0, "total_earnings": 0, "exists": False}
    return serialize_doc(mmf)

@api_router.post("/mmf/invest")
async def invest_mmf(data: MMFInvest, current_user: dict = Depends(get_current_user)):
    """Invest in Money Market Fund"""
    user_id = current_user["user_id"]
    
    # Check KYC
    user = await db.users.find_one({"id": user_id})
    if user.get("kyc_status") != "approved":
        raise HTTPException(status_code=403, detail="KYC approval required")
    
    # Check wallet balance
    wallet = await db.wallets.find_one({"user_id": user_id})
    if wallet["balance"] < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")
    
    # Get MMF rate
    rate_doc = await db.interest_rates.find_one({"rate_type": "mmf"})
    interest_rate = rate_doc["rate"] if rate_doc else 10.0  # Default 10% p.a.
    
    now = datetime.now(timezone.utc)
    
    # Update or create MMF account
    mmf = await db.mmf_accounts.find_one({"user_id": user_id})
    if mmf:
        await db.mmf_accounts.update_one(
            {"user_id": user_id},
            {
                "$inc": {"balance": data.amount, "total_invested": data.amount},
                "$set": {"last_investment": now.isoformat(), "interest_rate": interest_rate}
            }
        )
    else:
        await db.mmf_accounts.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "balance": data.amount,
            "total_invested": data.amount,
            "total_earnings": 0,
            "interest_rate": interest_rate,
            "last_interest_calc": now.isoformat(),
            "last_investment": now.isoformat(),
            "created_at": now.isoformat(),
        })
    
    # Deduct from wallet
    await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": -data.amount}})
    
    # Transaction
    new_balance = wallet["balance"] - data.amount
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "mmf_invest",
        "amount": data.amount,
        "description": "Money Market Fund Investment",
        "balance_after": new_balance,
        "created_at": now.isoformat(),
    })
    
    mmf_updated = await db.mmf_accounts.find_one({"user_id": user_id}, {"_id": 0})
    return {"success": True, "mmf": serialize_doc(mmf_updated)}

@api_router.post("/mmf/withdraw")
async def withdraw_mmf(data: WalletTransfer, current_user: dict = Depends(get_current_user)):
    """Withdraw from MMF"""
    user_id = current_user["user_id"]
    
    mmf = await db.mmf_accounts.find_one({"user_id": user_id})
    if not mmf or mmf["balance"] < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient MMF balance")
    
    now = datetime.now(timezone.utc)
    
    # Update MMF
    await db.mmf_accounts.update_one(
        {"user_id": user_id},
        {"$inc": {"balance": -data.amount}}
    )
    
    # Add to wallet
    await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": data.amount}})
    
    # Transaction
    wallet = await db.wallets.find_one({"user_id": user_id})
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "mmf_withdrawal",
        "amount": data.amount,
        "description": "Money Market Fund Withdrawal",
        "balance_after": wallet["balance"],
        "created_at": now.isoformat(),
    })
    
    return {"success": True, "message": "Withdrawal successful", "amount": data.amount}

# ================== LOAN ROUTES ==================

@api_router.get("/loans")
async def get_loans(current_user: dict = Depends(get_current_user)):
    """Get all loans for user"""
    loans = await db.loans.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(100)
    return [serialize_doc(loan) for loan in loans]

@api_router.get("/loans/info")
async def get_loan_info(current_user: dict = Depends(get_current_user)):
    """Get user's loan limit and status info"""
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0, "pin_hash": 0})
    
    # Get active loan if any
    active_loan = await db.loans.find_one({
        "user_id": current_user["user_id"],
        "status": {"$in": ["pending", "approved", "disbursed"]}
    }, {"_id": 0})
    
    # Get loan history count
    loan_count = await db.loans.count_documents({"user_id": current_user["user_id"]})
    repaid_count = await db.loans.count_documents({"user_id": current_user["user_id"], "status": "repaid"})
    
    return {
        "loan_limit": user.get("loan_limit", 0),
        "loan_limit_updated_at": user.get("loan_limit_updated_at"),
        "kyc_status": user.get("kyc_status", "not_submitted"),
        "has_active_loan": active_loan is not None,
        "active_loan": serialize_doc(active_loan) if active_loan else None,
        "total_loans": loan_count,
        "repaid_loans": repaid_count,
        "can_apply": user.get("kyc_status") == "approved" and user.get("loan_limit", 0) > 0 and active_loan is None
    }

@api_router.post("/loans/apply")
async def apply_loan(data: LoanApply, current_user: dict = Depends(get_current_user)):
    """Apply for a loan"""
    user_id = current_user["user_id"]
    
    # Check KYC
    user = await db.users.find_one({"id": user_id})
    if user.get("kyc_status") != "approved":
        raise HTTPException(status_code=403, detail="KYC approval required for loans")
    
    # Check loan limit
    loan_limit = user.get("loan_limit", 0)
    if loan_limit <= 0:
        raise HTTPException(status_code=403, detail="You are not eligible for a loan at this time. Please check back later.")
    
    if data.amount > loan_limit:
        raise HTTPException(status_code=400, detail=f"Requested amount exceeds your eligible limit of KES {loan_limit:,.2f}")
    
    # Validate term based on loan type
    if data.loan_type == "short_term" and data.term_months > 6:
        raise HTTPException(status_code=400, detail="Short-term loans max 6 months")
    if data.loan_type == "long_term" and (data.term_months < 6 or data.term_months > 36):
        raise HTTPException(status_code=400, detail="Long-term loans must be 6-36 months")
    
    # Check for existing pending/active loans
    existing = await db.loans.find_one({
        "user_id": user_id,
        "status": {"$in": ["pending", "approved", "disbursed"]}
    })
    if existing:
        raise HTTPException(status_code=400, detail="You have an existing active loan")
    
    # Get interest rate
    rate_type = f"loan_{data.loan_type.replace('_term', '')}"
    rate_doc = await db.interest_rates.find_one({"rate_type": rate_type})
    interest_rate = rate_doc["rate"] if rate_doc else (15 if data.loan_type == "short_term" else 18)
    
    # Calculate repayment
    monthly_rate = interest_rate / 12 / 100
    if monthly_rate > 0:
        monthly_payment = data.amount * (monthly_rate * (1 + monthly_rate)**data.term_months) / ((1 + monthly_rate)**data.term_months - 1)
    else:
        monthly_payment = data.amount / data.term_months
    
    total_repayment = monthly_payment * data.term_months
    
    now = datetime.now(timezone.utc)
    
    loan_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "loan_type": data.loan_type,
        "amount": data.amount,
        "interest_rate": interest_rate,
        "term_months": data.term_months,
        "purpose": data.purpose,
        "monthly_payment": round(monthly_payment, 2),
        "total_repayment": round(total_repayment, 2),
        "outstanding_balance": round(total_repayment, 2),
        "status": "pending",
        "disbursed_at": None,
        "admin_notes": None,
        "reviewed_by": None,
        "created_at": now.isoformat(),
    }
    
    await db.loans.insert_one(loan_doc)
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "loan",
        "title": "Loan Application Submitted",
        "message": f"Your loan application for KES {data.amount:,.2f} has been submitted for review.",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {"success": True, "loan": serialize_doc(loan_doc)}

@api_router.get("/loans/{loan_id}/schedule")
async def get_repayment_schedule(loan_id: str, current_user: dict = Depends(get_current_user)):
    """Get loan repayment schedule"""
    loan = await db.loans.find_one({"id": loan_id, "user_id": current_user["user_id"]}, {"_id": 0})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan["status"] not in ["approved", "disbursed"]:
        raise HTTPException(status_code=400, detail="Loan not yet approved")
    
    # Generate schedule
    schedule = []
    start_date = datetime.fromisoformat(loan["disbursed_at"].replace('Z', '+00:00')) if loan["disbursed_at"] else datetime.now(timezone.utc)
    remaining = loan["total_repayment"]
    
    for i in range(loan["term_months"]):
        due_date = start_date + timedelta(days=30 * (i + 1))
        payment = min(loan["monthly_payment"], remaining)
        remaining -= payment
        
        schedule.append({
            "installment": i + 1,
            "due_date": due_date.isoformat(),
            "amount": round(payment, 2),
            "status": "pending"
        })
    
    return {"loan": serialize_doc(loan), "schedule": schedule}

@api_router.post("/loans/{loan_id}/repay")
async def submit_loan_repayment(loan_id: str, data: LoanRepaymentRequest, current_user: dict = Depends(get_current_user)):
    """Submit loan repayment request (wallet or MPESA) - requires admin approval"""
    user_id = current_user["user_id"]
    
    loan = await db.loans.find_one({"id": loan_id, "user_id": user_id})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan["status"] != "disbursed":
        raise HTTPException(status_code=400, detail="Loan not active for repayment")
    
    if loan["outstanding_balance"] <= 0:
        raise HTTPException(status_code=400, detail="Loan already fully repaid")
    
    # Validate based on repayment method
    if data.repayment_method == "wallet":
        wallet = await db.wallets.find_one({"user_id": user_id})
        if wallet["balance"] < data.amount:
            raise HTTPException(status_code=400, detail="Insufficient wallet balance")
    elif data.repayment_method == "mpesa":
        if not data.mpesa_ref:
            raise HTTPException(status_code=400, detail="MPESA reference is required")
        # Check for duplicate MPESA ref
        existing = await db.loan_repayments.find_one({"mpesa_ref": data.mpesa_ref})
        if existing:
            raise HTTPException(status_code=400, detail="This MPESA reference has already been used")
    
    now = datetime.now(timezone.utc)
    user = await db.users.find_one({"id": user_id}, {"name": 1, "phone": 1})
    
    # Determine if partial or overpayment
    outstanding = loan["outstanding_balance"]
    is_partial = data.amount < outstanding
    is_overpayment = data.amount > outstanding
    overpayment_amount = max(0, data.amount - outstanding) if is_overpayment else 0
    
    # Create repayment request
    repayment_doc = {
        "id": str(uuid.uuid4()),
        "loan_id": loan_id,
        "user_id": user_id,
        "user_name": user.get("name"),
        "user_phone": user.get("phone"),
        "amount": data.amount,
        "repayment_method": data.repayment_method,
        "mpesa_ref": data.mpesa_ref if data.repayment_method == "mpesa" else None,
        "sender_phone": data.sender_phone if data.repayment_method == "mpesa" else None,
        "outstanding_before": outstanding,
        "is_partial": is_partial,
        "is_overpayment": is_overpayment,
        "overpayment_amount": overpayment_amount,
        "overpayment_action": None,
        "overpayment_action_notes": None,
        "status": "pending",
        "admin_notes": None,
        "reviewed_by": None,
        "reviewed_at": None,
        "created_at": now.isoformat(),
    }
    
    await db.loan_repayments.insert_one(repayment_doc)
    
    # Create notification
    method_label = "Wallet" if data.repayment_method == "wallet" else f"MPESA (Ref: {data.mpesa_ref})"
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "loan",
        "title": "Repayment Submitted",
        "message": f"Your loan repayment of KES {data.amount:,.2f} via {method_label} is being processed.",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    # User-friendly status message
    if is_overpayment:
        status_msg = "Repayment submitted. The excess amount will be processed accordingly."
    elif is_partial:
        status_msg = "Partial repayment submitted successfully."
    else:
        status_msg = "Full repayment submitted successfully."
    
    return {
        "success": True,
        "message": status_msg,
        "repayment_id": repayment_doc["id"],
        "status": "Pending"
    }

@api_router.get("/loans/{loan_id}/repayments")
async def get_loan_repayments(loan_id: str, current_user: dict = Depends(get_current_user)):
    """Get repayment history for a loan"""
    loan = await db.loans.find_one({"id": loan_id, "user_id": current_user["user_id"]})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    repayments = await db.loan_repayments.find(
        {"loan_id": loan_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Calculate summary
    approved_repayments = [r for r in repayments if r["status"] == "approved"]
    total_paid = sum(r["amount"] for r in approved_repayments)
    
    return {
        "loan": serialize_doc(loan),
        "repayments": [serialize_doc(r) for r in repayments],
        "summary": {
            "original_amount": loan.get("amount"),
            "total_repayment": loan.get("total_repayment"),
            "total_paid": total_paid,
            "outstanding_balance": loan.get("outstanding_balance"),
            "repayment_count": len(approved_repayments)
        }
    }

@api_router.get("/mpesa/repayment-info")
async def get_mpesa_repayment_info(current_user: dict = Depends(get_current_user)):
    """Get MPESA Paybill info for loan repayment"""
    user = await db.users.find_one({"id": current_user["user_id"]}, {"phone": 1})
    config = await db.system_config.find_one({"key": "mpesa_paybill"}, {"_id": 0})
    paybill = config.get("value", "4114517") if config else "4114517"
    
    # Also check system_settings for paybill
    settings = await db.system_config.find_one({"key": "system_settings"})
    if settings and settings.get("mpesa_paybill"):
        paybill = settings.get("mpesa_paybill")
    
    return {
        "paybill_number": paybill,
        "account_number": user.get("phone", ""),
        "instructions": f"Send payment to Paybill {paybill}, Account Number: {user.get('phone', '')} (your registered phone number)"
    }

# ================== NOTIFICATION ROUTES ==================

@api_router.get("/notifications")
async def get_notifications(
    current_user: dict = Depends(get_current_user),
    unread_only: bool = False
):
    """Get user notifications"""
    query = {"user_id": current_user["user_id"]}
    if unread_only:
        query["read"] = False
    
    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    return [serialize_doc(n) for n in notifications]

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    """Mark notification as read"""
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user["user_id"]},
        {"$set": {"read": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}

@api_router.put("/notifications/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    """Mark all notifications as read"""
    await db.notifications.update_many(
        {"user_id": current_user["user_id"], "read": False},
        {"$set": {"read": True}}
    )
    return {"success": True}

# ================== ADMIN ROUTES ==================

@api_router.post("/admin/login")
async def admin_login(data: AdminLogin):
    """Admin login"""
    admin = await db.admin_users.find_one({"email": data.email.lower()})
    if not admin:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_pin(data.password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token({"user_id": admin["id"], "type": "admin", "email": admin["email"]})
    
    return {
        "success": True,
        "token": token,
        "admin": {
            "id": admin["id"],
            "email": admin["email"],
            "name": admin["name"],
            "role": admin.get("role", "admin")
        }
    }

@api_router.post("/admin/create")
async def create_admin(data: AdminCreate):
    """Create admin user (for initial setup)"""
    # Check if any admin exists
    existing_count = await db.admin_users.count_documents({})
    if existing_count > 0:
        # Only existing admins can create new admins
        raise HTTPException(status_code=403, detail="Contact existing admin to create new admin accounts")
    
    # First admin is automatically a super_admin
    admin_doc = {
        "id": str(uuid.uuid4()),
        "email": data.email.lower(),
        "password_hash": hash_pin(data.password),
        "name": data.name,
        "role": "super_admin",  # First admin is super_admin
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.admin_users.insert_one(admin_doc)
    
    # Initialize system settings with defaults
    await db.system_config.update_one(
        {"key": "system_settings"},
        {"$set": {
            "key": "system_settings",
            "deposit_mode": "manual",
            "withdrawal_mode": "manual",
            "mpesa_paybill": "4114517",
            "created_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return {"success": True, "message": "Super Admin created", "admin_id": admin_doc["id"]}

@api_router.get("/admin/dashboard")
async def admin_dashboard(admin: dict = Depends(get_admin_user)):
    """Get admin dashboard stats"""
    # Users stats
    total_users = await db.users.count_documents({})
    verified_users = await db.users.count_documents({"phone_verified": True})
    kyc_pending = await db.users.count_documents({"kyc_status": "submitted"})
    kyc_approved = await db.users.count_documents({"kyc_status": "approved"})
    
    # Loans stats
    pending_loans = await db.loans.count_documents({"status": "pending"})
    active_loans = await db.loans.count_documents({"status": "disbursed"})
    
    # MPESA deposits stats
    pending_deposits = await db.mpesa_deposits.count_documents({"status": "pending"})
    
    # STK Push stats
    pending_stk = await db.stk_push_requests.count_documents({"status": "pending"})
    completed_stk = await db.stk_push_requests.count_documents({"status": "completed"})
    
    # Withdrawal stats
    pending_withdrawals = await db.withdrawals.count_documents({"status": "pending"})
    approved_withdrawals = await db.withdrawals.count_documents({"status": "approved"})
    
    # Loan repayment stats
    pending_repayments = await db.loan_repayments.count_documents({"status": "pending"})
    
    # Statement requests
    pending_statements = await db.statement_requests.count_documents({"status": "pending"})
    
    # Email KYC submissions
    email_kyc_pending = await db.kyc_documents.count_documents({"status": "email_submitted"})
    
    # Unread admin notifications
    unread_admin_notifications = await db.admin_notifications.count_documents({"read": False})
    
    # Calculate totals
    loans = await db.loans.find({"status": {"$in": ["approved", "disbursed"]}}, {"amount": 1}).to_list(1000)
    total_disbursed = sum(loan.get("amount", 0) for loan in loans)
    
    savings_list = await db.lock_savings.find({"status": "active"}, {"current_value": 1, "amount": 1}).to_list(1000)
    total_savings = sum(sav.get("current_value", sav.get("amount", 0)) for sav in savings_list)
    
    mmf_list = await db.mmf_accounts.find({}, {"balance": 1}).to_list(1000)
    total_mmf = sum(mmf_item.get("balance", 0) for mmf_item in mmf_list)
    
    # Get current system settings
    system_settings = await get_system_settings()
    
    # Get Instalipa balance for admin dashboard
    instalipa_balance_doc = await db.system_config.find_one({"key": "instalipa_balance"}, {"_id": 0})
    instalipa_configured = are_credentials_configured()
    
    # Get today's airtime stats
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_airtime = await db.airtime_purchases.find({
        "created_at": {"$gte": today_start.isoformat()},
        "status": "completed"
    }).to_list(1000)
    today_airtime_total = sum(p.get("amount", 0) for p in today_airtime)
    today_airtime_count = len(today_airtime)
    
    return {
        "users": {
            "total": total_users,
            "verified": verified_users,
            "kyc_pending": kyc_pending,
            "kyc_approved": kyc_approved,
            "kyc_email_pending": email_kyc_pending
        },
        "loans": {
            "pending": pending_loans,
            "active": active_loans,
            "total_disbursed": total_disbursed,
            "pending_repayments": pending_repayments
        },
        "savings": {
            "total_lock_savings": total_savings,
            "total_mmf": total_mmf
        },
        "pending_actions": {
            "deposits": pending_deposits,
            "stk_requests": pending_stk,
            "stk_completed": completed_stk,
            "withdrawals": pending_withdrawals,
            "approved_withdrawals": approved_withdrawals,
            "loan_repayments": pending_repayments,
            "statements": pending_statements
        },
        "instalipa": {
            "configured": instalipa_configured,
            "balance": instalipa_balance_doc.get("value") if instalipa_balance_doc else "N/A",
            "balance_updated_at": instalipa_balance_doc.get("updated_at") if instalipa_balance_doc else None,
            "today_count": today_airtime_count,
            "today_total": today_airtime_total
        },
        "system_settings": system_settings,
        "admin_role": admin.get("role", "admin"),
        "unread_notifications": unread_admin_notifications
    }

@api_router.get("/admin/analytics")
async def admin_analytics(
    admin: dict = Depends(get_admin_user),
    period: str = Query(default="daily", description="Period: daily, weekly, monthly")
):
    """Get detailed analytics for admin dashboard with period filtering"""
    now = datetime.now(timezone.utc)
    
    # Calculate date range based on period
    if period == "daily":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        period_label = "Today"
    elif period == "weekly":
        # Start of the week (Monday)
        days_since_monday = now.weekday()
        start_date = (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
        period_label = "This Week"
    elif period == "monthly":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_label = "This Month"
    else:
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        period_label = "Today"
    
    start_date_iso = start_date.isoformat()
    
    # ============ TOTAL WALLET BALANCE FOR ALL USERS ============
    wallets = await db.wallets.find({}, {"balance": 1, "withheld_amount": 1}).to_list(10000)
    total_wallet_balance = sum(w.get("balance", 0) for w in wallets)
    total_withheld = sum(w.get("withheld_amount", 0) for w in wallets)
    total_available_balance = total_wallet_balance - total_withheld
    
    # ============ DEPOSITS (within period) ============
    # From transactions collection - completed deposits
    deposit_query = {
        "type": {"$in": ["deposit", "mpesa_deposit", "stk_push_deposit"]},
        "created_at": {"$gte": start_date_iso},
        "status": {"$in": ["completed", "success", None]}  # Include None for legacy records
    }
    deposits = await db.transactions.find(deposit_query, {"amount": 1}).to_list(10000)
    total_deposits = sum(d.get("amount", 0) for d in deposits)
    deposit_count = len(deposits)
    
    # Also check mpesa_deposits collection for approved ones
    mpesa_deposit_query = {
        "status": "approved",
        "reviewed_at": {"$gte": start_date_iso}
    }
    mpesa_deposits = await db.mpesa_deposits.find(mpesa_deposit_query, {"amount": 1}).to_list(10000)
    total_mpesa_deposits = sum(d.get("amount", 0) for d in mpesa_deposits)
    
    # STK Push completed deposits
    stk_query = {
        "status": "completed",
        "completed_at": {"$gte": start_date_iso}
    }
    stk_deposits = await db.stk_push_requests.find(stk_query, {"amount": 1}).to_list(10000)
    total_stk_deposits = sum(d.get("amount", 0) for d in stk_deposits)
    
    # Combine all deposit sources (avoid double counting by using max)
    combined_deposits = max(total_deposits, total_mpesa_deposits + total_stk_deposits)
    
    # ============ WITHDRAWALS (within period) ============
    withdrawal_query = {
        "type": {"$in": ["withdrawal", "mpesa_withdrawal"]},
        "created_at": {"$gte": start_date_iso}
    }
    withdrawals = await db.transactions.find(withdrawal_query, {"amount": 1}).to_list(10000)
    total_withdrawals = sum(w.get("amount", 0) for w in withdrawals)
    withdrawal_count = len(withdrawals)
    
    # Also check withdrawals collection for completed ones
    withdrawal_records_query = {
        "status": {"$in": ["completed", "approved", "paid"]},
        "created_at": {"$gte": start_date_iso}
    }
    withdrawal_records = await db.withdrawals.find(withdrawal_records_query, {"amount": 1}).to_list(10000)
    total_withdrawal_records = sum(w.get("amount", 0) for w in withdrawal_records)
    
    # Use max to avoid double counting
    combined_withdrawals = max(total_withdrawals, total_withdrawal_records)
    
    # ============ REVENUE CALCULATIONS ============
    
    # 1. Transaction Fees (from fee_collections or transactions with fees)
    fee_query = {
        "type": {"$in": ["fee", "transaction_fee", "withdrawal_fee", "service_fee"]},
        "created_at": {"$gte": start_date_iso}
    }
    fee_transactions = await db.transactions.find(fee_query, {"amount": 1}).to_list(10000)
    transaction_fees = sum(f.get("amount", 0) for f in fee_transactions)
    
    # Check fee_collections collection
    fee_collections = await db.fee_collections.find({"created_at": {"$gte": start_date_iso}}, {"amount": 1}).to_list(10000)
    collected_fees = sum(f.get("amount", 0) for f in fee_collections)
    
    total_transaction_fees = transaction_fees + collected_fees
    
    # 2. Loan Interest Collected
    # From loan repayments - interest portion
    repayment_query = {
        "status": {"$in": ["completed", "approved"]},
        "created_at": {"$gte": start_date_iso}
    }
    repayments = await db.loan_repayments.find(repayment_query, {"interest_portion": 1, "amount": 1}).to_list(10000)
    loan_interest_collected = sum(r.get("interest_portion", 0) for r in repayments)
    
    # If interest_portion not tracked separately, estimate from completed loans
    if loan_interest_collected == 0:
        # Check for completed loans and calculate interest
        loan_interest_txns = await db.transactions.find({
            "type": {"$in": ["loan_interest", "interest_payment"]},
            "created_at": {"$gte": start_date_iso}
        }, {"amount": 1}).to_list(10000)
        loan_interest_collected = sum(t.get("amount", 0) for t in loan_interest_txns)
    
    # 3. Savings/MMF Interest Paid Out (this is an expense, but track for reference)
    interest_paid_query = {
        "type": {"$in": ["mmf_interest", "lock_savings_interest", "interest_payout"]},
        "created_at": {"$gte": start_date_iso}
    }
    interest_paid = await db.transactions.find(interest_paid_query, {"amount": 1}).to_list(10000)
    total_interest_paid = sum(i.get("amount", 0) for i in interest_paid)
    
    # 4. Airtime Commission (if applicable)
    airtime_query = {
        "status": "completed",
        "created_at": {"$gte": start_date_iso}
    }
    airtime_purchases = await db.airtime_purchases.find(airtime_query, {"amount": 1, "commission": 1}).to_list(10000)
    airtime_commission = sum(a.get("commission", 0) for a in airtime_purchases)
    airtime_volume = sum(a.get("amount", 0) for a in airtime_purchases)
    
    # 5. Other Revenue (admin credits for fees, penalties, etc.)
    other_revenue_query = {
        "type": {"$in": ["penalty", "late_fee", "service_charge", "admin_fee"]},
        "created_at": {"$gte": start_date_iso}
    }
    other_revenue = await db.transactions.find(other_revenue_query, {"amount": 1}).to_list(10000)
    total_other_revenue = sum(o.get("amount", 0) for o in other_revenue)
    
    # Total Revenue
    total_revenue = total_transaction_fees + loan_interest_collected + airtime_commission + total_other_revenue
    
    # ============ COMPARISON WITH PREVIOUS PERIOD ============
    if period == "daily":
        prev_start = start_date - timedelta(days=1)
        prev_end = start_date
    elif period == "weekly":
        prev_start = start_date - timedelta(weeks=1)
        prev_end = start_date
    else:  # monthly
        # Previous month
        if start_date.month == 1:
            prev_start = start_date.replace(year=start_date.year - 1, month=12)
        else:
            prev_start = start_date.replace(month=start_date.month - 1)
        prev_end = start_date
    
    prev_start_iso = prev_start.isoformat()
    prev_end_iso = prev_end.isoformat()
    
    # Previous period deposits
    prev_deposits = await db.transactions.find({
        "type": {"$in": ["deposit", "mpesa_deposit", "stk_push_deposit"]},
        "created_at": {"$gte": prev_start_iso, "$lt": prev_end_iso}
    }, {"amount": 1}).to_list(10000)
    prev_total_deposits = sum(d.get("amount", 0) for d in prev_deposits)
    
    # Previous period withdrawals
    prev_withdrawals = await db.transactions.find({
        "type": {"$in": ["withdrawal", "mpesa_withdrawal"]},
        "created_at": {"$gte": prev_start_iso, "$lt": prev_end_iso}
    }, {"amount": 1}).to_list(10000)
    prev_total_withdrawals = sum(w.get("amount", 0) for w in prev_withdrawals)
    
    # Calculate percentage changes
    def calc_change(current, previous):
        if previous == 0:
            return 100 if current > 0 else 0
        return round(((current - previous) / previous) * 100, 1)
    
    deposit_change = calc_change(combined_deposits, prev_total_deposits)
    withdrawal_change = calc_change(combined_withdrawals, prev_total_withdrawals)
    
    # ============ USER STATS ============
    total_users = await db.users.count_documents({})
    
    # New users in period
    new_users = await db.users.count_documents({"created_at": {"$gte": start_date_iso}})
    
    # Active users (had transactions in period)
    active_user_ids = await db.transactions.distinct("user_id", {"created_at": {"$gte": start_date_iso}})
    active_users = len(active_user_ids)
    
    return {
        "period": period,
        "period_label": period_label,
        "period_start": start_date_iso,
        "period_end": now.isoformat(),
        
        "wallet_totals": {
            "total_balance": round(total_wallet_balance, 2),
            "total_available": round(total_available_balance, 2),
            "total_withheld": round(total_withheld, 2),
            "wallet_count": len(wallets)
        },
        
        "deposits": {
            "total_amount": round(combined_deposits, 2),
            "count": deposit_count,
            "change_percent": deposit_change,
            "previous_period": round(prev_total_deposits, 2)
        },
        
        "withdrawals": {
            "total_amount": round(combined_withdrawals, 2),
            "count": withdrawal_count,
            "change_percent": withdrawal_change,
            "previous_period": round(prev_total_withdrawals, 2)
        },
        
        "revenue": {
            "total": round(total_revenue, 2),
            "breakdown": {
                "transaction_fees": round(total_transaction_fees, 2),
                "loan_interest": round(loan_interest_collected, 2),
                "airtime_commission": round(airtime_commission, 2),
                "other": round(total_other_revenue, 2)
            }
        },
        
        "expenses": {
            "interest_paid": round(total_interest_paid, 2)
        },
        
        "airtime": {
            "volume": round(airtime_volume, 2),
            "count": len(airtime_purchases),
            "commission": round(airtime_commission, 2)
        },
        
        "users": {
            "total": total_users,
            "new_in_period": new_users,
            "active_in_period": active_users
        },
        
        "net_flow": round(combined_deposits - combined_withdrawals, 2)
    }

@api_router.get("/admin/kyc/pending")
async def get_pending_kyc(admin: dict = Depends(get_admin_user)):
    """Get pending KYC applications (both uploaded and email submitted)"""
    # Get both "submitted" (uploaded) and "email_submitted" status
    kyc_docs = await db.kyc_documents.find(
        {"status": {"$in": ["submitted", "email_submitted"]}}, 
        {"_id": 0}
    ).to_list(100)
    
    result = []
    for kyc in kyc_docs:
        user = await db.users.find_one({"id": kyc["user_id"]}, {"_id": 0, "pin_hash": 0})
        # Get uploaded documents for this user
        uploads = await db.kyc_uploads.find({"user_id": kyc["user_id"]}, {"_id": 0}).to_list(10)
        for upload in uploads:
            upload["url"] = f"/api/admin/kyc/documents/{upload['filename']}"
        
        result.append({
            "kyc": serialize_doc(kyc),
            "user": serialize_doc(user),
            "uploads": [serialize_doc(u) for u in uploads]
        })
    
    return result

@api_router.get("/admin/notifications")
async def get_admin_notifications(
    admin: dict = Depends(get_admin_user),
    unread_only: bool = False,
    limit: int = 20
):
    """Get admin notifications"""
    query = {}
    if unread_only:
        query["read"] = False
    
    notifications = await db.admin_notifications.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    unread_count = await db.admin_notifications.count_documents({"read": False})
    
    return {
        "notifications": [serialize_doc(n) for n in notifications],
        "unread_count": unread_count
    }

@api_router.put("/admin/notifications/{notification_id}/read")
async def mark_admin_notification_read(notification_id: str, admin: dict = Depends(get_admin_user)):
    """Mark admin notification as read"""
    result = await db.admin_notifications.update_one(
        {"id": notification_id},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}

@api_router.put("/admin/notifications/mark-all-read")
async def mark_all_admin_notifications_read(admin: dict = Depends(get_admin_user)):
    """Mark all admin notifications as read"""
    await db.admin_notifications.update_many(
        {"read": False},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True}

@api_router.put("/admin/kyc/{kyc_id}/approve")
async def approve_kyc(kyc_id: str, admin: dict = Depends(get_admin_user)):
    """Approve KYC"""
    kyc = await db.kyc_documents.find_one({"id": kyc_id})
    if not kyc:
        raise HTTPException(status_code=404, detail="KYC not found")
    
    now = datetime.now(timezone.utc)
    
    await db.kyc_documents.update_one(
        {"id": kyc_id},
        {"$set": {
            "status": "approved",
            "reviewed_by": admin["user_id"],
            "reviewed_at": now.isoformat()
        }}
    )
    
    await db.users.update_one({"id": kyc["user_id"]}, {"$set": {"kyc_status": "approved"}})
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": kyc["user_id"],
        "type": "kyc",
        "title": "KYC Approved",
        "message": "Your KYC has been approved. You can now access loans and savings products.",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    # Send SMS notification
    user = await db.users.find_one({"id": kyc["user_id"]})
    if user and user.get("phone"):
        send_kyc_approved_notification(phone=user["phone"])
    
    return {"success": True, "message": "KYC approved"}

@api_router.put("/admin/kyc/{kyc_id}/reject")
async def reject_kyc(kyc_id: str, reason: str = "", admin: dict = Depends(get_admin_user)):
    """Reject KYC"""
    kyc = await db.kyc_documents.find_one({"id": kyc_id})
    if not kyc:
        raise HTTPException(status_code=404, detail="KYC not found")
    
    now = datetime.now(timezone.utc)
    
    await db.kyc_documents.update_one(
        {"id": kyc_id},
        {"$set": {
            "status": "rejected",
            "admin_notes": reason,
            "reviewed_by": admin["user_id"],
            "reviewed_at": now.isoformat()
        }}
    )
    
    await db.users.update_one({"id": kyc["user_id"]}, {"$set": {"kyc_status": "rejected"}})
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": kyc["user_id"],
        "type": "kyc",
        "title": "KYC Rejected",
        "message": f"Your KYC was rejected. Reason: {reason or 'Please resubmit with correct documents.'}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    # Send SMS notification
    user = await db.users.find_one({"id": kyc["user_id"]})
    if user and user.get("phone"):
        send_kyc_rejected_notification(phone=user["phone"], reason=reason)
    
    return {"success": True, "message": "KYC rejected"}

@api_router.get("/admin/kyc/{user_id}/uploads")
async def get_user_kyc_uploads(user_id: str, admin: dict = Depends(get_admin_user)):
    """Get uploaded KYC documents for a specific user - Admin only"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    uploads = await db.kyc_uploads.find({"user_id": user_id}, {"_id": 0}).to_list(10)
    
    # Add URL to each upload
    for upload in uploads:
        upload["url"] = f"/api/admin/kyc/documents/{upload['filename']}"
    
    return {
        "user_id": user_id,
        "user_name": user.get("name"),
        "user_phone": user.get("phone"),
        "uploads": [serialize_doc(u) for u in uploads]
    }

@api_router.get("/admin/kyc/documents/{filename}")
async def admin_get_kyc_document(filename: str, admin: dict = Depends(get_admin_user)):
    """Serve KYC document file - Admin only"""
    doc = await db.kyc_uploads.find_one({"filename": filename})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    file_path = Path(__file__).parent / "uploads" / "kyc" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    content_type = doc.get("content_type", "application/octet-stream")
    
    return StreamingResponse(
        open(file_path, "rb"),
        media_type=content_type,
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )

@api_router.get("/admin/loans/pending")
async def get_pending_loans(admin: dict = Depends(get_admin_user)):
    """Get pending loan applications"""
    loans = await db.loans.find({"status": "pending"}, {"_id": 0}).to_list(100)
    
    result = []
    for loan in loans:
        user = await db.users.find_one({"id": loan["user_id"]}, {"_id": 0, "pin_hash": 0})
        result.append({
            "loan": serialize_doc(loan),
            "user": serialize_doc(user)
        })
    
    return result

@api_router.put("/admin/loans/{loan_id}/approve")
async def approve_loan(loan_id: str, admin: dict = Depends(get_admin_user)):
    """Approve and disburse loan"""
    loan = await db.loans.find_one({"id": loan_id})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan["status"] != "pending":
        raise HTTPException(status_code=400, detail="Loan not pending")
    
    now = datetime.now(timezone.utc)
    
    # Approve and disburse
    await db.loans.update_one(
        {"id": loan_id},
        {"$set": {
            "status": "disbursed",
            "disbursed_at": now.isoformat(),
            "reviewed_by": admin["user_id"]
        }}
    )
    
    # Add to user's wallet
    await db.wallets.update_one({"user_id": loan["user_id"]}, {"$inc": {"balance": loan["amount"]}})
    
    # Transaction
    wallet = await db.wallets.find_one({"user_id": loan["user_id"]})
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": loan["user_id"],
        "type": "loan_disbursement",
        "amount": loan["amount"],
        "description": f"Loan Disbursement - {loan['loan_type'].replace('_', ' ').title()}",
        "reference_id": loan_id,
        "balance_after": wallet["balance"],
        "created_at": now.isoformat(),
    })
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": loan["user_id"],
        "type": "loan",
        "title": "Loan Approved & Disbursed",
        "message": f"Your loan of KES {loan['amount']:,.2f} has been approved and disbursed to your wallet.",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    # Send SMS notification
    user = await db.users.find_one({"id": loan["user_id"]})
    if user and user.get("phone"):
        send_loan_disbursement_notification(
            phone=user["phone"],
            amount=loan["amount"],
            balance=wallet["balance"]
        )
    
    return {"success": True, "message": "Loan approved and disbursed"}

@api_router.put("/admin/loans/{loan_id}/reject")
async def reject_loan(loan_id: str, reason: str = "", admin: dict = Depends(get_admin_user)):
    """Reject loan application"""
    loan = await db.loans.find_one({"id": loan_id})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    now = datetime.now(timezone.utc)
    
    await db.loans.update_one(
        {"id": loan_id},
        {"$set": {
            "status": "rejected",
            "admin_notes": reason,
            "reviewed_by": admin["user_id"]
        }}
    )
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": loan["user_id"],
        "type": "loan",
        "title": "Loan Application Rejected",
        "message": f"Your loan application was rejected. Reason: {reason or 'Does not meet criteria.'}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    # Send SMS notification
    user = await db.users.find_one({"id": loan["user_id"]})
    if user and user.get("phone"):
        send_loan_rejected_notification(
            phone=user["phone"],
            amount=loan["amount"],
            reason=reason
        )
    
    return {"success": True, "message": "Loan rejected"}

@api_router.get("/admin/interest-rates")
async def get_interest_rates(admin: dict = Depends(get_admin_user)):
    """Get all interest rates"""
    rates = await db.interest_rates.find({}, {"_id": 0}).to_list(20)
    
    # Default rates if none exist
    default_rates = [
        {"rate_type": "lock_savings_3", "rate": 8.0, "description": "3-month Lock Savings"},
        {"rate_type": "lock_savings_6", "rate": 9.5, "description": "6-month Lock Savings"},
        {"rate_type": "lock_savings_9", "rate": 10.5, "description": "9-month Lock Savings"},
        {"rate_type": "lock_savings_12", "rate": 12.0, "description": "12-month Lock Savings"},
        {"rate_type": "mmf", "rate": 10.0, "description": "Money Market Fund"},
        {"rate_type": "loan_short", "rate": 15.0, "description": "Short-term Loans"},
        {"rate_type": "loan_long", "rate": 18.0, "description": "Long-term Loans"},
    ]
    
    if not rates:
        for rate in default_rates:
            rate["id"] = str(uuid.uuid4())
            rate["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.interest_rates.insert_one(rate)
        rates = await db.interest_rates.find({}, {"_id": 0}).to_list(20)
    
    return [serialize_doc(r) for r in rates]

@api_router.put("/admin/interest-rates")
async def update_interest_rate(data: InterestRateUpdate, admin: dict = Depends(get_admin_user)):
    """Update interest rate"""
    now = datetime.now(timezone.utc)
    
    result = await db.interest_rates.update_one(
        {"rate_type": data.rate_type},
        {
            "$set": {
                "rate": data.rate,
                "updated_by": admin["user_id"],
                "updated_at": now.isoformat()
            }
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rate type not found")
    
    return {"success": True, "message": f"{data.rate_type} rate updated to {data.rate}%"}

# ================== INTEREST ACCRUAL MANAGEMENT ==================

@api_router.get("/admin/savings/mmf-accounts")
async def get_all_mmf_accounts(admin: dict = Depends(get_admin_user)):
    """Get all MMF accounts with user info for interest management"""
    mmf_accounts = await db.mmf_accounts.find({}, {"_id": 0}).to_list(500)
    
    result = []
    for account in mmf_accounts:
        user = await db.users.find_one({"id": account["user_id"]}, {"_id": 0, "pin_hash": 0})
        if user and account.get("balance", 0) > 0:
            result.append({
                "account": serialize_doc(account),
                "user": serialize_doc(user)
            })
    
    return result

@api_router.get("/admin/savings/lock-savings")
async def get_all_lock_savings(admin: dict = Depends(get_admin_user)):
    """Get all active lock savings with user info for interest management"""
    savings = await db.lock_savings.find({"status": "active"}, {"_id": 0}).to_list(500)
    
    result = []
    for saving in savings:
        user = await db.users.find_one({"id": saving["user_id"]}, {"_id": 0, "pin_hash": 0})
        if user:
            result.append({
                "saving": serialize_doc(saving),
                "user": serialize_doc(user)
            })
    
    return result

@api_router.post("/admin/interest/apply-mmf/{user_id}")
async def apply_mmf_interest_manual(user_id: str, admin: dict = Depends(get_admin_user)):
    """Manually apply interest to a user's MMF account"""
    mmf = await db.mmf_accounts.find_one({"user_id": user_id})
    if not mmf:
        raise HTTPException(status_code=404, detail="MMF account not found")
    
    if mmf.get("balance", 0) <= 0:
        raise HTTPException(status_code=400, detail="MMF account has no balance")
    
    # Get current MMF rate
    rate_doc = await db.interest_rates.find_one({"rate_type": "mmf"})
    annual_rate = rate_doc.get("rate", 10.0) if rate_doc else 10.0
    
    # Calculate daily interest (annual rate / 365)
    daily_rate = annual_rate / 365 / 100
    interest_earned = mmf["balance"] * daily_rate
    
    now = datetime.now(timezone.utc)
    new_balance = mmf["balance"] + interest_earned
    
    # Update MMF balance
    await db.mmf_accounts.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "balance": new_balance,
                "total_interest_earned": mmf.get("total_interest_earned", 0) + interest_earned,
                "last_interest_date": now.isoformat(),
                "updated_at": now.isoformat()
            }
        }
    )
    
    # Create interest transaction record
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "mmf_interest",
        "amount": interest_earned,
        "description": f"MMF Daily Interest ({annual_rate}% p.a.)",
        "balance_after": new_balance,
        "applied_by": admin["user_id"],
        "interest_rate": annual_rate,
        "created_at": now.isoformat(),
    })
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "mmf_interest_applied",
        "entity_type": "mmf_account",
        "entity_id": mmf.get("id"),
        "user_id": user_id,
        "admin_id": admin["user_id"],
        "amount": interest_earned,
        "details": f"Manual MMF interest applied: KES {interest_earned:.2f} at {annual_rate}% p.a.",
        "created_at": now.isoformat(),
    })
    
    user = await db.users.find_one({"id": user_id}, {"name": 1})
    return {
        "success": True,
        "message": f"Interest applied to {user.get('name', 'user')}'s MMF account",
        "interest_earned": round(interest_earned, 2),
        "new_balance": round(new_balance, 2),
        "rate_applied": annual_rate
    }

@api_router.post("/admin/interest/apply-lock-savings/{saving_id}")
async def apply_lock_savings_interest_manual(saving_id: str, admin: dict = Depends(get_admin_user)):
    """Manually apply interest to a lock savings account"""
    saving = await db.lock_savings.find_one({"id": saving_id})
    if not saving:
        raise HTTPException(status_code=404, detail="Lock savings not found")
    
    if saving.get("status") != "active":
        raise HTTPException(status_code=400, detail="Lock savings is not active")
    
    # Get rate for this term
    rate_type = f"lock_savings_{saving['term_months']}"
    rate_doc = await db.interest_rates.find_one({"rate_type": rate_type})
    annual_rate = rate_doc.get("rate", 10.0) if rate_doc else 10.0
    
    # Calculate daily interest
    daily_rate = annual_rate / 365 / 100
    current_value = saving.get("current_value", saving.get("amount", 0))
    interest_earned = current_value * daily_rate
    
    now = datetime.now(timezone.utc)
    new_value = current_value + interest_earned
    
    # Update lock savings
    await db.lock_savings.update_one(
        {"id": saving_id},
        {
            "$set": {
                "current_value": new_value,
                "total_interest_earned": saving.get("total_interest_earned", 0) + interest_earned,
                "last_interest_date": now.isoformat(),
                "updated_at": now.isoformat()
            }
        }
    )
    
    # Create interest transaction
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": saving["user_id"],
        "type": "lock_savings_interest",
        "amount": interest_earned,
        "description": f"Lock Savings Interest ({saving['term_months']}mo at {annual_rate}% p.a.)",
        "saving_id": saving_id,
        "balance_after": new_value,
        "applied_by": admin["user_id"],
        "interest_rate": annual_rate,
        "created_at": now.isoformat(),
    })
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "lock_savings_interest_applied",
        "entity_type": "lock_savings",
        "entity_id": saving_id,
        "user_id": saving["user_id"],
        "admin_id": admin["user_id"],
        "amount": interest_earned,
        "details": f"Manual lock savings interest applied: KES {interest_earned:.2f} at {annual_rate}% p.a.",
        "created_at": now.isoformat(),
    })
    
    user = await db.users.find_one({"id": saving["user_id"]}, {"name": 1})
    return {
        "success": True,
        "message": f"Interest applied to {user.get('name', 'user')}'s {saving['term_months']}-month savings",
        "interest_earned": round(interest_earned, 2),
        "new_value": round(new_value, 2),
        "rate_applied": annual_rate
    }

@api_router.post("/admin/interest/apply-all-mmf")
async def apply_interest_all_mmf(admin: dict = Depends(get_admin_user)):
    """Apply daily interest to ALL MMF accounts (batch operation)"""
    mmf_accounts = await db.mmf_accounts.find({"balance": {"$gt": 0}}, {"_id": 0}).to_list(1000)
    
    if not mmf_accounts:
        return {"success": True, "message": "No MMF accounts with balance found", "processed": 0}
    
    rate_doc = await db.interest_rates.find_one({"rate_type": "mmf"})
    annual_rate = rate_doc.get("rate", 10.0) if rate_doc else 10.0
    daily_rate = annual_rate / 365 / 100
    
    now = datetime.now(timezone.utc)
    processed = 0
    total_interest = 0
    
    for mmf in mmf_accounts:
        interest_earned = mmf["balance"] * daily_rate
        new_balance = mmf["balance"] + interest_earned
        
        await db.mmf_accounts.update_one(
            {"user_id": mmf["user_id"]},
            {
                "$set": {
                    "balance": new_balance,
                    "total_interest_earned": mmf.get("total_interest_earned", 0) + interest_earned,
                    "last_interest_date": now.isoformat(),
                    "updated_at": now.isoformat()
                }
            }
        )
        
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": mmf["user_id"],
            "type": "mmf_interest",
            "amount": interest_earned,
            "description": f"MMF Daily Interest ({annual_rate}% p.a.) [Auto]",
            "balance_after": new_balance,
            "applied_by": "system" if admin.get("user_id") == "system" else admin["user_id"],
            "interest_rate": annual_rate,
            "created_at": now.isoformat(),
        })
        
        processed += 1
        total_interest += interest_earned
    
    # Audit log for batch operation
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "mmf_interest_batch_applied",
        "entity_type": "mmf_accounts",
        "entity_id": "batch",
        "admin_id": admin.get("user_id", "system"),
        "details": f"Batch MMF interest applied to {processed} accounts. Total: KES {total_interest:.2f} at {annual_rate}% p.a.",
        "created_at": now.isoformat(),
    })
    
    return {
        "success": True,
        "message": f"Interest applied to {processed} MMF accounts",
        "processed": processed,
        "total_interest": round(total_interest, 2),
        "rate_applied": annual_rate
    }

@api_router.post("/admin/interest/apply-all-lock-savings")
async def apply_interest_all_lock_savings(admin: dict = Depends(get_admin_user)):
    """Apply daily interest to ALL active lock savings (batch operation)"""
    savings = await db.lock_savings.find({"status": "active"}, {"_id": 0}).to_list(1000)
    
    if not savings:
        return {"success": True, "message": "No active lock savings found", "processed": 0}
    
    now = datetime.now(timezone.utc)
    processed = 0
    total_interest = 0
    
    for saving in savings:
        rate_type = f"lock_savings_{saving['term_months']}"
        rate_doc = await db.interest_rates.find_one({"rate_type": rate_type})
        annual_rate = rate_doc.get("rate", 10.0) if rate_doc else 10.0
        daily_rate = annual_rate / 365 / 100
        
        current_value = saving.get("current_value", saving.get("amount", 0))
        interest_earned = current_value * daily_rate
        new_value = current_value + interest_earned
        
        await db.lock_savings.update_one(
            {"id": saving["id"]},
            {
                "$set": {
                    "current_value": new_value,
                    "total_interest_earned": saving.get("total_interest_earned", 0) + interest_earned,
                    "last_interest_date": now.isoformat(),
                    "updated_at": now.isoformat()
                }
            }
        )
        
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": saving["user_id"],
            "type": "lock_savings_interest",
            "amount": interest_earned,
            "description": f"Lock Savings Interest ({saving['term_months']}mo at {annual_rate}% p.a.) [Auto]",
            "saving_id": saving["id"],
            "balance_after": new_value,
            "applied_by": "system" if admin.get("user_id") == "system" else admin["user_id"],
            "interest_rate": annual_rate,
            "created_at": now.isoformat(),
        })
        
        processed += 1
        total_interest += interest_earned
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "lock_savings_interest_batch_applied",
        "entity_type": "lock_savings",
        "entity_id": "batch",
        "admin_id": admin.get("user_id", "system"),
        "details": f"Batch lock savings interest applied to {processed} accounts. Total: KES {total_interest:.2f}",
        "created_at": now.isoformat(),
    })
    
    return {
        "success": True,
        "message": f"Interest applied to {processed} lock savings accounts",
        "processed": processed,
        "total_interest": round(total_interest, 2)
    }

@api_router.get("/admin/interest/history")
async def get_interest_history(
    admin: dict = Depends(get_admin_user),
    interest_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
):
    """Get interest application history from audit logs"""
    query = {"action": {"$in": ["mmf_interest_applied", "lock_savings_interest_applied", 
                                "mmf_interest_batch_applied", "lock_savings_interest_batch_applied"]}}
    if interest_type == "mmf":
        query["action"] = {"$in": ["mmf_interest_applied", "mmf_interest_batch_applied"]}
    elif interest_type == "lock_savings":
        query["action"] = {"$in": ["lock_savings_interest_applied", "lock_savings_interest_batch_applied"]}
    
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.audit_logs.count_documents(query)
    
    return {"logs": [serialize_doc(log) for log in logs], "total": total}

@api_router.get("/admin/users")
async def get_all_users(
    admin: dict = Depends(get_admin_user),
    skip: int = 0,
    limit: int = 20
):
    """Get all users"""
    users = await db.users.find({}, {"_id": 0, "pin_hash": 0}).skip(skip).limit(limit).to_list(limit)
    total = await db.users.count_documents({})
    return {"users": [serialize_doc(u) for u in users], "total": total}

@api_router.get("/admin/users/with-loans")
async def get_users_with_loan_info(admin: dict = Depends(get_admin_user)):
    """Get all users with their loan limits and status - for loan management"""
    users = await db.users.find({"kyc_status": "approved"}, {"_id": 0, "pin_hash": 0}).to_list(500)
    
    result = []
    for user in users:
        active_loan = await db.loans.find_one({
            "user_id": user["id"],
            "status": {"$in": ["pending", "approved", "disbursed"]}
        }, {"_id": 0})
        
        loan_count = await db.loans.count_documents({"user_id": user["id"]})
        repaid_count = await db.loans.count_documents({"user_id": user["id"], "status": "repaid"})
        
        result.append({
            "user": serialize_doc(user),
            "loan_limit": user.get("loan_limit", 0),
            "has_active_loan": active_loan is not None,
            "active_loan_amount": active_loan.get("amount") if active_loan else None,
            "total_loans": loan_count,
            "repaid_loans": repaid_count
        })
    
    return result

@api_router.get("/admin/users/{user_id}")
async def get_user_details(user_id: str, admin: dict = Depends(get_admin_user)):
    """Get detailed user information including loan limit"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "pin_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get wallet
    wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    
    # Get loan info
    active_loan = await db.loans.find_one({
        "user_id": user_id,
        "status": {"$in": ["pending", "approved", "disbursed"]}
    }, {"_id": 0})
    
    loan_count = await db.loans.count_documents({"user_id": user_id})
    repaid_count = await db.loans.count_documents({"user_id": user_id, "status": "repaid"})
    
    return {
        "user": serialize_doc(user),
        "wallet": serialize_doc(wallet) if wallet else None,
        "loan_info": {
            "loan_limit": user.get("loan_limit", 0),
            "loan_limit_updated_at": user.get("loan_limit_updated_at"),
            "loan_limit_updated_by": user.get("loan_limit_updated_by"),
            "has_active_loan": active_loan is not None,
            "active_loan": serialize_doc(active_loan) if active_loan else None,
            "total_loans": loan_count,
            "repaid_loans": repaid_count
        }
    }

@api_router.put("/admin/users/{user_id}/loan-limit")
async def update_user_loan_limit(user_id: str, data: LoanLimitUpdate, admin: dict = Depends(get_admin_user)):
    """Update user's loan limit"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    now = datetime.now(timezone.utc)
    old_limit = user.get("loan_limit", 0)
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "loan_limit": data.loan_limit,
            "loan_limit_updated_at": now.isoformat(),
            "loan_limit_updated_by": admin["user_id"]
        }}
    )
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "loan_limit_updated",
        "entity_type": "user",
        "entity_id": user_id,
        "admin_id": admin["user_id"],
        "details": f"Loan limit changed from KES {old_limit:,.2f} to KES {data.loan_limit:,.2f}",
        "old_value": old_limit,
        "new_value": data.loan_limit,
        "created_at": now.isoformat(),
    })
    
    # Notify user
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "loan",
        "title": "Loan Eligibility Updated",
        "message": f"Your loan eligibility has been {'set to' if old_limit == 0 else 'updated to'} KES {data.loan_limit:,.2f}.",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {
        "success": True,
        "message": f"Loan limit updated to KES {data.loan_limit:,.2f}",
        "old_limit": old_limit,
        "new_limit": data.loan_limit
    }

@api_router.put("/admin/users/{user_id}/kyc-status")
async def update_user_kyc_status(user_id: str, data: dict, admin: dict = Depends(get_admin_user)):
    """Update user's KYC status - for testing/admin purposes"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    status = data.get("status")
    if status not in ["pending", "submitted", "approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid KYC status")
    
    reason = data.get("reason", "Admin update")
    
    now = datetime.now(timezone.utc)
    old_status = user.get("kyc_status", "pending")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "kyc_status": status,
            "kyc_updated_at": now.isoformat(),
            "kyc_updated_by": admin["user_id"]
        }}
    )
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "kyc_status_updated",
        "entity_type": "user",
        "entity_id": user_id,
        "admin_id": admin["user_id"],
        "details": f"KYC status changed from {old_status} to {status}. Reason: {reason}",
        "old_value": old_status,
        "new_value": status,
        "created_at": now.isoformat(),
    })
    
    # Notify user if approved
    if status == "approved":
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "kyc",
            "title": "KYC Approved",
            "message": "Your KYC has been approved. You can now access loans and savings products.",
            "read": False,
            "created_at": now.isoformat(),
        })
    
    return {
        "success": True,
        "message": f"KYC status updated to {status}",
        "old_status": old_status,
        "new_status": status
    }

# ================== ADMIN LOAN REPAYMENT MANAGEMENT ==================

@api_router.get("/admin/loan-repayments/pending")
async def get_pending_loan_repayments(admin: dict = Depends(get_admin_user)):
    """Get all pending loan repayments"""
    repayments = await db.loan_repayments.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    result = []
    for rep in repayments:
        loan = await db.loans.find_one({"id": rep["loan_id"]}, {"_id": 0})
        result.append({
            "repayment": serialize_doc(rep),
            "loan": serialize_doc(loan) if loan else None
        })
    
    return result

@api_router.get("/admin/loan-repayments")
async def get_all_loan_repayments(
    admin: dict = Depends(get_admin_user),
    status: Optional[str] = None,
    loan_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
):
    """Get all loan repayments with optional filters"""
    query = {}
    if status:
        query["status"] = status
    if loan_id:
        query["loan_id"] = loan_id
    
    repayments = await db.loan_repayments.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.loan_repayments.count_documents(query)
    
    result = []
    for rep in repayments:
        loan = await db.loans.find_one({"id": rep["loan_id"]}, {"_id": 0, "purpose": 0})
        result.append({
            "repayment": serialize_doc(rep),
            "loan": serialize_doc(loan) if loan else None
        })
    
    return {"repayments": result, "total": total}

@api_router.put("/admin/loan-repayments/{repayment_id}/approve")
async def approve_loan_repayment(
    repayment_id: str,
    overpayment_data: Optional[OverpaymentAction] = None,
    admin: dict = Depends(get_admin_user)
):
    """Approve loan repayment - handles partial and full repayments"""
    repayment = await db.loan_repayments.find_one({"id": repayment_id})
    if not repayment:
        raise HTTPException(status_code=404, detail="Repayment not found")
    
    if repayment["status"] != "pending":
        raise HTTPException(status_code=400, detail="Repayment already processed")
    
    loan = await db.loans.find_one({"id": repayment["loan_id"]})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    now = datetime.now(timezone.utc)
    user_id = repayment["user_id"]
    amount = repayment["amount"]
    
    # Handle overpayment - require action decision
    if repayment["is_overpayment"] and repayment["overpayment_amount"] > 0:
        if not overpayment_data:
            raise HTTPException(
                status_code=400, 
                detail=f"This is an overpayment. Excess amount: KES {repayment['overpayment_amount']:,.2f}. Please specify overpayment action."
            )
    
    # Process based on repayment method
    if repayment["repayment_method"] == "wallet":
        # Deduct from wallet
        wallet = await db.wallets.find_one({"user_id": user_id})
        if wallet["balance"] < amount:
            raise HTTPException(status_code=400, detail="User has insufficient wallet balance")
        
        await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": -amount}})
        
        # Create wallet transaction
        new_wallet_balance = wallet["balance"] - amount
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "loan_repayment",
            "amount": amount,
            "description": "Loan Repayment (Wallet)",
            "reference_id": repayment["loan_id"],
            "repayment_id": repayment_id,
            "balance_after": new_wallet_balance,
            "created_at": now.isoformat(),
        })
    else:
        # MPESA repayment - just record the transaction
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "loan_repayment",
            "amount": amount,
            "description": f"Loan Repayment (MPESA Ref: {repayment['mpesa_ref']})",
            "reference_id": repayment["loan_id"],
            "repayment_id": repayment_id,
            "mpesa_ref": repayment["mpesa_ref"],
            "created_at": now.isoformat(),
        })
    
    # Calculate new loan balance
    outstanding = loan["outstanding_balance"]
    effective_payment = min(amount, outstanding)  # Only count up to outstanding
    new_balance = max(0, outstanding - effective_payment)
    loan_status = "repaid" if new_balance == 0 else "disbursed"
    
    # Update loan
    loan_update = {
        "outstanding_balance": new_balance,
        "status": loan_status,
        "total_paid": loan.get("total_paid", 0) + effective_payment,
        "last_repayment_date": now.isoformat()
    }
    if loan_status == "repaid":
        loan_update["repaid_at"] = now.isoformat()
    
    await db.loans.update_one({"id": loan["id"]}, {"$set": loan_update})
    
    # Handle overpayment action
    overpayment_action = None
    overpayment_notes = None
    if repayment["is_overpayment"] and overpayment_data:
        overpayment_action = overpayment_data.action
        overpayment_notes = overpayment_data.notes
        excess = repayment["overpayment_amount"]
        
        if overpayment_data.action == "credit_wallet":
            # Credit excess to wallet
            await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": excess}})
            wallet = await db.wallets.find_one({"user_id": user_id})
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "type": "overpayment_credit",
                "amount": excess,
                "description": "Loan Overpayment Credited to Wallet",
                "reference_id": repayment["loan_id"],
                "balance_after": wallet["balance"],
                "created_at": now.isoformat(),
            })
        elif overpayment_data.action == "hold_advance":
            # Record as loan advance for future loans
            await db.loan_advances.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "amount": excess,
                "source_repayment_id": repayment_id,
                "source_loan_id": loan["id"],
                "status": "available",
                "created_at": now.isoformat(),
            })
        # For 'refund', admin handles manually - just record the decision
    
    # Update repayment record
    await db.loan_repayments.update_one(
        {"id": repayment_id},
        {"$set": {
            "status": "approved",
            "overpayment_action": overpayment_action,
            "overpayment_action_notes": overpayment_notes,
            "reviewed_by": admin["user_id"],
            "reviewed_at": now.isoformat(),
            "outstanding_after": new_balance
        }}
    )
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "loan_repayment_approved",
        "entity_type": "loan_repayment",
        "entity_id": repayment_id,
        "user_id": user_id,
        "admin_id": admin["user_id"],
        "amount": amount,
        "details": f"Repayment approved. Method: {repayment['repayment_method']}. New balance: KES {new_balance:,.2f}" + 
                  (f". Overpayment: KES {repayment['overpayment_amount']:,.2f} ({overpayment_action})" if repayment["is_overpayment"] else ""),
        "created_at": now.isoformat(),
    })
    
    # Notify user
    if loan_status == "repaid":
        message = "Congratulations! Your loan has been fully repaid."
    else:
        message = f"Your repayment of KES {amount:,.2f} has been processed. Remaining balance: KES {new_balance:,.2f}"
    
    if repayment["is_overpayment"] and overpayment_action:
        if overpayment_action == "credit_wallet":
            message += f" Excess KES {repayment['overpayment_amount']:,.2f} has been credited to your wallet."
        elif overpayment_action == "hold_advance":
            message += f" Excess KES {repayment['overpayment_amount']:,.2f} has been held as advance for future loans."
        else:
            message += " Excess amount will be refunded separately."
    
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "loan",
        "title": "Repayment Processed",
        "message": message,
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {
        "success": True,
        "message": "Repayment approved",
        "amount_applied": effective_payment,
        "new_outstanding": new_balance,
        "loan_status": loan_status,
        "overpayment_handled": overpayment_action if repayment["is_overpayment"] else None
    }

@api_router.put("/admin/loan-repayments/{repayment_id}/reject")
async def reject_loan_repayment(
    repayment_id: str,
    reason: str = Query(..., description="Rejection reason"),
    admin: dict = Depends(get_admin_user)
):
    """Reject a loan repayment"""
    repayment = await db.loan_repayments.find_one({"id": repayment_id})
    if not repayment:
        raise HTTPException(status_code=404, detail="Repayment not found")
    
    if repayment["status"] != "pending":
        raise HTTPException(status_code=400, detail="Repayment already processed")
    
    now = datetime.now(timezone.utc)
    
    await db.loan_repayments.update_one(
        {"id": repayment_id},
        {"$set": {
            "status": "rejected",
            "admin_notes": reason,
            "reviewed_by": admin["user_id"],
            "reviewed_at": now.isoformat()
        }}
    )
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "loan_repayment_rejected",
        "entity_type": "loan_repayment",
        "entity_id": repayment_id,
        "user_id": repayment["user_id"],
        "admin_id": admin["user_id"],
        "amount": repayment["amount"],
        "details": f"Repayment rejected. Reason: {reason}",
        "created_at": now.isoformat(),
    })
    
    # Notify user
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": repayment["user_id"],
        "type": "loan",
        "title": "Repayment Rejected",
        "message": f"Your repayment of KES {repayment['amount']:,.2f} was rejected. Reason: {reason}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {"success": True, "message": "Repayment rejected"}

@api_router.put("/admin/loans/{loan_id}/adjust-balance")
async def adjust_loan_balance(
    loan_id: str,
    data: LoanBalanceAdjustment,
    admin: dict = Depends(get_admin_user)
):
    """Manually adjust loan balance (admin only)"""
    loan = await db.loans.find_one({"id": loan_id})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan["status"] not in ["disbursed", "repaid"]:
        raise HTTPException(status_code=400, detail="Can only adjust active or repaid loans")
    
    now = datetime.now(timezone.utc)
    old_balance = loan["outstanding_balance"]
    
    if data.adjustment_type == "increase":
        new_balance = old_balance + data.adjustment_amount
    else:
        new_balance = max(0, old_balance - data.adjustment_amount)
    
    # Update loan status if needed
    new_status = "repaid" if new_balance == 0 else "disbursed"
    
    await db.loans.update_one(
        {"id": loan_id},
        {"$set": {
            "outstanding_balance": new_balance,
            "status": new_status,
            "last_adjustment_at": now.isoformat(),
            "last_adjustment_by": admin["user_id"]
        }}
    )
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "loan_balance_adjusted",
        "entity_type": "loan",
        "entity_id": loan_id,
        "user_id": loan["user_id"],
        "admin_id": admin["user_id"],
        "amount": data.adjustment_amount,
        "details": f"Balance {data.adjustment_type}d by KES {data.adjustment_amount:,.2f}. Reason: {data.reason}. Old: KES {old_balance:,.2f}, New: KES {new_balance:,.2f}",
        "old_value": old_balance,
        "new_value": new_balance,
        "created_at": now.isoformat(),
    })
    
    # Notify user
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": loan["user_id"],
        "type": "loan",
        "title": "Loan Balance Adjusted",
        "message": f"Your loan balance has been adjusted. New outstanding: KES {new_balance:,.2f}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {
        "success": True,
        "message": "Loan balance adjusted",
        "old_balance": old_balance,
        "new_balance": new_balance,
        "new_status": new_status
    }

@api_router.get("/admin/loans/{loan_id}/full-details")
async def get_loan_full_details(loan_id: str, admin: dict = Depends(get_admin_user)):
    """Get complete loan details including all repayments for admin"""
    loan = await db.loans.find_one({"id": loan_id}, {"_id": 0})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    user = await db.users.find_one({"id": loan["user_id"]}, {"_id": 0, "pin_hash": 0})
    repayments = await db.loan_repayments.find({"loan_id": loan_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Calculate summary
    approved_repayments = [r for r in repayments if r["status"] == "approved"]
    total_paid = sum(r["amount"] for r in approved_repayments)
    
    return {
        "loan": serialize_doc(loan),
        "user": serialize_doc(user) if user else None,
        "repayments": [serialize_doc(r) for r in repayments],
        "summary": {
            "original_amount": loan.get("amount"),
            "interest_rate": loan.get("interest_rate"),
            "total_repayment_due": loan.get("total_repayment"),
            "total_paid": total_paid,
            "outstanding_balance": loan.get("outstanding_balance"),
            "total_repayments": len(repayments),
            "approved_repayments": len(approved_repayments),
            "pending_repayments": len([r for r in repayments if r["status"] == "pending"])
        }
    }

# ================== ADMIN MPESA DEPOSIT MANAGEMENT ==================

@api_router.get("/admin/deposits/pending")
async def get_pending_deposits(admin: dict = Depends(get_admin_user)):
    """Get pending MPESA deposits"""
    deposits = await db.mpesa_deposits.find({"status": "pending"}, {"_id": 0}).to_list(100)
    return [serialize_doc(d) for d in deposits]

@api_router.get("/admin/deposits")
async def get_all_deposits(
    admin: dict = Depends(get_admin_user),
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
):
    """Get all MPESA deposits with optional status filter"""
    query = {}
    if status:
        query["status"] = status
    deposits = await db.mpesa_deposits.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.mpesa_deposits.count_documents(query)
    return {"deposits": [serialize_doc(d) for d in deposits], "total": total}

@api_router.put("/admin/deposits/{deposit_id}/approve")
async def approve_deposit(deposit_id: str, admin: dict = Depends(get_admin_user)):
    """Approve MPESA deposit and credit user wallet"""
    deposit = await db.mpesa_deposits.find_one({"id": deposit_id})
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    
    if deposit["status"] != "pending":
        raise HTTPException(status_code=400, detail="Deposit already processed")
    
    now = datetime.now(timezone.utc)
    
    # Update deposit status
    await db.mpesa_deposits.update_one(
        {"id": deposit_id},
        {"$set": {
            "status": "approved",
            "reviewed_by": admin["user_id"],
            "reviewed_at": now.isoformat()
        }}
    )
    
    # Credit user wallet
    await db.wallets.update_one(
        {"user_id": deposit["user_id"]},
        {"$inc": {"balance": deposit["amount"]}}
    )
    
    # Create transaction
    wallet = await db.wallets.find_one({"user_id": deposit["user_id"]})
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": deposit["user_id"],
        "type": "mpesa_deposit",
        "amount": deposit["amount"],
        "description": f"MPESA Deposit (Ref: {deposit['mpesa_ref']})",
        "source": "mpesa",
        "reference": deposit["mpesa_ref"],
        "balance_after": wallet["balance"],
        "created_at": now.isoformat(),
    })
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "deposit_approved",
        "entity_type": "mpesa_deposit",
        "entity_id": deposit_id,
        "user_id": deposit["user_id"],
        "admin_id": admin["user_id"],
        "amount": deposit["amount"],
        "details": f"MPESA deposit approved. Ref: {deposit['mpesa_ref']}",
        "created_at": now.isoformat(),
    })
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": deposit["user_id"],
        "type": "deposit",
        "title": "Deposit Approved",
        "message": f"Your MPESA deposit of KES {deposit['amount']:,.2f} (Ref: {deposit['mpesa_ref']}) has been credited to your wallet.",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    # Send SMS notification
    user = await db.users.find_one({"id": deposit["user_id"]})
    if user and user.get("phone"):
        send_deposit_notification(
            phone=user["phone"],
            amount=deposit["amount"],
            balance=wallet["balance"],
            ref=deposit["mpesa_ref"]
        )
    
    return {"success": True, "message": "Deposit approved and credited"}

@api_router.put("/admin/deposits/{deposit_id}/reject")
async def reject_deposit(deposit_id: str, reason: str = "", admin: dict = Depends(get_admin_user)):
    """Reject MPESA deposit"""
    deposit = await db.mpesa_deposits.find_one({"id": deposit_id})
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    
    if deposit["status"] != "pending":
        raise HTTPException(status_code=400, detail="Deposit already processed")
    
    now = datetime.now(timezone.utc)
    
    await db.mpesa_deposits.update_one(
        {"id": deposit_id},
        {"$set": {
            "status": "rejected",
            "admin_notes": reason,
            "reviewed_by": admin["user_id"],
            "reviewed_at": now.isoformat()
        }}
    )
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "deposit_rejected",
        "entity_type": "mpesa_deposit",
        "entity_id": deposit_id,
        "user_id": deposit["user_id"],
        "admin_id": admin["user_id"],
        "amount": deposit["amount"],
        "details": f"MPESA deposit rejected. Reason: {reason}",
        "created_at": now.isoformat(),
    })
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": deposit["user_id"],
        "type": "deposit",
        "title": "Deposit Rejected",
        "message": f"Your MPESA deposit of KES {deposit['amount']:,.2f} was rejected. Reason: {reason or 'Invalid transaction'}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {"success": True, "message": "Deposit rejected"}

# ================== ADMIN WITHDRAWAL MANAGEMENT ==================

@api_router.get("/admin/withdrawals/pending")
async def get_pending_withdrawals(admin: dict = Depends(get_admin_user)):
    """Get pending withdrawal requests"""
    withdrawals = await db.withdrawals.find({"status": "pending"}, {"_id": 0}).to_list(100)
    return [serialize_doc(w) for w in withdrawals]

@api_router.get("/admin/withdrawals")
async def get_all_withdrawals(
    admin: dict = Depends(get_admin_user),
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
):
    """Get all withdrawals with optional status filter"""
    query = {}
    if status:
        query["status"] = status
    withdrawals = await db.withdrawals.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.withdrawals.count_documents(query)
    return {"withdrawals": [serialize_doc(w) for w in withdrawals], "total": total}

@api_router.put("/admin/withdrawals/{withdrawal_id}/approve")
async def approve_withdrawal(withdrawal_id: str, admin: dict = Depends(get_admin_user)):
    """Approve withdrawal request and deduct from wallet"""
    withdrawal = await db.withdrawals.find_one({"id": withdrawal_id})
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    
    if withdrawal["status"] != "pending":
        raise HTTPException(status_code=400, detail="Withdrawal already processed")
    
    # Get fee info from withdrawal (stored at creation time) or calculate if not present
    fee_amount = withdrawal.get("fee_amount", 0)
    net_amount = withdrawal.get("net_amount", withdrawal["amount"])
    fee_breakdown = withdrawal.get("fee_breakdown", [])
    
    # Check wallet balance
    wallet = await db.wallets.find_one({"user_id": withdrawal["user_id"]})
    if wallet["balance"] < withdrawal["amount"]:
        raise HTTPException(status_code=400, detail="Insufficient user balance")
    
    now = datetime.now(timezone.utc)
    
    # Update withdrawal status
    await db.withdrawals.update_one(
        {"id": withdrawal_id},
        {"$set": {
            "status": "approved",
            "reviewed_by": admin["user_id"],
            "reviewed_at": now.isoformat()
        }}
    )
    
    # Deduct full amount from wallet (includes fee)
    await db.wallets.update_one(
        {"user_id": withdrawal["user_id"]},
        {"$inc": {"balance": -withdrawal["amount"]}}
    )
    
    # Create transaction with fee details
    updated_wallet = await db.wallets.find_one({"user_id": withdrawal["user_id"]})
    destination = withdrawal.get("destination_phone") or f"{withdrawal.get('bank_name')} - {withdrawal.get('bank_account')}"
    
    fee_desc = f" (Fee: KES {fee_amount:,.2f})" if fee_amount > 0 else ""
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": withdrawal["user_id"],
        "type": "withdrawal",
        "amount": withdrawal["amount"],
        "fee_amount": fee_amount,
        "net_amount": net_amount,
        "description": f"Withdrawal to {withdrawal.get('withdrawal_type', 'mpesa').upper()} ({destination}){fee_desc}",
        "destination": destination,
        "balance_after": updated_wallet["balance"],
        "applied_fee_rules": [f.get("rule_id") for f in fee_breakdown] if fee_breakdown else [],
        "created_at": now.isoformat(),
    })
    
    # Record fee as separate transaction for revenue tracking
    if fee_amount > 0:
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": withdrawal["user_id"],
            "type": "withdrawal_fee",
            "amount": fee_amount,
            "description": "Withdrawal Fee",
            "reference": withdrawal_id,
            "balance_after": updated_wallet["balance"],
            "created_at": now.isoformat()
        })
        
        # Record in fee_collections for revenue tracking
        await db.fee_collections.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": withdrawal["user_id"],
            "transaction_type": "withdrawal",
            "transaction_id": withdrawal_id,
            "amount": fee_amount,
            "fee_breakdown": fee_breakdown,
            "created_at": now.isoformat()
        })
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "withdrawal_approved",
        "entity_type": "withdrawal",
        "entity_id": withdrawal_id,
        "user_id": withdrawal["user_id"],
        "admin_id": admin["user_id"],
        "amount": withdrawal["amount"],
        "fee_amount": fee_amount,
        "net_amount": net_amount,
        "details": f"Withdrawal approved to {withdrawal.get('withdrawal_type', 'mpesa')}: {destination}",
        "created_at": now.isoformat(),
    })
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": withdrawal["user_id"],
        "type": "withdrawal",
        "title": "Withdrawal Approved",
        "message": f"Your withdrawal of KES {withdrawal['amount']:,.2f} has been approved. Fee: KES {fee_amount:,.2f}, You will receive: KES {net_amount:,.2f}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    # Send SMS notification (show net amount user receives)
    user = await db.users.find_one({"id": withdrawal["user_id"]})
    if user and user.get("phone"):
        send_withdrawal_approved_notification(
            phone=user["phone"],
            amount=net_amount  # User receives net amount
        )
    
    return {
        "success": True, 
        "message": f"Withdrawal approved. Fee: KES {fee_amount:,.2f}, User receives: KES {net_amount:,.2f}",
        "fee_info": {
            "fee_amount": fee_amount,
            "net_amount": net_amount,
            "fee_breakdown": fee_breakdown
        }
    }

@api_router.put("/admin/withdrawals/{withdrawal_id}/reject")
async def reject_withdrawal(withdrawal_id: str, reason: str = "", admin: dict = Depends(get_admin_user)):
    """Reject withdrawal request"""
    withdrawal = await db.withdrawals.find_one({"id": withdrawal_id})
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    
    if withdrawal["status"] != "pending":
        raise HTTPException(status_code=400, detail="Withdrawal already processed")
    
    now = datetime.now(timezone.utc)
    
    await db.withdrawals.update_one(
        {"id": withdrawal_id},
        {"$set": {
            "status": "rejected",
            "admin_notes": reason,
            "reviewed_by": admin["user_id"],
            "reviewed_at": now.isoformat()
        }}
    )
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "withdrawal_rejected",
        "entity_type": "withdrawal",
        "entity_id": withdrawal_id,
        "user_id": withdrawal["user_id"],
        "admin_id": admin["user_id"],
        "amount": withdrawal["amount"],
        "details": f"Withdrawal rejected. Reason: {reason}",
        "created_at": now.isoformat(),
    })
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": withdrawal["user_id"],
        "type": "withdrawal",
        "title": "Withdrawal Rejected",
        "message": f"Your withdrawal of KES {withdrawal['amount']:,.2f} was rejected. Reason: {reason or 'Not approved'}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    # Send SMS notification
    user = await db.users.find_one({"id": withdrawal["user_id"]})
    if user and user.get("phone"):
        send_withdrawal_rejected_notification(
            phone=user["phone"],
            amount=withdrawal["amount"],
            reason=reason
        )
    
    return {"success": True, "message": "Withdrawal rejected"}

@api_router.put("/admin/withdrawals/{withdrawal_id}/mark-paid")
async def mark_withdrawal_paid(withdrawal_id: str, admin: dict = Depends(get_admin_user)):
    """Mark approved withdrawal as paid"""
    withdrawal = await db.withdrawals.find_one({"id": withdrawal_id})
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    
    if withdrawal["status"] != "approved":
        raise HTTPException(status_code=400, detail="Withdrawal must be approved first")
    
    now = datetime.now(timezone.utc)
    
    await db.withdrawals.update_one(
        {"id": withdrawal_id},
        {"$set": {
            "status": "paid",
            "paid_at": now.isoformat()
        }}
    )
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": withdrawal["user_id"],
        "type": "withdrawal",
        "title": "Withdrawal Completed",
        "message": f"Your withdrawal of KES {withdrawal['amount']:,.2f} has been sent to your {withdrawal['withdrawal_type'].upper()}.",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    # Send SMS notification for mark-paid
    user = await db.users.find_one({"id": withdrawal["user_id"]})
    wallet = await db.wallets.find_one({"user_id": withdrawal["user_id"]})
    if user and user.get("phone"):
        destination = withdrawal.get("destination_phone") or f"{withdrawal.get('bank_name', '')} - {withdrawal.get('bank_account', '')}"
        send_withdrawal_notification(
            phone=user["phone"],
            amount=withdrawal["amount"],
            balance=wallet.get("balance", 0) if wallet else 0,
            destination=destination
        )
    
    return {"success": True, "message": "Withdrawal marked as paid"}

# ================== ADMIN STATEMENT MANAGEMENT ==================

@api_router.get("/admin/statements/pending")
async def get_pending_statements(admin: dict = Depends(get_admin_user)):
    """Get pending statement requests"""
    statements = await db.statement_requests.find({"status": "pending"}, {"_id": 0}).to_list(100)
    
    result = []
    for stmt in statements:
        user = await db.users.find_one({"id": stmt["user_id"]}, {"_id": 0, "pin_hash": 0})
        result.append({
            "statement": serialize_doc(stmt),
            "user": serialize_doc(user)
        })
    return result

@api_router.get("/admin/statements")
async def get_all_statements(admin: dict = Depends(get_admin_user), status: Optional[str] = None):
    """Get all statement requests with optional status filter"""
    query = {}
    if status:
        query["status"] = status
    
    statements = await db.statement_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [serialize_doc(s) for s in statements]

@api_router.put("/admin/statements/{statement_id}/approve")
async def approve_statement(statement_id: str, admin: dict = Depends(get_admin_user)):
    """Approve and generate statement"""
    statement = await db.statement_requests.find_one({"id": statement_id})
    if not statement:
        raise HTTPException(status_code=404, detail="Statement request not found")
    
    if statement["status"] != "pending":
        raise HTTPException(status_code=400, detail="Statement already processed")
    
    now = datetime.now(timezone.utc)
    
    await db.statement_requests.update_one(
        {"id": statement_id},
        {"$set": {
            "status": "generated",
            "reviewed_by": admin["user_id"],
            "reviewed_at": now.isoformat()
        }}
    )
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": statement["user_id"],
        "type": "statement",
        "title": "Statement Ready",
        "message": f"Your statement for {statement['start_date']} to {statement['end_date']} is ready for download.",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    # Send SMS notification
    user = await db.users.find_one({"id": statement["user_id"]})
    if user and user.get("phone"):
        send_statement_ready_notification(
            phone=user["phone"],
            start_date=statement["start_date"],
            end_date=statement["end_date"]
        )
    
    return {"success": True, "message": "Statement approved and generated"}

@api_router.put("/admin/statements/{statement_id}/reject")
async def reject_statement(statement_id: str, reason: str = "", admin: dict = Depends(get_admin_user)):
    """Reject statement request"""
    statement = await db.statement_requests.find_one({"id": statement_id})
    if not statement:
        raise HTTPException(status_code=404, detail="Statement request not found")
    
    now = datetime.now(timezone.utc)
    
    await db.statement_requests.update_one(
        {"id": statement_id},
        {"$set": {
            "status": "rejected",
            "admin_notes": reason,
            "reviewed_by": admin["user_id"],
            "reviewed_at": now.isoformat()
        }}
    )
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": statement["user_id"],
        "type": "statement",
        "title": "Statement Request Rejected",
        "message": f"Your statement request was rejected. Reason: {reason or 'Not approved'}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {"success": True, "message": "Statement request rejected"}

@api_router.post("/admin/statements/{statement_id}/send-sms")
async def send_statement_via_sms(statement_id: str, admin: dict = Depends(get_admin_user)):
    """Send statement summary via SMS"""
    statement = await db.statement_requests.find_one({"id": statement_id})
    if not statement:
        raise HTTPException(status_code=404, detail="Statement request not found")
    
    if statement["status"] != "generated":
        raise HTTPException(status_code=400, detail="Statement must be approved first")
    
    user = await db.users.find_one({"id": statement["user_id"]})
    wallet = await db.wallets.find_one({"user_id": statement["user_id"]})
    
    if not user or not user.get("phone"):
        raise HTTPException(status_code=400, detail="User phone not available")
    
    # Build query for transactions
    query = {"user_id": statement["user_id"]}
    if statement.get("start_date"):
        query["created_at"] = {"$gte": statement["start_date"]}
    if statement.get("end_date"):
        if "created_at" in query:
            query["created_at"]["$lte"] = statement["end_date"]
        else:
            query["created_at"] = {"$lte": statement["end_date"]}
    
    transactions = await db.transactions.find(query, {"_id": 0}).to_list(1000)
    
    # Calculate statement data
    credit_types = ["deposit", "mpesa_deposit", "loan_disbursement", "mmf_withdrawal", "savings_withdrawal", "credit"]
    total_credits = sum(t.get("amount", 0) for t in transactions if t.get("type") in credit_types)
    total_debits = sum(t.get("amount", 0) for t in transactions if t.get("type") not in credit_types)
    closing_balance = wallet.get("balance", 0) if wallet else 0
    opening_balance = closing_balance - total_credits + total_debits
    
    statement_data = {
        "start_date": statement.get("start_date", "N/A"),
        "end_date": statement.get("end_date", "N/A"),
        "opening_balance": opening_balance,
        "closing_balance": closing_balance,
        "total_credits": total_credits,
        "total_debits": total_debits,
        "transaction_count": len(transactions)
    }
    
    # Send SMS statement
    result = send_statement_sms(user["phone"], statement_data)
    
    # Update statement delivery status
    now = datetime.now(timezone.utc)
    await db.statement_requests.update_one(
        {"id": statement_id},
        {"$set": {
            "sms_sent_at": now.isoformat(),
            "sms_sent_by": admin["user_id"]
        }}
    )
    
    return {
        "success": True,
        "message": "Statement sent via SMS",
        "sms_result": result,
        "statement_summary": statement_data
    }

@api_router.get("/admin/statements/{statement_id}/download-pdf")
async def admin_download_statement_pdf(statement_id: str, admin: dict = Depends(get_admin_user)):
    """Admin download statement PDF for email delivery"""
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    
    statement = await db.statement_requests.find_one({"id": statement_id})
    if not statement:
        raise HTTPException(status_code=404, detail="Statement request not found")
    
    user = await db.users.find_one({"id": statement["user_id"]})
    wallet = await db.wallets.find_one({"user_id": statement["user_id"]})
    
    # Build query for transactions
    query = {"user_id": statement["user_id"]}
    if statement.get("start_date"):
        query["created_at"] = {"$gte": statement["start_date"]}
    if statement.get("end_date"):
        if "created_at" in query:
            query["created_at"]["$lte"] = statement["end_date"]
        else:
            query["created_at"] = {"$lte": statement["end_date"]}
    
    transactions = await db.transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Calculate balances
    credit_types = ["deposit", "mpesa_deposit", "loan_disbursement", "mmf_withdrawal", "savings_withdrawal", "credit"]
    closing_balance = wallet.get("balance", 0) if wallet else 0
    total_credits = sum(t.get("amount", 0) for t in transactions if t.get("type") in credit_types)
    total_debits = sum(t.get("amount", 0) for t in transactions if t.get("type") not in credit_types)
    opening_balance = closing_balance - total_credits + total_debits
    
    # Generate PDF
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    
    # Header
    p.setFont("Helvetica-Bold", 20)
    p.drawString(50, height - 50, "Dolaglobo Finance")
    p.setFont("Helvetica", 12)
    p.drawString(50, height - 70, "Official Account Statement")
    
    # User info
    p.drawString(50, height - 100, f"Account Holder: {user.get('name', 'N/A') if user else 'N/A'}")
    p.drawString(50, height - 115, f"Phone: {user.get('phone', 'N/A') if user else 'N/A'}")
    p.drawString(50, height - 130, f"Period: {statement.get('start_date', 'N/A')} to {statement.get('end_date', 'N/A')}")
    p.drawString(50, height - 145, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    
    # Balances
    p.setFont("Helvetica-Bold", 11)
    p.drawString(50, height - 175, f"Opening Balance: KES {opening_balance:,.2f}")
    p.drawString(300, height - 175, f"Closing Balance: KES {closing_balance:,.2f}")
    
    # Line
    p.line(50, height - 190, width - 50, height - 190)
    
    # Transaction headers
    y = height - 210
    p.setFont("Helvetica-Bold", 10)
    p.drawString(50, y, "Date")
    p.drawString(130, y, "Type")
    p.drawString(240, y, "Description")
    p.drawString(430, y, "Amount")
    p.drawString(510, y, "Balance")
    
    p.line(50, y - 5, width - 50, y - 5)
    y -= 20
    
    # Transactions
    p.setFont("Helvetica", 9)
    running_balance = opening_balance
    
    # Sort by date ascending for running balance
    sorted_txns = sorted(transactions, key=lambda x: x.get("created_at", ""))
    
    for txn in sorted_txns:
        if y < 50:
            p.showPage()
            y = height - 50
            p.setFont("Helvetica", 9)
        
        txn_type = txn.get("type", "")
        amount = txn.get("amount", 0)
        date_str = txn.get("created_at", "")[:10]
        desc = txn.get("description", "")[:30]
        
        is_credit = txn_type in credit_types
        running_balance += amount if is_credit else -amount
        amount_str = f"+{amount:,.2f}" if is_credit else f"-{amount:,.2f}"
        
        p.drawString(50, y, date_str)
        p.drawString(130, y, txn_type[:15])
        p.drawString(240, y, desc)
        p.drawString(430, y, amount_str)
        p.drawString(510, y, f"{running_balance:,.2f}")
        
        y -= 15
    
    # Summary
    y -= 20
    p.line(50, y, width - 50, y)
    y -= 20
    p.setFont("Helvetica-Bold", 10)
    p.drawString(50, y, f"Total Credits: KES {total_credits:,.2f}")
    p.drawString(300, y, f"Total Debits: KES {total_debits:,.2f}")
    y -= 15
    p.drawString(50, y, f"Transactions: {len(transactions)}")
    
    p.save()
    buffer.seek(0)
    
    filename = f"statement_{user.get('phone', 'user') if user else 'user'}_{statement.get('start_date', '')}_{statement.get('end_date', '')}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ================== ADMIN WALLET ADJUSTMENT ==================

@api_router.post("/admin/wallet/adjust")
async def admin_adjust_wallet(data: AdminWalletAdjustment, admin: dict = Depends(get_admin_user)):
    """Manually credit or debit user wallet"""
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    wallet = await db.wallets.find_one({"user_id": data.user_id})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    
    # For debit, check balance
    if data.adjustment_type == "debit" and wallet["balance"] < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance for debit")
    
    now = datetime.now(timezone.utc)
    
    # Adjust wallet
    adjustment = data.amount if data.adjustment_type == "credit" else -data.amount
    await db.wallets.update_one(
        {"user_id": data.user_id},
        {"$inc": {"balance": adjustment}}
    )
    
    # Get updated balance
    updated_wallet = await db.wallets.find_one({"user_id": data.user_id})
    
    # Create transaction - user-friendly type without "admin" prefix
    txn_type = data.adjustment_type  # "credit" or "debit" - no admin prefix for user view
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": data.user_id,
        "type": txn_type,
        "amount": data.amount,
        "description": f"{data.adjustment_type.capitalize()}: {data.reason}",
        "source": "admin_adjustment",
        "admin_id": admin["user_id"],
        "balance_after": updated_wallet["balance"],
        "created_at": now.isoformat(),
    })
    
    # Audit log - keeps admin reference for audit purposes
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": f"wallet_{data.adjustment_type}",
        "entity_type": "wallet",
        "entity_id": wallet.get("id"),
        "user_id": data.user_id,
        "admin_id": admin["user_id"],
        "amount": data.amount,
        "details": f"Admin wallet {data.adjustment_type}. Reason: {data.reason}",
        "created_at": now.isoformat(),
    })
    
    # Notification - user-friendly message without "Admin" mention
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": data.user_id,
        "type": "wallet",
        "title": f"Wallet {'Credit' if data.adjustment_type == 'credit' else 'Debit'}",
        "message": f"KES {data.amount:,.2f} has been {'added to' if data.adjustment_type == 'credit' else 'deducted from'} your wallet. Reason: {data.reason}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    # Send SMS notification
    if user and user.get("phone"):
        if data.adjustment_type == "credit":
            send_wallet_credit_notification(
                phone=user["phone"],
                amount=data.amount,
                balance=updated_wallet["balance"],
                reason=data.reason
            )
        else:
            send_wallet_debit_notification(
                phone=user["phone"],
                amount=data.amount,
                balance=updated_wallet["balance"],
                reason=data.reason
            )
    
    return {
        "success": True,
        "message": f"Wallet {data.adjustment_type}ed successfully",
        "new_balance": updated_wallet["balance"]
    }

@api_router.get("/admin/wallet/{user_id}")
async def admin_get_user_wallet(user_id: str, admin: dict = Depends(get_admin_user)):
    """Get user wallet details for admin with balance breakdown"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "pin_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    transactions = await db.transactions.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)
    
    # Calculate balances
    actual_balance = wallet.get("balance", 0) if wallet else 0
    withheld_amount = wallet.get("withheld_amount", 0) if wallet else 0
    available_balance = max(0, actual_balance - withheld_amount)
    holds = wallet.get("holds", []) if wallet else []
    
    wallet_data = serialize_doc(wallet) if wallet else {}
    wallet_data["actual_balance"] = actual_balance
    wallet_data["available_balance"] = available_balance
    wallet_data["withheld_amount"] = withheld_amount
    wallet_data["holds"] = holds
    
    return {
        "user": serialize_doc(user),
        "wallet": wallet_data,
        "recent_transactions": [serialize_doc(t) for t in transactions]
    }

# ================== ADMIN WALLET HOLD MANAGEMENT ==================

@api_router.post("/admin/wallet/hold")
async def admin_add_wallet_hold(data: AdminWalletHold, admin: dict = Depends(get_admin_user)):
    """Add a hold on user's wallet (reduce available balance)"""
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    wallet = await db.wallets.find_one({"user_id": data.user_id})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    
    # Check if there's enough balance to hold
    actual_balance = wallet.get("balance", 0)
    current_withheld = wallet.get("withheld_amount", 0)
    available = actual_balance - current_withheld
    
    if data.amount > available:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot hold KES {data.amount:,.2f}. Available balance is only KES {available:,.2f}"
        )
    
    now = datetime.now(timezone.utc)
    
    # Create hold record
    hold_record = {
        "id": str(uuid.uuid4()),
        "amount": data.amount,
        "hold_type": data.hold_type,
        "reason": data.reason,
        "created_by": admin["user_id"],
        "created_at": now.isoformat(),
        "status": "active"
    }
    
    # Update wallet with new hold
    await db.wallets.update_one(
        {"user_id": data.user_id},
        {
            "$inc": {"withheld_amount": data.amount},
            "$push": {"holds": hold_record}
        }
    )
    
    # Get updated wallet
    updated_wallet = await db.wallets.find_one({"user_id": data.user_id})
    new_available = updated_wallet.get("balance", 0) - updated_wallet.get("withheld_amount", 0)
    
    # Create transaction record
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": data.user_id,
        "type": "hold",
        "amount": data.amount,
        "description": f"Balance hold: {data.reason}",
        "hold_type": data.hold_type,
        "hold_id": hold_record["id"],
        "source": "admin_hold",
        "admin_id": admin["user_id"],
        "balance_after": updated_wallet["balance"],
        "available_after": new_available,
        "created_at": now.isoformat(),
    })
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "wallet_hold_added",
        "entity_type": "wallet",
        "entity_id": wallet.get("id"),
        "user_id": data.user_id,
        "admin_id": admin["user_id"],
        "amount": data.amount,
        "details": f"Hold added: {data.hold_type} - {data.reason}",
        "created_at": now.isoformat(),
    })
    
    # Notification to user
    hold_type_labels = {
        "transaction_fee": "Transaction Fee",
        "service_fee": "Service Fee",
        "penalty": "Penalty",
        "withdrawal_fee": "Withdrawal Fee",
        "loan_fee": "Loan Processing Fee",
        "other": "Hold"
    }
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": data.user_id,
        "type": "wallet",
        "title": f"Balance Hold: {hold_type_labels.get(data.hold_type, 'Hold')}",
        "message": f"KES {data.amount:,.2f} has been placed on hold. Reason: {data.reason}. Your available balance is now KES {new_available:,.2f}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {
        "success": True,
        "message": f"Hold of KES {data.amount:,.2f} added successfully",
        "hold": hold_record,
        "new_available_balance": new_available,
        "new_withheld_amount": updated_wallet.get("withheld_amount", 0)
    }

@api_router.post("/admin/wallet/release-hold")
async def admin_release_wallet_hold(data: AdminReleaseHold, admin: dict = Depends(get_admin_user)):
    """Release or deduct a hold from user's wallet"""
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    wallet = await db.wallets.find_one({"user_id": data.user_id})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    
    # Find the hold
    holds = wallet.get("holds", [])
    hold = next((h for h in holds if h.get("id") == data.hold_id and h.get("status") == "active"), None)
    
    if not hold:
        raise HTTPException(status_code=404, detail="Active hold not found")
    
    now = datetime.now(timezone.utc)
    hold_amount = hold.get("amount", 0)
    
    if data.action == "release":
        # Release hold - return to available balance
        await db.wallets.update_one(
            {"user_id": data.user_id, "holds.id": data.hold_id},
            {
                "$inc": {"withheld_amount": -hold_amount},
                "$set": {"holds.$.status": "released", "holds.$.released_at": now.isoformat(), "holds.$.released_by": admin["user_id"]}
            }
        )
        action_desc = "released back to available balance"
        txn_type = "hold_released"
        
    else:  # deduct
        # Deduct from balance - remove from both balance and withheld
        await db.wallets.update_one(
            {"user_id": data.user_id, "holds.id": data.hold_id},
            {
                "$inc": {"balance": -hold_amount, "withheld_amount": -hold_amount},
                "$set": {"holds.$.status": "deducted", "holds.$.deducted_at": now.isoformat(), "holds.$.deducted_by": admin["user_id"]}
            }
        )
        action_desc = "deducted from wallet"
        txn_type = "hold_deducted"
    
    # Get updated wallet
    updated_wallet = await db.wallets.find_one({"user_id": data.user_id})
    new_available = updated_wallet.get("balance", 0) - updated_wallet.get("withheld_amount", 0)
    
    # Create transaction record
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": data.user_id,
        "type": txn_type,
        "amount": hold_amount,
        "description": f"Hold {data.action}d: {hold.get('reason', 'N/A')}",
        "hold_type": hold.get("hold_type"),
        "hold_id": data.hold_id,
        "source": "admin_hold_action",
        "admin_id": admin["user_id"],
        "balance_after": updated_wallet["balance"],
        "available_after": new_available,
        "created_at": now.isoformat(),
    })
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": f"wallet_hold_{data.action}d",
        "entity_type": "wallet",
        "entity_id": wallet.get("id"),
        "user_id": data.user_id,
        "admin_id": admin["user_id"],
        "amount": hold_amount,
        "details": f"Hold {data.action}d: {hold.get('hold_type')} - {hold.get('reason')}",
        "created_at": now.isoformat(),
    })
    
    # Notification to user
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": data.user_id,
        "type": "wallet",
        "title": f"Hold {'Released' if data.action == 'release' else 'Deducted'}",
        "message": f"KES {hold_amount:,.2f} previously on hold has been {action_desc}. Your available balance is now KES {new_available:,.2f}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {
        "success": True,
        "message": f"Hold {action_desc}",
        "amount": hold_amount,
        "new_balance": updated_wallet["balance"],
        "new_available_balance": new_available,
        "new_withheld_amount": updated_wallet.get("withheld_amount", 0)
    }

@api_router.get("/admin/wallet/{user_id}/holds")
async def admin_get_user_holds(user_id: str, admin: dict = Depends(get_admin_user)):
    """Get all holds on a user's wallet"""
    wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    
    holds = wallet.get("holds", [])
    active_holds = [h for h in holds if h.get("status") == "active"]
    
    return {
        "holds": holds,
        "active_holds": active_holds,
        "total_withheld": wallet.get("withheld_amount", 0),
        "actual_balance": wallet.get("balance", 0),
        "available_balance": wallet.get("balance", 0) - wallet.get("withheld_amount", 0)
    }

# ================== ADMIN MMF HOLD MANAGEMENT ==================

@api_router.post("/admin/mmf/hold")
async def admin_add_mmf_hold(data: AdminMMFHold, admin: dict = Depends(get_admin_user)):
    """Add a hold on user's MMF account (reduce available balance)"""
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    mmf = await db.mmf_accounts.find_one({"user_id": data.user_id})
    if not mmf:
        raise HTTPException(status_code=404, detail="MMF account not found")
    
    # Check if there's enough balance to hold
    actual_balance = mmf.get("balance", 0)
    current_withheld = mmf.get("withheld_amount", 0)
    available = actual_balance - current_withheld
    
    if data.amount > available:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot hold KES {data.amount:,.2f}. Available MMF balance is only KES {available:,.2f}"
        )
    
    now = datetime.now(timezone.utc)
    
    # Create hold record
    hold_record = {
        "id": str(uuid.uuid4()),
        "amount": data.amount,
        "hold_type": data.hold_type,
        "reason": data.reason,
        "created_by": admin["user_id"],
        "created_at": now.isoformat(),
        "status": "active"
    }
    
    # Update MMF account with new hold
    await db.mmf_accounts.update_one(
        {"user_id": data.user_id},
        {
            "$inc": {"withheld_amount": data.amount},
            "$push": {"holds": hold_record}
        }
    )
    
    # Get updated MMF
    updated_mmf = await db.mmf_accounts.find_one({"user_id": data.user_id})
    new_available = updated_mmf.get("balance", 0) - updated_mmf.get("withheld_amount", 0)
    
    # Create transaction record
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": data.user_id,
        "type": "mmf_hold",
        "amount": data.amount,
        "description": f"MMF hold: {data.reason}",
        "hold_type": data.hold_type,
        "hold_id": hold_record["id"],
        "source": "admin_mmf_hold",
        "admin_id": admin["user_id"],
        "balance_after": updated_mmf["balance"],
        "available_after": new_available,
        "created_at": now.isoformat(),
    })
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "mmf_hold_added",
        "entity_type": "mmf",
        "entity_id": mmf.get("id"),
        "user_id": data.user_id,
        "admin_id": admin["user_id"],
        "amount": data.amount,
        "details": f"MMF Hold added: {data.hold_type} - {data.reason}",
        "created_at": now.isoformat(),
    })
    
    # Notification to user
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": data.user_id,
        "type": "mmf",
        "title": f"MMF Balance Hold",
        "message": f"KES {data.amount:,.2f} has been placed on hold in your MMF account. Reason: {data.reason}. Your available MMF balance is now KES {new_available:,.2f}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {
        "success": True,
        "message": f"MMF hold of KES {data.amount:,.2f} added successfully",
        "hold": hold_record,
        "new_available_balance": new_available,
        "new_withheld_amount": updated_mmf.get("withheld_amount", 0)
    }

@api_router.post("/admin/mmf/release-hold")
async def admin_release_mmf_hold(data: AdminReleaseMMFHold, admin: dict = Depends(get_admin_user)):
    """Release or deduct a hold from user's MMF account"""
    mmf = await db.mmf_accounts.find_one({"user_id": data.user_id})
    if not mmf:
        raise HTTPException(status_code=404, detail="MMF account not found")
    
    # Find the hold
    holds = mmf.get("holds", [])
    hold = next((h for h in holds if h.get("id") == data.hold_id and h.get("status") == "active"), None)
    
    if not hold:
        raise HTTPException(status_code=404, detail="Active hold not found")
    
    hold_amount = hold.get("amount", 0)
    now = datetime.now(timezone.utc)
    
    if data.action == "release":
        # Just release the hold, make balance available again
        await db.mmf_accounts.update_one(
            {"user_id": data.user_id, "holds.id": data.hold_id},
            {
                "$inc": {"withheld_amount": -hold_amount},
                "$set": {"holds.$.status": "released", "holds.$.released_at": now.isoformat()}
            }
        )
        action_desc = f"released KES {hold_amount:,.2f} back to available balance"
    else:  # deduct
        # Deduct from balance and release hold
        await db.mmf_accounts.update_one(
            {"user_id": data.user_id, "holds.id": data.hold_id},
            {
                "$inc": {"balance": -hold_amount, "withheld_amount": -hold_amount},
                "$set": {"holds.$.status": "deducted", "holds.$.deducted_at": now.isoformat()}
            }
        )
        action_desc = f"deducted KES {hold_amount:,.2f} from MMF balance"
    
    updated_mmf = await db.mmf_accounts.find_one({"user_id": data.user_id})
    new_available = updated_mmf.get("balance", 0) - updated_mmf.get("withheld_amount", 0)
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": data.user_id,
        "type": "mmf",
        "title": f"MMF Hold {'Released' if data.action == 'release' else 'Deducted'}",
        "message": f"MMF hold of KES {hold_amount:,.2f} has been {data.action}d. Reason: {hold.get('reason', 'N/A')}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {
        "success": True,
        "message": f"MMF hold {action_desc}",
        "amount": hold_amount,
        "new_balance": updated_mmf["balance"],
        "new_available_balance": new_available,
        "new_withheld_amount": updated_mmf.get("withheld_amount", 0)
    }

@api_router.get("/admin/mmf/{user_id}/holds")
async def admin_get_mmf_holds(user_id: str, admin: dict = Depends(get_admin_user)):
    """Get all holds on a user's MMF account"""
    mmf = await db.mmf_accounts.find_one({"user_id": user_id}, {"_id": 0})
    if not mmf:
        raise HTTPException(status_code=404, detail="MMF account not found")
    
    holds = mmf.get("holds", [])
    active_holds = [h for h in holds if h.get("status") == "active"]
    
    return {
        "holds": holds,
        "active_holds": active_holds,
        "total_withheld": mmf.get("withheld_amount", 0),
        "actual_balance": mmf.get("balance", 0),
        "available_balance": mmf.get("balance", 0) - mmf.get("withheld_amount", 0)
    }

# ================== ADMIN LOCK SAVINGS HOLD MANAGEMENT ==================

@api_router.post("/admin/savings/hold")
async def admin_add_savings_hold(data: AdminLockSavingsHold, admin: dict = Depends(get_admin_user)):
    """Add a hold on a lock savings account (reduce available balance)"""
    savings = await db.lock_savings.find_one({"id": data.savings_id})
    if not savings:
        raise HTTPException(status_code=404, detail="Lock savings not found")
    
    if savings.get("status") != "active":
        raise HTTPException(status_code=400, detail="Can only add holds to active savings")
    
    # Check if there's enough balance to hold
    actual_value = savings.get("current_value", savings.get("amount", 0))
    current_withheld = savings.get("withheld_amount", 0)
    available = actual_value - current_withheld
    
    if data.amount > available:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot hold KES {data.amount:,.2f}. Available savings value is only KES {available:,.2f}"
        )
    
    now = datetime.now(timezone.utc)
    user_id = savings.get("user_id")
    
    # Create hold record
    hold_record = {
        "id": str(uuid.uuid4()),
        "amount": data.amount,
        "hold_type": data.hold_type,
        "reason": data.reason,
        "created_by": admin["user_id"],
        "created_at": now.isoformat(),
        "status": "active"
    }
    
    # Update savings with new hold
    await db.lock_savings.update_one(
        {"id": data.savings_id},
        {
            "$inc": {"withheld_amount": data.amount},
            "$push": {"holds": hold_record}
        }
    )
    
    # Get updated savings
    updated_savings = await db.lock_savings.find_one({"id": data.savings_id})
    new_available = updated_savings.get("current_value", updated_savings.get("amount", 0)) - updated_savings.get("withheld_amount", 0)
    
    # Create transaction record
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "savings_hold",
        "amount": data.amount,
        "description": f"Savings hold: {data.reason}",
        "hold_type": data.hold_type,
        "hold_id": hold_record["id"],
        "savings_id": data.savings_id,
        "source": "admin_savings_hold",
        "admin_id": admin["user_id"],
        "balance_after": updated_savings.get("current_value", 0),
        "available_after": new_available,
        "created_at": now.isoformat(),
    })
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "savings_hold_added",
        "entity_type": "lock_savings",
        "entity_id": data.savings_id,
        "user_id": user_id,
        "admin_id": admin["user_id"],
        "amount": data.amount,
        "details": f"Savings Hold added: {data.hold_type} - {data.reason}",
        "created_at": now.isoformat(),
    })
    
    # Notification to user
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "savings",
        "title": f"Savings Balance Hold",
        "message": f"KES {data.amount:,.2f} has been placed on hold in your Lock Savings. Reason: {data.reason}. Available value is now KES {new_available:,.2f}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {
        "success": True,
        "message": f"Savings hold of KES {data.amount:,.2f} added successfully",
        "hold": hold_record,
        "new_available_balance": new_available,
        "new_withheld_amount": updated_savings.get("withheld_amount", 0)
    }

@api_router.post("/admin/savings/release-hold")
async def admin_release_savings_hold(data: AdminReleaseSavingsHold, admin: dict = Depends(get_admin_user)):
    """Release or deduct a hold from lock savings"""
    savings = await db.lock_savings.find_one({"id": data.savings_id})
    if not savings:
        raise HTTPException(status_code=404, detail="Lock savings not found")
    
    # Find the hold
    holds = savings.get("holds", [])
    hold = next((h for h in holds if h.get("id") == data.hold_id and h.get("status") == "active"), None)
    
    if not hold:
        raise HTTPException(status_code=404, detail="Active hold not found")
    
    hold_amount = hold.get("amount", 0)
    now = datetime.now(timezone.utc)
    user_id = savings.get("user_id")
    
    if data.action == "release":
        # Just release the hold, make balance available again
        await db.lock_savings.update_one(
            {"id": data.savings_id, "holds.id": data.hold_id},
            {
                "$inc": {"withheld_amount": -hold_amount},
                "$set": {"holds.$.status": "released", "holds.$.released_at": now.isoformat()}
            }
        )
        action_desc = f"released KES {hold_amount:,.2f} back to available balance"
    else:  # deduct
        # Deduct from current_value and release hold
        await db.lock_savings.update_one(
            {"id": data.savings_id, "holds.id": data.hold_id},
            {
                "$inc": {"current_value": -hold_amount, "withheld_amount": -hold_amount},
                "$set": {"holds.$.status": "deducted", "holds.$.deducted_at": now.isoformat()}
            }
        )
        action_desc = f"deducted KES {hold_amount:,.2f} from savings"
    
    updated_savings = await db.lock_savings.find_one({"id": data.savings_id})
    new_available = updated_savings.get("current_value", updated_savings.get("amount", 0)) - updated_savings.get("withheld_amount", 0)
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "savings",
        "title": f"Savings Hold {'Released' if data.action == 'release' else 'Deducted'}",
        "message": f"Savings hold of KES {hold_amount:,.2f} has been {data.action}d. Reason: {hold.get('reason', 'N/A')}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {
        "success": True,
        "message": f"Savings hold {action_desc}",
        "amount": hold_amount,
        "new_current_value": updated_savings.get("current_value", 0),
        "new_available_balance": new_available,
        "new_withheld_amount": updated_savings.get("withheld_amount", 0)
    }

@api_router.get("/admin/savings/{savings_id}/holds")
async def admin_get_savings_holds(savings_id: str, admin: dict = Depends(get_admin_user)):
    """Get all holds on a lock savings account"""
    savings = await db.lock_savings.find_one({"id": savings_id}, {"_id": 0})
    if not savings:
        raise HTTPException(status_code=404, detail="Lock savings not found")
    
    holds = savings.get("holds", [])
    active_holds = [h for h in holds if h.get("status") == "active"]
    actual_value = savings.get("current_value", savings.get("amount", 0))
    
    return {
        "holds": holds,
        "active_holds": active_holds,
        "total_withheld": savings.get("withheld_amount", 0),
        "actual_value": actual_value,
        "available_balance": actual_value - savings.get("withheld_amount", 0)
    }

# ================== ADMIN FEE RULES MANAGEMENT ==================

@api_router.get("/fee-rules/calculate")
async def calculate_fee_preview(transaction_type: str, amount: float):
    """Calculate fee for a transaction - Public endpoint for preview"""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    fee_info = await calculate_transaction_fee(transaction_type, amount)
    return fee_info

@api_router.get("/admin/fee-rules")
async def admin_get_fee_rules(admin: dict = Depends(get_admin_user)):
    """Get all fee rules - Admin only"""
    rules = await db.fee_rules.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Get statistics for each rule
    for rule in rules:
        # Count how many times this rule has been applied
        applied_count = await db.transactions.count_documents({"applied_fee_rules": rule.get("id")})
        rule["applied_count"] = applied_count
    
    return {"rules": [serialize_doc(r) for r in rules]}

@api_router.post("/admin/fee-rules")
async def admin_create_fee_rule(data: FeeRuleCreate, admin: dict = Depends(get_admin_user)):
    """Create a new fee rule - Admin only"""
    now = datetime.now(timezone.utc)
    
    # Validate based on fee type
    if data.fee_type == "percentage" and data.percentage_rate is None:
        raise HTTPException(status_code=400, detail="Percentage rate is required for percentage fee type")
    if data.fee_type == "flat" and data.flat_amount is None:
        raise HTTPException(status_code=400, detail="Flat amount is required for flat fee type")
    if data.fee_type == "tiered" and (not data.tiers or len(data.tiers) == 0):
        raise HTTPException(status_code=400, detail="Tiers are required for tiered fee type")
    
    rule_doc = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "description": data.description,
        "transaction_type": data.transaction_type,
        "fee_type": data.fee_type,
        "percentage_rate": data.percentage_rate,
        "flat_amount": data.flat_amount,
        "tiers": data.tiers,
        "min_fee": data.min_fee,
        "max_fee": data.max_fee,
        "min_transaction_amount": data.min_transaction_amount,
        "max_transaction_amount": data.max_transaction_amount,
        "is_active": data.is_active,
        "created_by": admin["user_id"],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.fee_rules.insert_one(rule_doc)
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "fee_rule_created",
        "entity_type": "fee_rule",
        "entity_id": rule_doc["id"],
        "admin_id": admin["user_id"],
        "details": f"Created fee rule: {data.name} ({data.fee_type} for {data.transaction_type})",
        "created_at": now.isoformat(),
    })
    
    return {"success": True, "message": "Fee rule created", "rule": serialize_doc(rule_doc)}

@api_router.put("/admin/fee-rules/{rule_id}")
async def admin_update_fee_rule(rule_id: str, data: FeeRuleUpdate, admin: dict = Depends(get_admin_user)):
    """Update a fee rule - Admin only"""
    rule = await db.fee_rules.find_one({"id": rule_id})
    if not rule:
        raise HTTPException(status_code=404, detail="Fee rule not found")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = admin["user_id"]
    
    await db.fee_rules.update_one({"id": rule_id}, {"$set": update_data})
    
    updated = await db.fee_rules.find_one({"id": rule_id}, {"_id": 0})
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "fee_rule_updated",
        "entity_type": "fee_rule",
        "entity_id": rule_id,
        "admin_id": admin["user_id"],
        "details": f"Updated fee rule: {updated.get('name')}",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    
    return {"success": True, "message": "Fee rule updated", "rule": serialize_doc(updated)}

@api_router.delete("/admin/fee-rules/{rule_id}")
async def admin_delete_fee_rule(rule_id: str, admin: dict = Depends(get_admin_user)):
    """Delete a fee rule - Admin only"""
    rule = await db.fee_rules.find_one({"id": rule_id})
    if not rule:
        raise HTTPException(status_code=404, detail="Fee rule not found")
    
    await db.fee_rules.delete_one({"id": rule_id})
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "fee_rule_deleted",
        "entity_type": "fee_rule",
        "entity_id": rule_id,
        "admin_id": admin["user_id"],
        "details": f"Deleted fee rule: {rule.get('name')}",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    
    return {"success": True, "message": "Fee rule deleted"}

@api_router.put("/admin/fee-rules/{rule_id}/toggle")
async def admin_toggle_fee_rule(rule_id: str, admin: dict = Depends(get_admin_user)):
    """Toggle fee rule active status - Admin only"""
    rule = await db.fee_rules.find_one({"id": rule_id})
    if not rule:
        raise HTTPException(status_code=404, detail="Fee rule not found")
    
    new_status = not rule.get("is_active", True)
    await db.fee_rules.update_one(
        {"id": rule_id},
        {"$set": {"is_active": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"success": True, "message": f"Fee rule {'activated' if new_status else 'deactivated'}", "is_active": new_status}

# ================== ADMIN PAYBILL CONFIGURATION ==================

@api_router.get("/admin/paybill")
async def get_paybill(admin: dict = Depends(get_admin_user)):
    """Get current MPESA Paybill configuration"""
    config = await db.system_config.find_one({"key": "mpesa_paybill"}, {"_id": 0})
    return {
        "paybill_number": config.get("value", "4114517") if config else "4114517",
        "updated_at": config.get("updated_at") if config else None
    }

@api_router.put("/admin/paybill")
async def update_paybill(data: PaybillConfig, admin: dict = Depends(get_admin_user)):
    """Update MPESA Paybill number"""
    now = datetime.now(timezone.utc)
    
    await db.system_config.update_one(
        {"key": "mpesa_paybill"},
        {
            "$set": {
                "key": "mpesa_paybill",
                "value": data.paybill_number,
                "updated_by": admin["user_id"],
                "updated_at": now.isoformat()
            }
        },
        upsert=True
    )
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "paybill_updated",
        "entity_type": "system_config",
        "entity_id": "mpesa_paybill",
        "admin_id": admin["user_id"],
        "details": f"Paybill updated to {data.paybill_number}",
        "created_at": now.isoformat(),
    })
    
    return {"success": True, "message": f"Paybill updated to {data.paybill_number}"}

# ================== ADMIN AUDIT LOGS ==================

@api_router.get("/admin/audit-logs")
async def get_audit_logs(
    admin: dict = Depends(get_admin_user),
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
):
    """Get audit logs"""
    query = {}
    if action:
        query["action"] = action
    if entity_type:
        query["entity_type"] = entity_type
    
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.audit_logs.count_documents(query)
    return {"logs": [serialize_doc(log) for log in logs], "total": total}

# ================== SYSTEM SETTINGS MANAGEMENT ==================

@api_router.get("/system/settings")
async def get_public_system_settings():
    """Get public system settings (deposit/withdrawal modes) - No auth required"""
    settings = await get_system_settings()
    return {
        "deposit_mode": settings["deposit_mode"],
        "withdrawal_mode": settings["withdrawal_mode"],
        "mpesa_paybill": settings["mpesa_paybill"],
        "kyc_email": settings["kyc_email"],
        "otp_verification_enabled": settings["otp_verification_enabled"],
        "lock_savings_early_withdrawal_penalty": settings["lock_savings_early_withdrawal_penalty"]
    }

@api_router.get("/admin/system-settings")
async def get_admin_system_settings(admin: dict = Depends(get_admin_user)):
    """Get full system settings for admin"""
    settings = await get_system_settings()
    
    # Get the system_settings document to include metadata
    settings_doc = await db.system_config.find_one({"key": "system_settings"})
    
    return {
        "settings": settings,
        "updated_by": settings_doc.get("updated_by") if settings_doc else None,
        "updated_at": settings_doc.get("updated_at") if settings_doc else None,
        "admin_role": admin.get("role", "admin")
    }

@api_router.put("/admin/system-settings")
async def update_system_settings(data: SystemSettingsUpdate, admin: dict = Depends(get_super_admin)):
    """Update system settings - SUPER_ADMIN only"""
    now = datetime.now(timezone.utc)
    
    # Get current settings
    current_settings = await get_system_settings()
    
    # Build update dict and log changes
    update_dict = {
        "key": "system_settings",
        "updated_by": admin["user_id"],
        "updated_at": now.isoformat()
    }
    
    changes_made = []
    
    if data.deposit_mode and data.deposit_mode != current_settings["deposit_mode"]:
        await log_config_change(admin["user_id"], "deposit_mode", current_settings["deposit_mode"], data.deposit_mode)
        update_dict["deposit_mode"] = data.deposit_mode
        changes_made.append(f"deposit_mode: {current_settings['deposit_mode']} → {data.deposit_mode}")
    else:
        update_dict["deposit_mode"] = current_settings["deposit_mode"]
    
    if data.withdrawal_mode and data.withdrawal_mode != current_settings["withdrawal_mode"]:
        await log_config_change(admin["user_id"], "withdrawal_mode", current_settings["withdrawal_mode"], data.withdrawal_mode)
        update_dict["withdrawal_mode"] = data.withdrawal_mode
        changes_made.append(f"withdrawal_mode: {current_settings['withdrawal_mode']} → {data.withdrawal_mode}")
    else:
        update_dict["withdrawal_mode"] = current_settings["withdrawal_mode"]
    
    if data.mpesa_paybill and data.mpesa_paybill != current_settings["mpesa_paybill"]:
        await log_config_change(admin["user_id"], "mpesa_paybill", current_settings["mpesa_paybill"], data.mpesa_paybill)
        update_dict["mpesa_paybill"] = data.mpesa_paybill
        changes_made.append(f"mpesa_paybill: {current_settings['mpesa_paybill']} → {data.mpesa_paybill}")
    else:
        update_dict["mpesa_paybill"] = current_settings["mpesa_paybill"]
    
    if data.kyc_email and data.kyc_email != current_settings["kyc_email"]:
        await log_config_change(admin["user_id"], "kyc_email", current_settings["kyc_email"], data.kyc_email)
        update_dict["kyc_email"] = data.kyc_email
        changes_made.append(f"kyc_email: {current_settings['kyc_email']} → {data.kyc_email}")
    else:
        update_dict["kyc_email"] = current_settings["kyc_email"]
    
    # Handle OTP verification setting
    if data.otp_verification_enabled is not None and data.otp_verification_enabled != current_settings["otp_verification_enabled"]:
        old_value = "enabled" if current_settings["otp_verification_enabled"] else "disabled"
        new_value = "enabled" if data.otp_verification_enabled else "disabled"
        await log_config_change(admin["user_id"], "otp_verification_enabled", old_value, new_value)
        update_dict["otp_verification_enabled"] = data.otp_verification_enabled
        changes_made.append(f"otp_verification: {old_value} → {new_value}")
    else:
        update_dict["otp_verification_enabled"] = current_settings["otp_verification_enabled"]
    
    # Handle lock savings early withdrawal penalty
    if data.lock_savings_early_withdrawal_penalty is not None and data.lock_savings_early_withdrawal_penalty != current_settings["lock_savings_early_withdrawal_penalty"]:
        old_value = str(current_settings["lock_savings_early_withdrawal_penalty"])
        new_value = str(data.lock_savings_early_withdrawal_penalty)
        await log_config_change(admin["user_id"], "lock_savings_early_withdrawal_penalty", old_value, new_value)
        update_dict["lock_savings_early_withdrawal_penalty"] = data.lock_savings_early_withdrawal_penalty
        changes_made.append(f"lock_savings_early_withdrawal_penalty: {old_value}% → {new_value}%")
    else:
        update_dict["lock_savings_early_withdrawal_penalty"] = current_settings["lock_savings_early_withdrawal_penalty"]
    
    # Update database
    await db.system_config.update_one(
        {"key": "system_settings"},
        {"$set": update_dict},
        upsert=True
    )
    
    # Create audit log
    if changes_made:
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "action": "system_settings_updated",
            "entity_type": "system_config",
            "entity_id": "system_settings",
            "admin_id": admin["user_id"],
            "details": "; ".join(changes_made),
            "created_at": now.isoformat(),
        })
    
    return {
        "success": True,
        "message": "System settings updated" if changes_made else "No changes made",
        "changes": changes_made,
        "settings": await get_system_settings()
    }

@api_router.get("/admin/config-logs")
async def get_config_change_logs(
    admin: dict = Depends(get_admin_user),
    setting_name: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
):
    """Get configuration change history"""
    query = {}
    if setting_name:
        query["setting_name"] = setting_name
    
    logs = await db.config_change_logs.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.config_change_logs.count_documents(query)
    
    # Enrich with admin names
    enriched_logs = []
    for log in logs:
        admin_user = await db.admin_users.find_one({"id": log.get("admin_id")}, {"name": 1, "email": 1})
        enriched_log = serialize_doc(log)
        enriched_log["admin_name"] = admin_user.get("name") if admin_user else "Unknown"
        enriched_log["admin_email"] = admin_user.get("email") if admin_user else "Unknown"
        enriched_logs.append(enriched_log)
    
    return {"logs": enriched_logs, "total": total}

# ================== ADMIN ROLE MANAGEMENT ==================

@api_router.put("/admin/admins/{admin_id}/role")
async def update_admin_role(admin_id: str, data: AdminRoleUpdate, admin: dict = Depends(get_super_admin)):
    """Update admin role - SUPER_ADMIN only"""
    if admin_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    
    target_admin = await db.admin_users.find_one({"id": admin_id})
    if not target_admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    now = datetime.now(timezone.utc)
    old_role = target_admin.get("role", "admin")
    
    await db.admin_users.update_one(
        {"id": admin_id},
        {"$set": {"role": data.role, "role_updated_at": now.isoformat(), "role_updated_by": admin["user_id"]}}
    )
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "admin_role_updated",
        "entity_type": "admin_user",
        "entity_id": admin_id,
        "admin_id": admin["user_id"],
        "details": f"Admin role changed from '{old_role}' to '{data.role}'",
        "created_at": now.isoformat(),
    })
    
    return {"success": True, "message": f"Admin role updated to {data.role}"}

@api_router.get("/admin/admins")
async def get_all_admins(admin: dict = Depends(get_super_admin)):
    """Get all admin users - SUPER_ADMIN only"""
    admins = await db.admin_users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
    return [serialize_doc(a) for a in admins]

@api_router.post("/admin/admins/create")
async def create_admin_by_super(data: AdminCreate, admin: dict = Depends(get_super_admin)):
    """Create new admin - SUPER_ADMIN only"""
    # Check if email already exists
    existing = await db.admin_users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Admin with this email already exists")
    
    now = datetime.now(timezone.utc)
    admin_doc = {
        "id": str(uuid.uuid4()),
        "email": data.email.lower(),
        "password_hash": hash_pin(data.password),
        "name": data.name,
        "role": "admin",  # New admins start as regular admin
        "created_at": now.isoformat(),
        "created_by": admin["user_id"]
    }
    
    await db.admin_users.insert_one(admin_doc)
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "admin_created",
        "entity_type": "admin_user",
        "entity_id": admin_doc["id"],
        "admin_id": admin["user_id"],
        "details": f"New admin created: {data.email}",
        "created_at": now.isoformat(),
    })
    
    return {"success": True, "message": "Admin created", "admin_id": admin_doc["id"]}

# ================== STK PUSH DEPOSIT (STUBBED) ==================

@api_router.post("/mpesa/stk-push")
async def initiate_stk_push(data: STKPushRequest, current_user: dict = Depends(get_current_user)):
    """Initiate MPESA STK Push request (STUBBED - for future integration)"""
    user_id = current_user["user_id"]
    
    # Check if STK push mode is enabled
    settings = await get_system_settings()
    if settings["deposit_mode"] != "stk_push":
        raise HTTPException(status_code=400, detail="STK Push deposits are not currently enabled")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    now = datetime.now(timezone.utc)
    
    # Generate a mock checkout request ID
    checkout_request_id = f"ws_CO_{uuid.uuid4().hex[:20].upper()}"
    
    # Create STK push request record
    stk_request = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_phone": user.get("phone"),
        "user_name": user.get("name"),
        "amount": data.amount,
        "phone_number": normalize_phone(data.phone_number),
        "checkout_request_id": checkout_request_id,
        "status": "pending",  # pending, processing, completed, failed, cancelled
        "mpesa_receipt": None,
        "result_desc": None,
        "created_at": now.isoformat(),
        "completed_at": None
    }
    
    await db.stk_push_requests.insert_one(stk_request)
    
    # In production, this would call the MPESA API
    # For now, we simulate the STK push initiation
    logger.info(f"STK Push initiated for {data.phone_number}, Amount: {data.amount}, CheckoutID: {checkout_request_id}")
    
    # Create notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "deposit",
        "title": "STK Push Initiated",
        "message": f"Please check your phone ({data.phone_number}) to complete the payment of KES {data.amount:,.2f}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {
        "success": True,
        "message": "STK Push initiated. Please check your phone to complete the payment.",
        "checkout_request_id": checkout_request_id,
        "request_id": stk_request["id"],
        "note": "STUBBED - In production, an actual MPESA STK push would be sent"
    }

@api_router.post("/mpesa/stk-callback")
async def mpesa_stk_callback(request_data: dict):
    """MPESA STK Push callback handler (STUBBED)
    In production, this would be called by MPESA with the transaction result
    """
    # This is a stub - in production, verify the callback signature
    body = request_data.get("Body", {})
    stkCallback = body.get("stkCallback", {})
    
    checkout_request_id = stkCallback.get("CheckoutRequestID")
    result_code = stkCallback.get("ResultCode")
    result_desc = stkCallback.get("ResultDesc")
    
    if not checkout_request_id:
        return {"ResultCode": 1, "ResultDesc": "Missing CheckoutRequestID"}
    
    stk_request = await db.stk_push_requests.find_one({"checkout_request_id": checkout_request_id})
    if not stk_request:
        return {"ResultCode": 1, "ResultDesc": "Request not found"}
    
    now = datetime.now(timezone.utc)
    
    if result_code == 0:
        # Transaction successful
        callback_metadata = stkCallback.get("CallbackMetadata", {}).get("Item", [])
        mpesa_receipt = None
        for item in callback_metadata:
            if item.get("Name") == "MpesaReceiptNumber":
                mpesa_receipt = item.get("Value")
                break
        
        # Update STK request status
        await db.stk_push_requests.update_one(
            {"checkout_request_id": checkout_request_id},
            {"$set": {
                "status": "completed",
                "mpesa_receipt": mpesa_receipt,
                "result_desc": result_desc,
                "completed_at": now.isoformat()
            }}
        )
        
        # Credit user wallet
        await db.wallets.update_one(
            {"user_id": stk_request["user_id"]},
            {"$inc": {"balance": stk_request["amount"]}}
        )
        
        # Create transaction record
        wallet = await db.wallets.find_one({"user_id": stk_request["user_id"]})
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": stk_request["user_id"],
            "type": "stk_push_deposit",
            "amount": stk_request["amount"],
            "description": f"MPESA STK Push Deposit (Ref: {mpesa_receipt})",
            "source": "mpesa_stk",
            "reference": mpesa_receipt,
            "checkout_request_id": checkout_request_id,
            "balance_after": wallet["balance"],
            "created_at": now.isoformat(),
        })
        
        # Audit log
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "action": "stk_push_completed",
            "entity_type": "stk_push_request",
            "entity_id": stk_request["id"],
            "user_id": stk_request["user_id"],
            "amount": stk_request["amount"],
            "details": f"STK Push deposit completed. Receipt: {mpesa_receipt}",
            "created_at": now.isoformat(),
        })
        
        # Notification
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": stk_request["user_id"],
            "type": "deposit",
            "title": "Deposit Successful",
            "message": f"Your MPESA deposit of KES {stk_request['amount']:,.2f} has been credited to your wallet. Receipt: {mpesa_receipt}",
            "read": False,
            "created_at": now.isoformat(),
        })
    else:
        # Transaction failed
        await db.stk_push_requests.update_one(
            {"checkout_request_id": checkout_request_id},
            {"$set": {
                "status": "failed",
                "result_desc": result_desc,
                "completed_at": now.isoformat()
            }}
        )
        
        # Notification
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": stk_request["user_id"],
            "type": "deposit",
            "title": "Deposit Failed",
            "message": f"Your MPESA deposit of KES {stk_request['amount']:,.2f} failed. Reason: {result_desc}",
            "read": False,
            "created_at": now.isoformat(),
        })
    
    return {"ResultCode": 0, "ResultDesc": "Callback processed"}

@api_router.get("/mpesa/stk-status/{request_id}")
async def get_stk_push_status(request_id: str, current_user: dict = Depends(get_current_user)):
    """Get STK Push request status"""
    stk_request = await db.stk_push_requests.find_one({
        "id": request_id,
        "user_id": current_user["user_id"]
    }, {"_id": 0})
    
    if not stk_request:
        raise HTTPException(status_code=404, detail="STK Push request not found")
    
    return serialize_doc(stk_request)

@api_router.get("/mpesa/stk-requests")
async def get_my_stk_requests(current_user: dict = Depends(get_current_user)):
    """Get user's STK Push request history"""
    requests = await db.stk_push_requests.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return [serialize_doc(r) for r in requests]

# ================== ADMIN STK PUSH MANAGEMENT ==================

@api_router.get("/admin/stk-requests")
async def get_all_stk_requests(
    admin: dict = Depends(get_admin_user),
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
):
    """Get all STK Push requests"""
    query = {}
    if status:
        query["status"] = status
    
    requests = await db.stk_push_requests.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.stk_push_requests.count_documents(query)
    return {"requests": [serialize_doc(r) for r in requests], "total": total}

@api_router.post("/admin/stk-requests/{request_id}/simulate-success")
async def simulate_stk_success(request_id: str, admin: dict = Depends(get_admin_user)):
    """Simulate successful STK Push callback - FOR TESTING ONLY"""
    stk_request = await db.stk_push_requests.find_one({"id": request_id})
    if not stk_request:
        raise HTTPException(status_code=404, detail="STK request not found")
    
    if stk_request["status"] != "pending":
        raise HTTPException(status_code=400, detail="Request already processed")
    
    now = datetime.now(timezone.utc)
    mock_receipt = f"SIM{uuid.uuid4().hex[:10].upper()}"
    
    # Update request status
    await db.stk_push_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "completed",
            "mpesa_receipt": mock_receipt,
            "result_desc": "Simulated success by admin",
            "completed_at": now.isoformat()
        }}
    )
    
    # Credit wallet
    await db.wallets.update_one(
        {"user_id": stk_request["user_id"]},
        {"$inc": {"balance": stk_request["amount"]}}
    )
    
    # Create transaction
    wallet = await db.wallets.find_one({"user_id": stk_request["user_id"]})
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": stk_request["user_id"],
        "type": "stk_push_deposit",
        "amount": stk_request["amount"],
        "description": f"MPESA STK Push Deposit (Ref: {mock_receipt}) [SIMULATED]",
        "source": "mpesa_stk",
        "reference": mock_receipt,
        "checkout_request_id": stk_request["checkout_request_id"],
        "balance_after": wallet["balance"],
        "created_at": now.isoformat(),
    })
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "stk_push_simulated",
        "entity_type": "stk_push_request",
        "entity_id": request_id,
        "user_id": stk_request["user_id"],
        "admin_id": admin["user_id"],
        "amount": stk_request["amount"],
        "details": f"STK Push simulated success by admin. Mock Receipt: {mock_receipt}",
        "created_at": now.isoformat(),
    })
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": stk_request["user_id"],
        "type": "deposit",
        "title": "Deposit Successful",
        "message": f"Your MPESA deposit of KES {stk_request['amount']:,.2f} has been credited. Receipt: {mock_receipt}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    return {"success": True, "message": "STK Push success simulated", "receipt": mock_receipt}

# ================== AUTOMATIC WITHDRAWAL PROCESSING (MPESA B2C READY) ==================

@api_router.post("/admin/withdrawals/{withdrawal_id}/process-auto")
async def process_automatic_withdrawal(withdrawal_id: str, admin: dict = Depends(get_admin_user)):
    """
    Process withdrawal automatically via MPESA B2C or bank transfer.
    
    M-PESA B2C Integration Ready Structure:
    =======================================
    When you have M-Pesa B2C credentials (Safaricom Daraja API), replace the 
    simulation block below with actual B2C API call:
    
    1. Get OAuth Token:
       auth_url = "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
       auth_response = requests.get(auth_url, auth=(CONSUMER_KEY, CONSUMER_SECRET))
       access_token = auth_response.json().get("access_token")
    
    2. Generate Security Credential:
       - Download certificate from Daraja portal
       - Encrypt initiator password with certificate using M2Crypto or OpenSSL
    
    3. Call B2C API:
       b2c_url = "https://api.safaricom.co.ke/mpesa/b2c/v3/paymentrequest"
       payload = {
           "OriginatorConversationID": unique_id,
           "InitiatorName": os.getenv("MPESA_B2C_INITIATOR"),
           "SecurityCredential": encrypted_credential,
           "CommandID": "BusinessPayment",  # or SalaryPayment, PromotionPayment
           "Amount": withdrawal_amount,
           "PartyA": os.getenv("MPESA_B2C_SHORTCODE"),
           "PartyB": destination_phone,  # 254XXXXXXXXX format
           "Remarks": "Wallet withdrawal",
           "QueueTimeOutURL": f"{BACKEND_URL}/api/mpesa/b2c/timeout",
           "ResultURL": f"{BACKEND_URL}/api/mpesa/b2c/result",
           "Occasion": "Withdrawal"
       }
    
    4. Store ConversationID from response for tracking
    5. Update withdrawal status to "processing"
    6. Wait for callback to confirm success/failure
    """
    settings = await get_system_settings()
    if settings["withdrawal_mode"] != "automatic":
        raise HTTPException(status_code=400, detail="Automatic withdrawals are not enabled")
    
    withdrawal = await db.withdrawals.find_one({"id": withdrawal_id})
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    
    if withdrawal["status"] not in ["pending", "approved"]:
        raise HTTPException(status_code=400, detail="Withdrawal cannot be processed")
    
    # Verify PIN was verified during withdrawal request
    if not withdrawal.get("pin_verified"):
        raise HTTPException(status_code=400, detail="PIN verification required for this withdrawal")
    
    # Check wallet balance
    wallet = await db.wallets.find_one({"user_id": withdrawal["user_id"]})
    if wallet["balance"] < withdrawal["amount"]:
        raise HTTPException(status_code=400, detail="Insufficient user balance")
    
    now = datetime.now(timezone.utc)
    
    # Generate unique originator conversation ID for M-Pesa B2C tracking
    originator_conversation_id = f"DOLA{uuid.uuid4().hex[:16].upper()}"
    
    # If still pending, first approve and deduct balance
    if withdrawal["status"] == "pending":
        await db.wallets.update_one(
            {"user_id": withdrawal["user_id"]},
            {"$inc": {"balance": -withdrawal["amount"]}}
        )
    
    # ================================================
    # M-PESA B2C API INTEGRATION POINT
    # ================================================
    # TODO: Replace this simulation block with actual M-Pesa B2C API call
    # when B2C credentials are available
    #
    # Required Environment Variables:
    # - MPESA_B2C_CONSUMER_KEY
    # - MPESA_B2C_CONSUMER_SECRET
    # - MPESA_B2C_SHORTCODE
    # - MPESA_B2C_INITIATOR
    # - MPESA_B2C_SECURITY_CREDENTIAL
    # - MPESA_B2C_RESULT_URL
    # - MPESA_B2C_TIMEOUT_URL
    #
    # Example B2C API call:
    # b2c_response = await initiate_mpesa_b2c(
    #     phone=withdrawal["destination_phone"],
    #     amount=withdrawal["net_amount"],
    #     reference=originator_conversation_id
    # )
    # ================================================
    
    # SIMULATION: Generate mock transaction ID
    mock_mpesa_transaction_id = f"B2C{uuid.uuid4().hex[:12].upper()}"
    mock_conversation_id = f"AG_20{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"
    
    # Update withdrawal status to paid (in production, set to "processing" and wait for callback)
    await db.withdrawals.update_one(
        {"id": withdrawal_id},
        {"$set": {
            "status": "paid",  # In production: "processing" until B2C callback confirms
            "auto_processed": True,
            "mpesa_originator_conversation_id": originator_conversation_id,
            "mpesa_conversation_id": mock_conversation_id,
            "mpesa_transaction_id": mock_mpesa_transaction_id,
            "mpesa_result_code": 0,  # 0 = Success
            "mpesa_result_description": "SIMULATED: Transaction successful",
            "reviewed_by": admin["user_id"],
            "reviewed_at": now.isoformat(),
            "paid_at": now.isoformat()
        }}
    )
    
    # Create transaction record
    updated_wallet = await db.wallets.find_one({"user_id": withdrawal["user_id"]})
    destination = withdrawal.get("destination_phone") or f"{withdrawal.get('bank_name')} - {withdrawal.get('bank_account')}"
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": withdrawal["user_id"],
        "type": "withdrawal",
        "amount": withdrawal["amount"],
        "fee_amount": withdrawal.get("fee_amount", 0),
        "net_amount": withdrawal.get("net_amount", withdrawal["amount"]),
        "description": f"M-Pesa B2C Withdrawal to {destination}",
        "destination": destination,
        "mpesa_transaction_id": mock_mpesa_transaction_id,
        "mpesa_conversation_id": mock_conversation_id,
        "balance_after": updated_wallet["balance"],
        "created_at": now.isoformat(),
    })
    
    # Audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "withdrawal_b2c_processed",
        "entity_type": "withdrawal",
        "entity_id": withdrawal_id,
        "user_id": withdrawal["user_id"],
        "admin_id": admin["user_id"],
        "amount": withdrawal["amount"],
        "net_amount": withdrawal.get("net_amount"),
        "destination_phone": withdrawal.get("destination_phone"),
        "mpesa_transaction_id": mock_mpesa_transaction_id,
        "details": f"M-Pesa B2C withdrawal processed. Ref: {mock_mpesa_transaction_id} [SIMULATED]",
        "created_at": now.isoformat(),
    })
    
    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": withdrawal["user_id"],
        "type": "withdrawal",
        "title": "Withdrawal Sent to M-Pesa",
        "message": f"KES {withdrawal.get('net_amount', withdrawal['amount']):,.2f} has been sent to {withdrawal.get('destination_phone')}. M-Pesa Ref: {mock_mpesa_transaction_id}",
        "read": False,
        "created_at": now.isoformat(),
    })
    
    # Send SMS notification for admin-processed B2C withdrawal
    user = await db.users.find_one({"id": withdrawal["user_id"]})
    if user and user.get("phone"):
        send_withdrawal_notification(
            phone=user["phone"],
            amount=withdrawal.get("net_amount", withdrawal["amount"]),
            balance=updated_wallet["balance"],
            destination=withdrawal.get("destination_phone")
        )
    
    return {
        "success": True,
        "message": "M-Pesa B2C withdrawal processed successfully",
        "withdrawal_id": withdrawal_id,
        "mpesa_transaction_id": mock_mpesa_transaction_id,
        "mpesa_conversation_id": mock_conversation_id,
        "amount": withdrawal["amount"],
        "net_amount": withdrawal.get("net_amount"),
        "destination_phone": withdrawal.get("destination_phone"),
        "note": "SIMULATED - In production, actual M-PESA B2C API would be called"
    }

# ================== M-PESA B2C CALLBACK ENDPOINTS ==================

@api_router.post("/mpesa/b2c/result")
async def mpesa_b2c_result_callback(request: Request):
    """
    M-Pesa B2C Result Callback
    
    This endpoint receives the final result from M-Pesa after B2C transaction.
    Safaricom will POST to this URL with the transaction result.
    
    Expected payload structure:
    {
        "Result": {
            "ResultType": 0,
            "ResultCode": 0,  # 0 = Success
            "ResultDesc": "The service request is processed successfully.",
            "OriginatorConversationID": "...",
            "ConversationID": "AG_...",
            "TransactionID": "OGX...",
            "ResultParameters": {
                "ResultParameter": [
                    {"Key": "TransactionAmount", "Value": 500},
                    {"Key": "TransactionReceipt", "Value": "OGX..."},
                    {"Key": "B2CRecipientIsRegisteredCustomer", "Value": "Y"},
                    {"Key": "B2CChargesPaidAccountAvailableFunds", "Value": 1000},
                    {"Key": "ReceiverPartyPublicName", "Value": "254..."},
                    {"Key": "TransactionCompletedDateTime", "Value": "..."},
                    {"Key": "B2CUtilityAccountAvailableFunds", "Value": 500},
                    {"Key": "B2CWorkingAccountAvailableFunds", "Value": 500}
                ]
            }
        }
    }
    """
    try:
        body = await request.json()
        logger.info(f"M-Pesa B2C Result Callback: {body}")
        
        result = body.get("Result", {})
        result_code = result.get("ResultCode")
        result_desc = result.get("ResultDesc")
        conversation_id = result.get("ConversationID")
        originator_conversation_id = result.get("OriginatorConversationID")
        transaction_id = result.get("TransactionID")
        
        # Find the withdrawal by conversation ID
        withdrawal = await db.withdrawals.find_one({
            "$or": [
                {"mpesa_conversation_id": conversation_id},
                {"mpesa_originator_conversation_id": originator_conversation_id}
            ]
        })
        
        if not withdrawal:
            logger.warning(f"B2C callback: Withdrawal not found for ConversationID: {conversation_id}")
            return {"ResultCode": 0, "ResultDesc": "Accepted"}
        
        now = datetime.now(timezone.utc)
        new_status = "paid" if result_code == 0 else "failed"
        
        # Extract result parameters
        result_params = {}
        if result.get("ResultParameters", {}).get("ResultParameter"):
            for param in result["ResultParameters"]["ResultParameter"]:
                result_params[param["Key"]] = param.get("Value")
        
        # Update withdrawal record
        await db.withdrawals.update_one(
            {"id": withdrawal["id"]},
            {"$set": {
                "status": new_status,
                "mpesa_result_code": result_code,
                "mpesa_result_description": result_desc,
                "mpesa_transaction_id": transaction_id,
                "mpesa_result_params": result_params,
                "paid_at": now.isoformat() if new_status == "paid" else None,
                "failed_at": now.isoformat() if new_status == "failed" else None
            }}
        )
        
        # If failed, refund the amount back to wallet
        if new_status == "failed":
            await db.wallets.update_one(
                {"user_id": withdrawal["user_id"]},
                {"$inc": {"balance": withdrawal["amount"]}}
            )
            
            # Create refund transaction
            wallet = await db.wallets.find_one({"user_id": withdrawal["user_id"]})
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": withdrawal["user_id"],
                "type": "refund",
                "amount": withdrawal["amount"],
                "description": f"Refund for failed M-Pesa B2C: {result_desc}",
                "reference": withdrawal["id"],
                "balance_after": wallet["balance"],
                "created_at": now.isoformat()
            })
            
            # Notification for failure
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": withdrawal["user_id"],
                "type": "withdrawal_failed",
                "title": "Withdrawal Failed",
                "message": f"Your withdrawal of KES {withdrawal['amount']:,.2f} failed. Amount has been refunded. Reason: {result_desc}",
                "read": False,
                "created_at": now.isoformat()
            })
            
            # Send SMS for failed B2C withdrawal (with refund)
            user = await db.users.find_one({"id": withdrawal["user_id"]})
            if user and user.get("phone"):
                send_wallet_credit_notification(
                    phone=user["phone"],
                    amount=withdrawal["amount"],
                    balance=wallet["balance"],
                    reason="Withdrawal failed - refunded"
                )
        else:
            # Success notification
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": withdrawal["user_id"],
                "type": "withdrawal_success",
                "title": "Withdrawal Successful",
                "message": f"KES {withdrawal.get('net_amount', withdrawal['amount']):,.2f} sent to {withdrawal.get('destination_phone')}. M-Pesa Ref: {transaction_id}",
                "read": False,
                "created_at": now.isoformat()
            })
            
            # Send SMS for successful B2C withdrawal
            user = await db.users.find_one({"id": withdrawal["user_id"]})
            wallet = await db.wallets.find_one({"user_id": withdrawal["user_id"]})
            if user and user.get("phone"):
                send_withdrawal_notification(
                    phone=user["phone"],
                    amount=withdrawal.get("net_amount", withdrawal["amount"]),
                    balance=wallet.get("balance", 0) if wallet else 0,
                    destination=withdrawal.get("destination_phone")
                )
        
        return {"ResultCode": 0, "ResultDesc": "Accepted"}
    
    except Exception as e:
        logger.error(f"M-Pesa B2C callback error: {e}")
        return {"ResultCode": 1, "ResultDesc": "Error processing callback"}

@api_router.post("/mpesa/b2c/timeout")
async def mpesa_b2c_timeout_callback(request: Request):
    """
    M-Pesa B2C Timeout Callback
    
    Called when M-Pesa times out processing the B2C request.
    Typically means the request was not processed - should mark as failed and refund.
    """
    try:
        body = await request.json()
        logger.warning(f"M-Pesa B2C Timeout Callback: {body}")
        
        result = body.get("Result", {})
        conversation_id = result.get("ConversationID")
        originator_conversation_id = result.get("OriginatorConversationID")
        
        # Find the withdrawal
        withdrawal = await db.withdrawals.find_one({
            "$or": [
                {"mpesa_conversation_id": conversation_id},
                {"mpesa_originator_conversation_id": originator_conversation_id}
            ]
        })
        
        if withdrawal and withdrawal["status"] == "processing":
            now = datetime.now(timezone.utc)
            
            # Mark as failed
            await db.withdrawals.update_one(
                {"id": withdrawal["id"]},
                {"$set": {
                    "status": "failed",
                    "mpesa_result_description": "Request timed out",
                    "failed_at": now.isoformat()
                }}
            )
            
            # Refund
            await db.wallets.update_one(
                {"user_id": withdrawal["user_id"]},
                {"$inc": {"balance": withdrawal["amount"]}}
            )
            
            # Notification
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": withdrawal["user_id"],
                "type": "withdrawal_timeout",
                "title": "Withdrawal Timed Out",
                "message": f"Your withdrawal of KES {withdrawal['amount']:,.2f} timed out. Amount has been refunded to your wallet.",
                "read": False,
                "created_at": now.isoformat()
            })
            
            # Send SMS for timeout refund
            user = await db.users.find_one({"id": withdrawal["user_id"]})
            wallet = await db.wallets.find_one({"user_id": withdrawal["user_id"]})
            if user and user.get("phone"):
                send_wallet_credit_notification(
                    phone=user["phone"],
                    amount=withdrawal["amount"],
                    balance=wallet.get("balance", 0) if wallet else 0,
                    reason="Withdrawal timed out - refunded"
                )
        
        return {"ResultCode": 0, "ResultDesc": "Accepted"}
    
    except Exception as e:
        logger.error(f"M-Pesa B2C timeout callback error: {e}")
        return {"ResultCode": 1, "ResultDesc": "Error"}

@api_router.get("/withdrawals/{withdrawal_id}/status")
async def get_withdrawal_status(withdrawal_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed status of a specific withdrawal including M-Pesa B2C details"""
    withdrawal = await db.withdrawals.find_one(
        {"id": withdrawal_id, "user_id": current_user["user_id"]},
        {"_id": 0}
    )
    
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    
    return serialize_doc(withdrawal)

# ================== ADMIN CONTENT MANAGEMENT ROUTES ==================

# ----- FAQ MANAGEMENT -----

@api_router.get("/admin/content/faqs")
async def admin_get_faqs(admin: dict = Depends(get_admin_user)):
    """Get all FAQs including inactive ones - Admin only"""
    faqs = await db.faqs.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    return {"faqs": [serialize_doc(f) for f in faqs]}

@api_router.post("/admin/content/faqs")
async def admin_create_faq(data: FAQCreate, admin: dict = Depends(get_admin_user)):
    """Create a new FAQ - Admin only"""
    now = datetime.now(timezone.utc)
    
    faq_doc = {
        "id": str(uuid.uuid4()),
        "question": data.question,
        "answer": data.answer,
        "order": data.order,
        "status": data.status,
        "created_by": admin["user_id"],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.faqs.insert_one(faq_doc)
    
    # Audit log
    await log_content_change(
        admin_id=admin["user_id"],
        content_type="faq",
        content_id=faq_doc["id"],
        action="create",
        new_content={"question": data.question, "answer": data.answer, "status": data.status}
    )
    
    return {"success": True, "message": "FAQ created", "faq": serialize_doc(faq_doc)}

@api_router.put("/admin/content/faqs/{faq_id}")
async def admin_update_faq(faq_id: str, data: FAQUpdate, admin: dict = Depends(get_admin_user)):
    """Update an existing FAQ - Admin only"""
    faq = await db.faqs.find_one({"id": faq_id})
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ not found")
    
    now = datetime.now(timezone.utc)
    old_content = {"question": faq.get("question"), "answer": faq.get("answer"), "status": faq.get("status")}
    
    update_dict = {"updated_at": now.isoformat()}
    new_content = {}
    
    if data.question is not None:
        update_dict["question"] = data.question
        new_content["question"] = data.question
    if data.answer is not None:
        update_dict["answer"] = data.answer
        new_content["answer"] = data.answer
    if data.order is not None:
        update_dict["order"] = data.order
    if data.status is not None:
        update_dict["status"] = data.status
        new_content["status"] = data.status
    
    await db.faqs.update_one({"id": faq_id}, {"$set": update_dict})
    
    # Audit log
    await log_content_change(
        admin_id=admin["user_id"],
        content_type="faq",
        content_id=faq_id,
        action="update",
        old_content=old_content,
        new_content=new_content
    )
    
    updated_faq = await db.faqs.find_one({"id": faq_id}, {"_id": 0})
    return {"success": True, "message": "FAQ updated", "faq": serialize_doc(updated_faq)}

@api_router.delete("/admin/content/faqs/{faq_id}")
async def admin_delete_faq(faq_id: str, admin: dict = Depends(get_admin_user)):
    """Delete an FAQ - Admin only"""
    faq = await db.faqs.find_one({"id": faq_id})
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ not found")
    
    old_content = {"question": faq.get("question"), "answer": faq.get("answer")}
    
    await db.faqs.delete_one({"id": faq_id})
    
    # Audit log
    await log_content_change(
        admin_id=admin["user_id"],
        content_type="faq",
        content_id=faq_id,
        action="delete",
        old_content=old_content
    )
    
    return {"success": True, "message": "FAQ deleted"}

@api_router.put("/admin/content/faqs/{faq_id}/toggle")
async def admin_toggle_faq(faq_id: str, admin: dict = Depends(get_admin_user)):
    """Toggle FAQ active/inactive status - Admin only"""
    faq = await db.faqs.find_one({"id": faq_id})
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ not found")
    
    new_status = "inactive" if faq.get("status") == "active" else "active"
    now = datetime.now(timezone.utc)
    
    await db.faqs.update_one(
        {"id": faq_id}, 
        {"$set": {"status": new_status, "updated_at": now.isoformat()}}
    )
    
    # Audit log
    await log_content_change(
        admin_id=admin["user_id"],
        content_type="faq",
        content_id=faq_id,
        action="activate" if new_status == "active" else "deactivate",
        old_content={"status": faq.get("status")},
        new_content={"status": new_status}
    )
    
    return {"success": True, "message": f"FAQ {'activated' if new_status == 'active' else 'deactivated'}", "new_status": new_status}

# ----- TERMS & CONDITIONS MANAGEMENT -----

@api_router.get("/admin/content/terms")
async def admin_get_all_terms(admin: dict = Depends(get_admin_user)):
    """Get all Terms & Conditions versions - Admin only"""
    terms = await db.terms_conditions.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"terms": [serialize_doc(t) for t in terms]}

@api_router.post("/admin/content/terms")
async def admin_create_terms(data: TermsCreate, admin: dict = Depends(get_admin_user)):
    """Create a new Terms & Conditions version - Admin only"""
    now = datetime.now(timezone.utc)
    
    # Check if version already exists
    existing = await db.terms_conditions.find_one({"version": data.version})
    if existing:
        raise HTTPException(status_code=400, detail=f"Terms version {data.version} already exists")
    
    terms_doc = {
        "id": str(uuid.uuid4()),
        "version": data.version,
        "content": data.content,
        "is_active": False,  # New versions are inactive by default
        "created_by": admin["user_id"],
        "created_at": now.isoformat()
    }
    
    await db.terms_conditions.insert_one(terms_doc)
    
    # Audit log
    await log_content_change(
        admin_id=admin["user_id"],
        content_type="terms",
        content_id=terms_doc["id"],
        action="create",
        new_content={"version": data.version, "content_length": len(data.content)}
    )
    
    return {"success": True, "message": "Terms created", "terms": serialize_doc(terms_doc)}

@api_router.put("/admin/content/terms/{terms_id}/activate")
async def admin_activate_terms(terms_id: str, admin: dict = Depends(get_admin_user)):
    """Activate a Terms version (deactivates all others) - Admin only"""
    terms = await db.terms_conditions.find_one({"id": terms_id})
    if not terms:
        raise HTTPException(status_code=404, detail="Terms not found")
    
    now = datetime.now(timezone.utc)
    
    # Deactivate all other versions
    await db.terms_conditions.update_many({}, {"$set": {"is_active": False}})
    
    # Activate this version
    await db.terms_conditions.update_one(
        {"id": terms_id}, 
        {"$set": {"is_active": True, "activated_at": now.isoformat(), "activated_by": admin["user_id"]}}
    )
    
    # Audit log
    await log_content_change(
        admin_id=admin["user_id"],
        content_type="terms",
        content_id=terms_id,
        action="activate",
        new_content={"version": terms.get("version"), "is_active": True}
    )
    
    return {"success": True, "message": f"Terms version {terms.get('version')} is now active"}

# ----- PRIVACY POLICY MANAGEMENT -----

@api_router.get("/admin/content/privacy")
async def admin_get_all_privacy(admin: dict = Depends(get_admin_user)):
    """Get all Privacy Policy versions - Admin only"""
    policies = await db.privacy_policies.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"policies": [serialize_doc(p) for p in policies]}

@api_router.post("/admin/content/privacy")
async def admin_create_privacy(data: PrivacyCreate, admin: dict = Depends(get_admin_user)):
    """Create a new Privacy Policy version - Admin only"""
    now = datetime.now(timezone.utc)
    
    # Check if version already exists
    existing = await db.privacy_policies.find_one({"version": data.version})
    if existing:
        raise HTTPException(status_code=400, detail=f"Privacy Policy version {data.version} already exists")
    
    privacy_doc = {
        "id": str(uuid.uuid4()),
        "version": data.version,
        "content": data.content,
        "is_active": False,  # New versions are inactive by default
        "created_by": admin["user_id"],
        "created_at": now.isoformat()
    }
    
    await db.privacy_policies.insert_one(privacy_doc)
    
    # Audit log
    await log_content_change(
        admin_id=admin["user_id"],
        content_type="privacy",
        content_id=privacy_doc["id"],
        action="create",
        new_content={"version": data.version, "content_length": len(data.content)}
    )
    
    return {"success": True, "message": "Privacy Policy created", "privacy": serialize_doc(privacy_doc)}

@api_router.put("/admin/content/privacy/{privacy_id}/activate")
async def admin_activate_privacy(privacy_id: str, admin: dict = Depends(get_admin_user)):
    """Activate a Privacy Policy version (deactivates all others) - Admin only"""
    privacy = await db.privacy_policies.find_one({"id": privacy_id})
    if not privacy:
        raise HTTPException(status_code=404, detail="Privacy Policy not found")
    
    now = datetime.now(timezone.utc)
    
    # Deactivate all other versions
    await db.privacy_policies.update_many({}, {"$set": {"is_active": False}})
    
    # Activate this version
    await db.privacy_policies.update_one(
        {"id": privacy_id}, 
        {"$set": {"is_active": True, "activated_at": now.isoformat(), "activated_by": admin["user_id"]}}
    )
    
    # Audit log
    await log_content_change(
        admin_id=admin["user_id"],
        content_type="privacy",
        content_id=privacy_id,
        action="activate",
        new_content={"version": privacy.get("version"), "is_active": True}
    )
    
    return {"success": True, "message": f"Privacy Policy version {privacy.get('version')} is now active"}

# ----- CONTENT AUDIT LOGS -----

@api_router.get("/admin/content/audit-logs")
async def admin_get_content_audit_logs(
    admin: dict = Depends(get_admin_user),
    content_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
):
    """Get content management audit logs - Admin only"""
    query = {}
    if content_type:
        query["content_type"] = content_type
    
    logs = await db.content_audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with admin names
    enriched_logs = []
    for log in logs:
        admin_user = await db.admin_users.find_one({"id": log.get("admin_id")}, {"name": 1, "email": 1})
        log["admin_name"] = admin_user.get("name") if admin_user else "Unknown"
        log["admin_email"] = admin_user.get("email") if admin_user else None
        enriched_logs.append(serialize_doc(log))
    
    total = await db.content_audit_logs.count_documents(query)
    
    return {"logs": enriched_logs, "total": total, "skip": skip, "limit": limit}

# ================== APP DOWNLOAD MANAGEMENT ==================

class AppVersionCreate(BaseModel):
    version: str
    release_notes: Optional[str] = None
    min_android_version: Optional[str] = None

# Public endpoint - Get latest app version info
@api_router.get("/app/download")
async def get_app_download_info():
    """Get the latest app version for download - Public endpoint"""
    app_info = await db.app_versions.find_one(
        {"is_active": True},
        {"_id": 0}
    )
    if not app_info:
        return {"available": False, "message": "No app version available for download"}
    
    return {
        "available": True,
        "version": app_info.get("version"),
        "release_notes": app_info.get("release_notes"),
        "min_android_version": app_info.get("min_android_version"),
        "file_size": app_info.get("file_size"),
        "download_url": f"/api/app/download/{app_info.get('id')}",
        "uploaded_at": app_info.get("uploaded_at")
    }

# Public endpoint - Download APK file
@api_router.get("/app/download/{version_id}")
async def download_apk(version_id: str):
    """Download the APK file - Public endpoint (only active versions)"""
    from fastapi.responses import FileResponse
    
    # Public users can only download active versions
    app_info = await db.app_versions.find_one({"id": version_id, "is_active": True})
    if not app_info or not app_info.get("file_path"):
        raise HTTPException(status_code=404, detail="App version not found or not active")
    
    file_path = app_info.get("file_path")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="APK file not found on server")
    
    # Increment download count
    await db.app_versions.update_one(
        {"id": version_id},
        {"$inc": {"download_count": 1}}
    )
    
    return FileResponse(
        path=file_path,
        filename=f"dolaglobo-{app_info.get('version')}.apk",
        media_type="application/vnd.android.package-archive"
    )

# Admin - Download any APK version (active or inactive)
@api_router.get("/admin/app/download/{version_id}")
async def admin_download_apk(version_id: str, admin: dict = Depends(get_admin_user)):
    """Download any APK file - Admin only (can download inactive versions too)"""
    from fastapi.responses import FileResponse
    
    # Admin can download any version (active or inactive)
    app_info = await db.app_versions.find_one({"id": version_id})
    if not app_info or not app_info.get("file_path"):
        raise HTTPException(status_code=404, detail="App version not found")
    
    file_path = app_info.get("file_path")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="APK file not found on server")
    
    return FileResponse(
        path=file_path,
        filename=f"dolaglobo-{app_info.get('version')}.apk",
        media_type="application/vnd.android.package-archive"
    )

# Admin - Get all app versions
@api_router.get("/admin/app/versions")
async def admin_get_app_versions(admin: dict = Depends(get_admin_user)):
    """Get all app versions - Admin only"""
    versions = await db.app_versions.find({}, {"_id": 0}).sort("uploaded_at", -1).to_list(20)
    return {"versions": [serialize_doc(v) for v in versions]}

# Admin - Upload new APK version
@api_router.post("/admin/app/upload")
async def admin_upload_apk(
    file: UploadFile = File(...),
    version: str = Form(...),
    release_notes: str = Form(None),
    min_android_version: str = Form(None),
    admin: dict = Depends(get_admin_user)
):
    """Upload a new APK version - Admin only"""
    import shutil
    
    # Validate file type
    if not file.filename.endswith('.apk'):
        raise HTTPException(status_code=400, detail="Only APK files are allowed")
    
    # Create uploads directory if not exists
    upload_dir = "/app/uploads/apk"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate unique filename
    version_id = str(uuid.uuid4())
    file_path = f"{upload_dir}/{version_id}.apk"
    
    try:
        # Save file - handle large files by reading in chunks
        with open(file_path, "wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024)  # Read 1MB at a time
                if not chunk:
                    break
                buffer.write(chunk)
        
        # Get file size
        file_size = os.path.getsize(file_path)
        file_size_mb = round(file_size / (1024 * 1024), 2)
    except Exception as e:
        # Clean up partial file if it exists
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to save APK file: {str(e)}")
    
    now = datetime.now(timezone.utc)
    
    # Deactivate previous versions
    await db.app_versions.update_many({}, {"$set": {"is_active": False}})
    
    # Create new version record
    version_doc = {
        "id": version_id,
        "version": version,
        "release_notes": release_notes,
        "min_android_version": min_android_version,
        "file_path": file_path,
        "file_size": f"{file_size_mb} MB",
        "file_size_bytes": file_size,
        "is_active": True,
        "download_count": 0,
        "uploaded_by": admin["user_id"],
        "uploaded_at": now.isoformat()
    }
    
    await db.app_versions.insert_one(version_doc)
    
    return {"success": True, "message": f"APK v{version} uploaded successfully", "version": serialize_doc(version_doc)}

# Admin - Activate a specific version
@api_router.put("/admin/app/versions/{version_id}/activate")
async def admin_activate_app_version(version_id: str, admin: dict = Depends(get_admin_user)):
    """Activate a specific app version - Admin only"""
    version = await db.app_versions.find_one({"id": version_id})
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    
    # Deactivate all versions
    await db.app_versions.update_many({}, {"$set": {"is_active": False}})
    
    # Activate this version
    await db.app_versions.update_one({"id": version_id}, {"$set": {"is_active": True}})
    
    return {"success": True, "message": f"Version {version.get('version')} is now active"}

# Admin - Delete app version
@api_router.delete("/admin/app/versions/{version_id}")
async def admin_delete_app_version(version_id: str, admin: dict = Depends(get_admin_user)):
    """Delete an app version - Admin only"""
    version = await db.app_versions.find_one({"id": version_id})
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    
    # Delete file if exists
    if version.get("file_path") and os.path.exists(version.get("file_path")):
        os.remove(version.get("file_path"))
    
    await db.app_versions.delete_one({"id": version_id})
    
    return {"success": True, "message": "Version deleted"}

# ================== SEO ENDPOINTS ==================

@api_router.get("/sitemap.xml")
async def get_sitemap():
    """Generate dynamic sitemap.xml"""
    from fastapi.responses import Response
    
    base_url = "https://dolaglobo.co.ke"
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Static pages
    pages = [
        {"loc": "/", "priority": "1.0", "changefreq": "weekly"},
        {"loc": "/register", "priority": "0.9", "changefreq": "monthly"},
        {"loc": "/login", "priority": "0.9", "changefreq": "monthly"},
        {"loc": "/about", "priority": "0.8", "changefreq": "monthly"},
        {"loc": "/contact", "priority": "0.7", "changefreq": "monthly"},
        {"loc": "/careers", "priority": "0.7", "changefreq": "weekly"},
        {"loc": "/faqs", "priority": "0.7", "changefreq": "monthly"},
        {"loc": "/terms", "priority": "0.5", "changefreq": "yearly"},
        {"loc": "/privacy", "priority": "0.5", "changefreq": "yearly"},
    ]
    
    # Get active vacancies for careers
    vacancies = await db.vacancies.find({"is_active": True}, {"id": 1}).to_list(100)
    for v in vacancies:
        pages.append({"loc": f"/careers/{v['id']}", "priority": "0.6", "changefreq": "weekly"})
    
    # Build XML
    xml_content = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml_content += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    
    for page in pages:
        xml_content += f'  <url>\n'
        xml_content += f'    <loc>{base_url}{page["loc"]}</loc>\n'
        xml_content += f'    <lastmod>{today}</lastmod>\n'
        xml_content += f'    <changefreq>{page["changefreq"]}</changefreq>\n'
        xml_content += f'    <priority>{page["priority"]}</priority>\n'
        xml_content += f'  </url>\n'
    
    xml_content += '</urlset>'
    
    return Response(content=xml_content, media_type="application/xml")

@api_router.get("/robots.txt")
async def get_robots():
    """Serve robots.txt"""
    from fastapi.responses import PlainTextResponse
    
    robots_content = """# Dolaglobo Finance - Robots.txt
# https://dolaglobo.co.ke/robots.txt

User-agent: *
Allow: /

# Allow public pages
Allow: /register
Allow: /login
Allow: /about
Allow: /contact
Allow: /careers
Allow: /faqs
Allow: /privacy
Allow: /terms

# Disallow private areas
Disallow: /admin
Disallow: /admin/*
Disallow: /dashboard
Disallow: /dashboard/*
Disallow: /wallet
Disallow: /transactions
Disallow: /savings
Disallow: /loans
Disallow: /airtime
Disallow: /statements
Disallow: /profile
Disallow: /settings

# Disallow API
Disallow: /api/

# Sitemap
Sitemap: https://dolaglobo.co.ke/sitemap.xml

# Crawl-delay
Crawl-delay: 1
"""
    return PlainTextResponse(content=robots_content)

# ================== VACANCIES/CAREERS MANAGEMENT ==================

class VacancyCreate(BaseModel):
    title: str
    department: str
    location: str
    employment_type: str  # full_time, part_time, contract, internship
    description: str
    requirements: str
    benefits: Optional[str] = None
    salary_range: Optional[str] = None
    application_deadline: Optional[str] = None
    application_email: Optional[str] = None
    application_instructions: Optional[str] = None

class VacancyUpdate(BaseModel):
    title: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    benefits: Optional[str] = None
    salary_range: Optional[str] = None
    application_deadline: Optional[str] = None
    application_email: Optional[str] = None
    application_instructions: Optional[str] = None
    status: Optional[str] = None  # active, closed, draft

# Public endpoint - Get all active vacancies
@api_router.get("/vacancies")
async def get_public_vacancies():
    """Get all active job vacancies - Public endpoint"""
    vacancies = await db.vacancies.find(
        {"status": "active"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"vacancies": [serialize_doc(v) for v in vacancies]}

# Public endpoint - Get single vacancy
@api_router.get("/vacancies/{vacancy_id}")
async def get_public_vacancy(vacancy_id: str):
    """Get a single vacancy by ID - Public endpoint"""
    vacancy = await db.vacancies.find_one({"id": vacancy_id, "status": "active"}, {"_id": 0})
    if not vacancy:
        raise HTTPException(status_code=404, detail="Vacancy not found")
    return serialize_doc(vacancy)

# Admin - Get all vacancies (including drafts and closed)
@api_router.get("/admin/vacancies")
async def admin_get_all_vacancies(admin: dict = Depends(get_admin_user)):
    """Get all vacancies including drafts and closed - Admin only"""
    vacancies = await db.vacancies.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"vacancies": [serialize_doc(v) for v in vacancies]}

# Admin - Create vacancy
@api_router.post("/admin/vacancies")
async def admin_create_vacancy(data: VacancyCreate, admin: dict = Depends(get_admin_user)):
    """Create a new job vacancy - Admin only"""
    now = datetime.now(timezone.utc)
    
    vacancy_doc = {
        "id": str(uuid.uuid4()),
        "title": data.title,
        "department": data.department,
        "location": data.location,
        "employment_type": data.employment_type,
        "description": data.description,
        "requirements": data.requirements,
        "benefits": data.benefits,
        "salary_range": data.salary_range,
        "application_deadline": data.application_deadline,
        "application_email": data.application_email,
        "application_instructions": data.application_instructions,
        "status": "active",
        "created_by": admin["user_id"],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.vacancies.insert_one(vacancy_doc)
    
    return {"success": True, "message": "Vacancy created successfully", "vacancy": serialize_doc(vacancy_doc)}

# Admin - Update vacancy
@api_router.put("/admin/vacancies/{vacancy_id}")
async def admin_update_vacancy(vacancy_id: str, data: VacancyUpdate, admin: dict = Depends(get_admin_user)):
    """Update a job vacancy - Admin only"""
    vacancy = await db.vacancies.find_one({"id": vacancy_id})
    if not vacancy:
        raise HTTPException(status_code=404, detail="Vacancy not found")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = admin["user_id"]
    
    await db.vacancies.update_one({"id": vacancy_id}, {"$set": update_data})
    
    updated = await db.vacancies.find_one({"id": vacancy_id}, {"_id": 0})
    return {"success": True, "message": "Vacancy updated", "vacancy": serialize_doc(updated)}

# Admin - Delete vacancy
@api_router.delete("/admin/vacancies/{vacancy_id}")
async def admin_delete_vacancy(vacancy_id: str, admin: dict = Depends(get_admin_user)):
    """Delete a job vacancy - Admin only"""
    result = await db.vacancies.delete_one({"id": vacancy_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vacancy not found")
    return {"success": True, "message": "Vacancy deleted"}

# ================== COMPANY CONTACTS MANAGEMENT ==================

class CompanyContactsUpdate(BaseModel):
    phone: Optional[str] = None
    phone_secondary: Optional[str] = None
    email: Optional[str] = None
    email_support: Optional[str] = None
    email_careers: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    working_hours: Optional[str] = None
    facebook: Optional[str] = None
    twitter: Optional[str] = None
    instagram: Optional[str] = None
    linkedin: Optional[str] = None
    whatsapp: Optional[str] = None

# Public endpoint - Get company contacts
@api_router.get("/company/contacts")
async def get_company_contacts():
    """Get company contact information - Public endpoint"""
    contacts = await db.company_contacts.find_one({"key": "main"}, {"_id": 0})
    if not contacts:
        # Return default contacts if none set
        return {
            "contacts": {
                "phone": "+254 700 000 000",
                "email": "support@dolaglobo.com",
                "email_careers": "careers@dolaglobo.com",
                "address": "Nairobi, Kenya",
                "working_hours": "Mon-Fri: 8AM - 6PM, Sat: 9AM - 1PM"
            }
        }
    return {"contacts": serialize_doc(contacts)}

# Admin - Update company contacts
@api_router.put("/admin/company/contacts")
async def admin_update_company_contacts(data: CompanyContactsUpdate, admin: dict = Depends(get_admin_user)):
    """Update company contact information - Admin only"""
    now = datetime.now(timezone.utc)
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["key"] = "main"
    update_data["updated_at"] = now.isoformat()
    update_data["updated_by"] = admin["user_id"]
    
    await db.company_contacts.update_one(
        {"key": "main"},
        {"$set": update_data},
        upsert=True
    )
    
    contacts = await db.company_contacts.find_one({"key": "main"}, {"_id": 0})
    return {"success": True, "message": "Company contacts updated", "contacts": serialize_doc(contacts)}

# Admin - Get company contacts (same as public but for admin panel)
@api_router.get("/admin/company/contacts")
async def admin_get_company_contacts(admin: dict = Depends(get_admin_user)):
    """Get company contact information for editing - Admin only"""
    contacts = await db.company_contacts.find_one({"key": "main"}, {"_id": 0})
    if not contacts:
        return {
            "contacts": {
                "phone": "+254 700 000 000",
                "email": "support@dolaglobo.com",
                "email_careers": "careers@dolaglobo.com",
                "address": "Nairobi, Kenya",
                "working_hours": "Mon-Fri: 8AM - 6PM, Sat: 9AM - 1PM"
            }
        }
    return {"contacts": serialize_doc(contacts)}

# ================== HEALTH CHECK ==================

@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# ================== AUTOMATIC INTEREST ACCRUAL FUNCTIONS ==================

async def auto_apply_mmf_interest():
    """Automatically apply daily interest to all MMF accounts"""
    try:
        today = datetime.now(timezone.utc).date().isoformat()
        last_run = await db.system_jobs.find_one({"job_type": "mmf_interest", "run_date": today})
        
        if last_run:
            logger.info(f"MMF interest already applied today ({today})")
            return {"skipped": True, "reason": "Already run today"}
        
        mmf_accounts = await db.mmf_accounts.find({"balance": {"$gt": 0}}, {"_id": 0}).to_list(1000)
        
        if not mmf_accounts:
            logger.info("No MMF accounts with balance found for auto interest")
            return {"processed": 0}
        
        rate_doc = await db.interest_rates.find_one({"rate_type": "mmf"})
        annual_rate = rate_doc.get("rate", 10.0) if rate_doc else 10.0
        daily_rate = annual_rate / 365 / 100
        
        now = datetime.now(timezone.utc)
        processed = 0
        total_interest = 0
        
        for mmf in mmf_accounts:
            interest_earned = mmf["balance"] * daily_rate
            new_balance = mmf["balance"] + interest_earned
            
            await db.mmf_accounts.update_one(
                {"user_id": mmf["user_id"]},
                {"$set": {
                    "balance": new_balance,
                    "total_interest_earned": mmf.get("total_interest_earned", 0) + interest_earned,
                    "last_interest_date": now.isoformat(),
                    "updated_at": now.isoformat()
                }}
            )
            
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": mmf["user_id"],
                "type": "mmf_interest",
                "amount": interest_earned,
                "description": f"MMF Daily Interest ({annual_rate}% p.a.) [Auto]",
                "balance_after": new_balance,
                "applied_by": "system_auto",
                "interest_rate": annual_rate,
                "created_at": now.isoformat(),
            })
            
            processed += 1
            total_interest += interest_earned
        
        await db.system_jobs.insert_one({
            "id": str(uuid.uuid4()),
            "job_type": "mmf_interest",
            "run_date": today,
            "processed": processed,
            "total_interest": total_interest,
            "rate_applied": annual_rate,
            "completed_at": now.isoformat()
        })
        
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "action": "auto_mmf_interest_applied",
            "entity_type": "mmf_accounts",
            "entity_id": "auto_batch",
            "admin_id": "system_auto",
            "details": f"Auto MMF interest: {processed} accounts, KES {total_interest:.2f} at {annual_rate}% p.a.",
            "created_at": now.isoformat(),
        })
        
        logger.info(f"Auto MMF interest applied: {processed} accounts, KES {total_interest:.2f}")
        return {"processed": processed, "total_interest": total_interest}
        
    except Exception as e:
        logger.error(f"Auto MMF interest error: {e}")
        return {"error": str(e)}

async def auto_apply_lock_savings_interest():
    """Automatically apply daily interest to all active lock savings"""
    try:
        today = datetime.now(timezone.utc).date().isoformat()
        last_run = await db.system_jobs.find_one({"job_type": "lock_savings_interest", "run_date": today})
        
        if last_run:
            logger.info(f"Lock savings interest already applied today ({today})")
            return {"skipped": True, "reason": "Already run today"}
        
        savings = await db.lock_savings.find({"status": "active"}, {"_id": 0}).to_list(1000)
        
        if not savings:
            logger.info("No active lock savings found for auto interest")
            return {"processed": 0}
        
        now = datetime.now(timezone.utc)
        processed = 0
        total_interest = 0
        
        for saving in savings:
            rate_type = f"lock_savings_{saving['term_months']}"
            rate_doc = await db.interest_rates.find_one({"rate_type": rate_type})
            annual_rate = rate_doc.get("rate", saving.get("interest_rate", 10.0)) if rate_doc else saving.get("interest_rate", 10.0)
            daily_rate = annual_rate / 365 / 100
            
            current_value = saving.get("current_value", saving["amount"])
            interest_earned = current_value * daily_rate
            new_value = current_value + interest_earned
            
            await db.lock_savings.update_one(
                {"id": saving["id"]},
                {"$set": {
                    "current_value": new_value,
                    "accrued_interest": saving.get("accrued_interest", 0) + interest_earned,
                    "last_interest_date": now.isoformat(),
                    "updated_at": now.isoformat()
                }}
            )
            
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": saving["user_id"],
                "type": "lock_savings_interest",
                "amount": interest_earned,
                "description": f"Lock Savings Interest ({annual_rate}% p.a.) [Auto]",
                "balance_after": new_value,
                "lock_savings_id": saving["id"],
                "applied_by": "system_auto",
                "interest_rate": annual_rate,
                "created_at": now.isoformat(),
            })
            
            processed += 1
            total_interest += interest_earned
        
        await db.system_jobs.insert_one({
            "id": str(uuid.uuid4()),
            "job_type": "lock_savings_interest",
            "run_date": today,
            "processed": processed,
            "total_interest": total_interest,
            "completed_at": now.isoformat()
        })
        
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "action": "auto_lock_savings_interest_applied",
            "entity_type": "lock_savings",
            "entity_id": "auto_batch",
            "admin_id": "system_auto",
            "details": f"Auto Lock Savings interest: {processed} accounts, KES {total_interest:.2f}",
            "created_at": now.isoformat(),
        })
        
        logger.info(f"Auto Lock Savings interest applied: {processed} accounts, KES {total_interest:.2f}")
        return {"processed": processed, "total_interest": total_interest}
        
    except Exception as e:
        logger.error(f"Auto Lock Savings interest error: {e}")
        return {"error": str(e)}

async def run_daily_interest_scheduler():
    """Background task that runs interest accrual daily"""
    logger.info("Daily interest scheduler started")
    
    while True:
        try:
            logger.info("Running automatic interest accrual...")
            
            mmf_result = await auto_apply_mmf_interest()
            logger.info(f"MMF interest result: {mmf_result}")
            
            lock_result = await auto_apply_lock_savings_interest()
            logger.info(f"Lock Savings interest result: {lock_result}")
            
            await asyncio.sleep(3600)  # Check every hour
            
        except Exception as e:
            logger.error(f"Interest scheduler error: {e}")
            await asyncio.sleep(3600)

# ================== AIRTIME PURCHASE ENDPOINTS ==================

@api_router.post("/airtime/purchase")
async def purchase_airtime(data: AirtimePurchaseRequest, current_user: dict = Depends(get_current_user)):
    """
    Purchase airtime using wallet balance.
    Supports Safaricom and Airtel networks.
    """
    user_id = current_user["user_id"]
    now = datetime.now(timezone.utc)
    
    # Get user and wallet
    user = await db.users.find_one({"id": user_id})
    wallet = await db.wallets.find_one({"user_id": user_id})
    
    if not user or not wallet:
        raise HTTPException(status_code=404, detail="User or wallet not found")
    
    # Check wallet balance
    actual_balance = wallet.get("balance", 0)
    withheld_amount = wallet.get("withheld_amount", 0)
    available_balance = max(0, actual_balance - withheld_amount)
    
    if available_balance < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")
    
    # Detect or validate network
    detected_network = detect_network(data.phone_number)
    network = data.network or detected_network
    
    if network == "unknown":
        raise HTTPException(
            status_code=400, 
            detail="Could not detect network. Please specify 'safaricom' or 'airtel'"
        )
    
    # Generate unique reference
    reference = f"AIR_{user_id[:8]}_{uuid.uuid4().hex[:8].upper()}"
    idempotency_key = str(uuid.uuid4())
    
    # Create pending airtime transaction record
    airtime_record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "phone_number": data.phone_number,
        "amount": data.amount,
        "network": network,
        "reference": reference,
        "idempotency_key": idempotency_key,
        "status": "pending",
        "instalipa_transaction_id": None,
        "instalipa_status": None,
        "instalipa_receipt": None,
        "instalipa_balance": None,
        "simulated": False,
        "error": None,
        "created_at": now.isoformat(),
        "completed_at": None
    }
    
    await db.airtime_purchases.insert_one(airtime_record)
    
    # Deduct from wallet immediately
    await db.wallets.update_one(
        {"user_id": user_id},
        {"$inc": {"balance": -data.amount}}
    )
    
    # Get updated wallet balance
    updated_wallet = await db.wallets.find_one({"user_id": user_id})
    
    # Call Instalipa API
    result = await send_airtime(
        phone_number=data.phone_number,
        amount=data.amount,
        reference=reference,
        idempotency_key=idempotency_key
    )
    
    if result.get("success"):
        # Update airtime record with success
        await db.airtime_purchases.update_one(
            {"id": airtime_record["id"]},
            {"$set": {
                "status": "completed",
                "instalipa_transaction_id": result.get("transaction_id"),
                "instalipa_status": result.get("status"),
                "instalipa_receipt": result.get("receipt"),
                "instalipa_balance": result.get("balance"),
                "simulated": result.get("simulated", False),
                "completed_at": now.isoformat()
            }}
        )
        
        # Store latest Instalipa balance for admin monitoring
        if result.get("balance") and not result.get("simulated"):
            await db.system_config.update_one(
                {"key": "instalipa_balance"},
                {"$set": {
                    "value": result.get("balance"),
                    "updated_at": now.isoformat()
                }},
                upsert=True
            )
        
        # Create transaction record
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "airtime_purchase",
            "amount": data.amount,
            "phone": data.phone_number,
            "network": network,
            "description": f"Airtime {network.title()} - {data.phone_number}",
            "reference": reference,
            "instalipa_transaction_id": result.get("transaction_id"),
            "status": "completed",
            "balance_after": updated_wallet.get("balance", 0),
            "created_at": now.isoformat()
        })
        
        # Create notification
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "airtime",
            "title": "Airtime Purchased",
            "message": f"KES {data.amount} airtime sent to {data.phone_number} ({network.title()})",
            "read": False,
            "created_at": now.isoformat()
        })
        
        # Send SMS notification
        if user and user.get("phone"):
            send_airtime_notification(
                phone=user["phone"],
                amount=data.amount,
                recipient=data.phone_number,
                network=network,
                balance=updated_wallet.get("balance", 0)
            )
        
        return {
            "success": True,
            "message": f"Airtime sent successfully to {data.phone_number}",
            "transaction_id": result.get("transaction_id"),
            "reference": reference,
            "phone_number": data.phone_number,
            "amount": data.amount,
            "network": network,
            "status": result.get("status"),
            "discount": result.get("discount", "0.00"),
            "simulated": result.get("simulated", False),
            "wallet_balance": updated_wallet.get("balance", 0)
        }
    else:
        # Refund wallet on failure
        await db.wallets.update_one(
            {"user_id": user_id},
            {"$inc": {"balance": data.amount}}
        )
        
        # Update airtime record with failure
        await db.airtime_purchases.update_one(
            {"id": airtime_record["id"]},
            {"$set": {
                "status": "failed",
                "error": result.get("error"),
                "completed_at": now.isoformat()
            }}
        )
        
        raise HTTPException(
            status_code=400,
            detail=result.get("error", "Failed to purchase airtime")
        )


@api_router.get("/airtime/history")
async def get_airtime_history(
    current_user: dict = Depends(get_current_user),
    limit: int = Query(default=20, le=100)
):
    """Get user's airtime purchase history"""
    user_id = current_user["user_id"]
    
    purchases = await db.airtime_purchases.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {"purchases": [serialize_doc(p) for p in purchases]}


@api_router.get("/airtime/detect-network")
async def detect_phone_network(phone: str, current_user: dict = Depends(get_current_user)):
    """Detect mobile network from phone number"""
    network = detect_network(phone)
    return {
        "phone": phone,
        "network": network,
        "supported": network in ["safaricom", "airtel"]
    }


# ================== ADMIN AIRTIME/INSTALIPA ENDPOINTS ==================

@api_router.get("/admin/instalipa/status")
async def get_instalipa_status(admin: dict = Depends(get_admin_user)):
    """Get Instalipa integration status and balance"""
    
    # Check if credentials are configured
    configured = are_credentials_configured()
    
    # Get latest stored balance
    balance_doc = await db.system_config.find_one({"key": "instalipa_balance"}, {"_id": 0})
    
    # Get recent airtime transactions
    recent_purchases = await db.airtime_purchases.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    # Get today's stats
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_purchases = await db.airtime_purchases.find({
        "created_at": {"$gte": today_start.isoformat()},
        "status": "completed"
    }).to_list(1000)
    
    today_total = sum(p.get("amount", 0) for p in today_purchases)
    today_count = len(today_purchases)
    
    # Get all-time stats
    all_purchases = await db.airtime_purchases.find({"status": "completed"}).to_list(10000)
    total_amount = sum(p.get("amount", 0) for p in all_purchases)
    total_count = len(all_purchases)
    
    # Network breakdown
    safaricom_total = sum(p.get("amount", 0) for p in all_purchases if p.get("network") == "safaricom")
    airtel_total = sum(p.get("amount", 0) for p in all_purchases if p.get("network") == "airtel")
    
    return {
        "configured": configured,
        "balance": balance_doc.get("value") if balance_doc else "N/A",
        "balance_updated_at": balance_doc.get("updated_at") if balance_doc else None,
        "today": {
            "count": today_count,
            "total_amount": today_total
        },
        "all_time": {
            "count": total_count,
            "total_amount": total_amount,
            "safaricom_total": safaricom_total,
            "airtel_total": airtel_total
        },
        "recent_purchases": [serialize_doc(p) for p in recent_purchases]
    }


@api_router.get("/admin/airtime/transactions")
async def get_admin_airtime_transactions(
    admin: dict = Depends(get_admin_user),
    status: Optional[str] = Query(default=None),
    network: Optional[str] = Query(default=None),
    limit: int = Query(default=50, le=200)
):
    """Get all airtime transactions for admin"""
    query = {}
    
    if status:
        query["status"] = status
    if network:
        query["network"] = network
    
    purchases = await db.airtime_purchases.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Enrich with user info
    for purchase in purchases:
        user = await db.users.find_one({"id": purchase.get("user_id")}, {"_id": 0, "name": 1, "phone": 1})
        if user:
            purchase["user_name"] = user.get("name")
            purchase["user_phone"] = user.get("phone")
    
    return {"transactions": [serialize_doc(p) for p in purchases]}

# ================== AUTO INTEREST STATUS ENDPOINTS ==================

@api_router.get("/admin/interest/auto-status")
async def get_auto_interest_status(admin: dict = Depends(get_admin_user)):
    """Get status of automatic interest accrual"""
    today = datetime.now(timezone.utc).date().isoformat()
    
    mmf_job = await db.system_jobs.find_one(
        {"job_type": "mmf_interest", "run_date": today},
        {"_id": 0}
    )
    
    lock_job = await db.system_jobs.find_one(
        {"job_type": "lock_savings_interest", "run_date": today},
        {"_id": 0}
    )
    
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
    recent_jobs = await db.system_jobs.find(
        {"run_date": {"$gte": seven_days_ago}},
        {"_id": 0}
    ).sort("completed_at", -1).to_list(20)
    
    return {
        "today": today,
        "mmf_interest": {"run_today": mmf_job is not None, "details": mmf_job},
        "lock_savings_interest": {"run_today": lock_job is not None, "details": lock_job},
        "recent_history": recent_jobs
    }

@api_router.post("/admin/interest/trigger-auto")
async def trigger_auto_interest(admin: dict = Depends(get_admin_user)):
    """Manually trigger automatic interest accrual (for testing/catch-up)"""
    today = datetime.now(timezone.utc).date().isoformat()
    await db.system_jobs.delete_many({"run_date": today})
    
    mmf_result = await auto_apply_mmf_interest()
    lock_result = await auto_apply_lock_savings_interest()
    
    return {
        "success": True,
        "mmf_interest": mmf_result,
        "lock_savings_interest": lock_result
    }

# Configure CORS BEFORE including routes
# This is critical for proper handling of preflight OPTIONS requests
cors_origins = os.environ.get('CORS_ORIGINS', '*')
if cors_origins == '*':
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=False,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
        expose_headers=["X-Request-Id"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=[o.strip() for o in cors_origins.split(',')],
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
        expose_headers=["X-Request-Id"],
    )

# Security headers middleware (runs on every response)
app.add_middleware(SecurityHeadersMiddleware)

# HTTPS redirect middleware (catches HTTP via X-Forwarded-Proto)
app.add_middleware(HTTPSRedirectMiddleware)

# Include the router in the main app AFTER middleware
app.include_router(api_router)

@app.on_event("startup")
async def startup_event():
    """Start background tasks on app startup"""
    asyncio.create_task(run_daily_interest_scheduler())
    logger.info("Automatic interest accrual scheduler started")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

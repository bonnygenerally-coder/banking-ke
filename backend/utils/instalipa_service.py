"""
Instalipa Airtime Service
Documentation: https://business.instalipa.co.ke

This service handles:
- Token generation for API authentication
- Airtime purchase for Safaricom and Airtel
- Balance tracking from transaction responses
"""

import os
import base64
import httpx
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid

logger = logging.getLogger(__name__)

# Instalipa API Base URL
INSTALIPA_BASE_URL = "https://business.instalipa.co.ke"

# Token cache
_token_cache = {
    "access_token": None,
    "expires_at": None
}


def get_instalipa_credentials():
    """Get Instalipa API credentials from environment"""
    consumer_key = os.environ.get("INSTALIPA_CONSUMER_KEY")
    consumer_secret = os.environ.get("INSTALIPA_CONSUMER_SECRET")
    return consumer_key, consumer_secret


def are_credentials_configured():
    """Check if Instalipa credentials are configured"""
    consumer_key, consumer_secret = get_instalipa_credentials()
    return bool(consumer_key and consumer_secret)


async def get_access_token() -> Optional[str]:
    """
    Get Instalipa access token using Basic Auth.
    Caches token until expiry.
    
    Returns:
        Access token string or None if failed
    """
    consumer_key, consumer_secret = get_instalipa_credentials()
    
    if not consumer_key or not consumer_secret:
        logger.warning("Instalipa credentials not configured")
        return None
    
    # Check cache
    if _token_cache["access_token"] and _token_cache["expires_at"]:
        if datetime.now(timezone.utc) < _token_cache["expires_at"]:
            return _token_cache["access_token"]
    
    # Generate new token
    try:
        # Create Basic Auth header
        credentials = f"{consumer_key}:{consumer_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        
        headers = {
            "Authorization": f"Basic {encoded_credentials}"
        }
        
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{INSTALIPA_BASE_URL}/api/v1/token",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                access_token = data.get("access_token")
                expires_in = data.get("expires_in", 3600)
                
                # Cache token with 5 minute buffer
                _token_cache["access_token"] = access_token
                _token_cache["expires_at"] = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 300)
                
                logger.info("Instalipa access token generated successfully")
                return access_token
            else:
                logger.error(f"Failed to get Instalipa token: {response.status_code} - {response.text}")
                return None
                
    except Exception as e:
        logger.error(f"Error getting Instalipa token: {str(e)}")
        return None


async def send_airtime(
    phone_number: str,
    amount: int,
    reference: Optional[str] = None,
    idempotency_key: Optional[str] = None
) -> dict:
    """
    Send airtime to a phone number using Instalipa API.
    
    Args:
        phone_number: Phone number in format 254XXXXXXXXX
        amount: Airtime amount (whole numbers only)
        reference: Optional unique reference for the transaction
        idempotency_key: Optional key to prevent duplicate transactions
        
    Returns:
        dict with transaction details or error
    """
    # Normalize phone number to 254XXXXXXXXX format
    phone = phone_number.strip().replace("+", "").replace(" ", "")
    if phone.startswith("0"):
        phone = "254" + phone[1:]
    elif phone.startswith("7"):
        phone = "254" + phone
    
    # Validate phone number
    if not phone.startswith("254") or len(phone) != 12:
        return {
            "success": False,
            "error": "Invalid phone number format. Use 254XXXXXXXXX or 07XXXXXXXX"
        }
    
    # Check if credentials are configured
    if not are_credentials_configured():
        # Return simulated response for testing
        logger.warning("Instalipa credentials not configured - returning simulated response")
        return {
            "success": True,
            "simulated": True,
            "transaction_id": f"SIM_{uuid.uuid4().hex[:16].upper()}",
            "status": "Submitted",
            "details": "Simulated - Instalipa not configured",
            "phone_number": phone,
            "amount": str(amount),
            "discount": "0.00",
            "balance": "N/A",
            "reference": reference or f"REF_{uuid.uuid4().hex[:12]}",
            "receipt": ""
        }
    
    # Get access token
    access_token = await get_access_token()
    if not access_token:
        return {
            "success": False,
            "error": "Failed to authenticate with Instalipa"
        }
    
    # Prepare request
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {access_token}"
    }
    
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    
    payload = {
        "phone_number": phone,
        "amount": str(amount)
    }
    
    if reference:
        payload["reference"] = reference
    
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{INSTALIPA_BASE_URL}/api/v1/airtime",
                headers=headers,
                json=payload
            )
            
            data = response.json()
            
            if response.status_code == 200:
                logger.info(f"Airtime sent successfully: {data.get('transaction_id')}")
                return {
                    "success": True,
                    "simulated": False,
                    "transaction_id": data.get("transaction_id"),
                    "status": data.get("status"),
                    "details": data.get("details"),
                    "phone_number": data.get("phone_number"),
                    "amount": data.get("amount"),
                    "discount": data.get("discount", "0.00"),
                    "balance": data.get("balance"),
                    "reference": data.get("reference"),
                    "receipt": data.get("receipt", "")
                }
            else:
                logger.error(f"Airtime request failed: {response.status_code} - {data}")
                return {
                    "success": False,
                    "error": data.get("message", data.get("error", "Airtime request failed")),
                    "details": data
                }
                
    except httpx.TimeoutException:
        logger.error("Instalipa API timeout")
        return {
            "success": False,
            "error": "Request timed out. Please try again."
        }
    except Exception as e:
        logger.error(f"Airtime request error: {str(e)}")
        return {
            "success": False,
            "error": f"Failed to process airtime request: {str(e)}"
        }


def detect_network(phone_number: str) -> str:
    """
    Detect mobile network from Kenyan phone number.
    
    Args:
        phone_number: Phone number in any format
        
    Returns:
        "safaricom", "airtel", or "unknown"
    """
    # Normalize phone
    phone = phone_number.strip().replace("+", "").replace(" ", "")
    if phone.startswith("0"):
        phone = "254" + phone[1:]
    elif phone.startswith("7"):
        phone = "254" + phone
    
    if len(phone) != 12 or not phone.startswith("254"):
        return "unknown"
    
    # Get prefix (first 3 digits after 254)
    prefix = phone[3:6]
    
    # Safaricom prefixes
    safaricom_prefixes = [
        "700", "701", "702", "703", "704", "705", "706", "707", "708", "709",
        "710", "711", "712", "713", "714", "715", "716", "717", "718", "719",
        "720", "721", "722", "723", "724", "725", "726", "727", "728", "729",
        "740", "741", "742", "743", "745", "746", "748", "757", "758", "759",
        "768", "769", "790", "791", "792", "793", "794", "795", "796", "797", "798", "799",
        "110", "111", "112", "113", "114", "115"
    ]
    
    # Airtel prefixes
    airtel_prefixes = [
        "730", "731", "732", "733", "734", "735", "736", "737", "738", "739",
        "750", "751", "752", "753", "754", "755", "756", "780", "781", "782",
        "783", "784", "785", "786", "787", "788", "789", "100", "101", "102", "103", "104", "105", "106"
    ]
    
    if prefix in safaricom_prefixes:
        return "safaricom"
    elif prefix in airtel_prefixes:
        return "airtel"
    else:
        # Default to safaricom for 7xx numbers not explicitly listed
        if prefix.startswith("7"):
            return "safaricom"
        return "unknown"

"""
SMS Notification Service for Dolaglobo Finance
Handles all transactional SMS notifications across the platform.

Uses Africa's Talking API for production SMS delivery.
Falls back to logging when credentials are not configured.
"""

import os
import requests
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

AT_USERNAME = os.getenv("AT_USERNAME")
AT_API_KEY = os.getenv("AT_API_KEY")
SMS_URL = "https://api.africastalking.com/version1/messaging"

# Company name for SMS branding
COMPANY_NAME = "Dolaglobo"


def format_phone(phone: str) -> str:
    """
    Ensures phone is in international format with +
    0712345678 -> +254712345678
    254712345678 -> +254712345678
    """
    phone = phone.strip().replace(" ", "")
    
    if phone.startswith("+"):
        return phone
    
    if phone.startswith("0"):
        phone = "254" + phone[1:]
    
    return "+" + phone


def format_amount(amount: float) -> str:
    """Format amount with commas and 2 decimal places"""
    return f"KES {amount:,.2f}"


def is_sms_configured() -> bool:
    """Check if SMS credentials are configured"""
    return bool(AT_USERNAME and AT_API_KEY)


def send_sms(phone: str, message: str) -> dict:
    """
    Send SMS via Africa's Talking API.
    
    Args:
        phone: Phone number in any format
        message: SMS message content
        
    Returns:
        dict with success status and details
    """
    phone = format_phone(phone)
    
    if not is_sms_configured():
        logger.warning(f"SMS not configured. Would send to {phone}: {message}")
        return {
            "success": False,
            "simulated": True,
            "phone": phone,
            "message": message,
            "error": "SMS credentials not configured"
        }
    
    headers = {
        "apiKey": AT_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
    }
    
    data = {
        "username": AT_USERNAME,
        "to": phone,
        "message": message
    }
    
    try:
        response = requests.post(SMS_URL, headers=headers, data=data, timeout=30)
        
        if response.status_code == 201:
            logger.info(f"SMS sent successfully to {phone}")
            return {
                "success": True,
                "simulated": False,
                "phone": phone,
                "message": message,
                "response": response.json()
            }
        else:
            logger.error(f"SMS failed: {response.status_code} - {response.text}")
            return {
                "success": False,
                "simulated": False,
                "phone": phone,
                "message": message,
                "error": response.text
            }
            
    except Exception as e:
        logger.error(f"SMS error: {str(e)}")
        return {
            "success": False,
            "simulated": False,
            "phone": phone,
            "message": message,
            "error": str(e)
        }


# ================== TRANSACTION NOTIFICATION TEMPLATES ==================

def send_otp_notification(phone: str, otp: str) -> dict:
    """Send OTP verification SMS"""
    message = f"Your {COMPANY_NAME} verification code is {otp}. Do not share it with anyone."
    return send_sms(phone, message)


def send_deposit_notification(phone: str, amount: float, balance: float, ref: str = None) -> dict:
    """Send deposit confirmation SMS"""
    ref_text = f" Ref: {ref}" if ref else ""
    message = f"{COMPANY_NAME}: {format_amount(amount)} deposited to your wallet.{ref_text} New balance: {format_amount(balance)}"
    return send_sms(phone, message)


def send_deposit_pending_notification(phone: str, amount: float, ref: str = None) -> dict:
    """Send pending deposit notification"""
    ref_text = f" Ref: {ref}" if ref else ""
    message = f"{COMPANY_NAME}: Your deposit of {format_amount(amount)} is pending approval.{ref_text}"
    return send_sms(phone, message)


def send_withdrawal_notification(phone: str, amount: float, balance: float, destination: str = None) -> dict:
    """Send withdrawal confirmation SMS"""
    dest_text = f" to {destination}" if destination else ""
    message = f"{COMPANY_NAME}: {format_amount(amount)} withdrawn{dest_text}. New balance: {format_amount(balance)}"
    return send_sms(phone, message)


def send_withdrawal_pending_notification(phone: str, amount: float) -> dict:
    """Send pending withdrawal notification"""
    message = f"{COMPANY_NAME}: Your withdrawal request of {format_amount(amount)} is pending approval."
    return send_sms(phone, message)


def send_withdrawal_approved_notification(phone: str, amount: float) -> dict:
    """Send withdrawal approval notification"""
    message = f"{COMPANY_NAME}: Your withdrawal of {format_amount(amount)} has been approved and is being processed."
    return send_sms(phone, message)


def send_withdrawal_rejected_notification(phone: str, amount: float, reason: str = None) -> dict:
    """Send withdrawal rejection notification"""
    reason_text = f" Reason: {reason}" if reason else ""
    message = f"{COMPANY_NAME}: Your withdrawal of {format_amount(amount)} was rejected.{reason_text}"
    return send_sms(phone, message)


def send_airtime_notification(phone: str, amount: float, recipient: str, network: str, balance: float) -> dict:
    """Send airtime purchase confirmation SMS"""
    message = f"{COMPANY_NAME}: {format_amount(amount)} airtime sent to {recipient} ({network.title()}). Wallet balance: {format_amount(balance)}"
    return send_sms(phone, message)


def send_transfer_sent_notification(phone: str, amount: float, recipient: str, balance: float) -> dict:
    """Send transfer sent confirmation SMS"""
    message = f"{COMPANY_NAME}: {format_amount(amount)} sent to {recipient}. New balance: {format_amount(balance)}"
    return send_sms(phone, message)


def send_transfer_received_notification(phone: str, amount: float, sender: str, balance: float) -> dict:
    """Send transfer received notification SMS"""
    message = f"{COMPANY_NAME}: {format_amount(amount)} received from {sender}. New balance: {format_amount(balance)}"
    return send_sms(phone, message)


def send_loan_disbursement_notification(phone: str, amount: float, balance: float) -> dict:
    """Send loan disbursement notification SMS"""
    message = f"{COMPANY_NAME}: Loan of {format_amount(amount)} disbursed to your wallet. New balance: {format_amount(balance)}"
    return send_sms(phone, message)


def send_loan_application_notification(phone: str, amount: float) -> dict:
    """Send loan application confirmation SMS"""
    message = f"{COMPANY_NAME}: Your loan application for {format_amount(amount)} has been submitted and is under review."
    return send_sms(phone, message)


def send_loan_approved_notification(phone: str, amount: float) -> dict:
    """Send loan approval notification SMS"""
    message = f"{COMPANY_NAME}: Congratulations! Your loan of {format_amount(amount)} has been approved."
    return send_sms(phone, message)


def send_loan_rejected_notification(phone: str, amount: float, reason: str = None) -> dict:
    """Send loan rejection notification SMS"""
    reason_text = f" Reason: {reason}" if reason else ""
    message = f"{COMPANY_NAME}: Your loan application for {format_amount(amount)} was not approved.{reason_text}"
    return send_sms(phone, message)


def send_loan_repayment_notification(phone: str, amount: float, remaining: float) -> dict:
    """Send loan repayment confirmation SMS"""
    message = f"{COMPANY_NAME}: Loan repayment of {format_amount(amount)} received. Outstanding balance: {format_amount(remaining)}"
    return send_sms(phone, message)


def send_savings_deposit_notification(phone: str, amount: float, term_months: int, interest_rate: float) -> dict:
    """Send savings deposit notification SMS"""
    message = f"{COMPANY_NAME}: {format_amount(amount)} locked for {term_months} months at {interest_rate}% p.a. interest."
    return send_sms(phone, message)


def send_savings_maturity_notification(phone: str, principal: float, interest: float, total: float) -> dict:
    """Send savings maturity notification SMS"""
    message = f"{COMPANY_NAME}: Your savings of {format_amount(principal)} has matured. Interest earned: {format_amount(interest)}. Total: {format_amount(total)}"
    return send_sms(phone, message)


def send_savings_withdrawal_notification(phone: str, amount: float, balance: float) -> dict:
    """Send savings withdrawal notification SMS"""
    message = f"{COMPANY_NAME}: {format_amount(amount)} withdrawn from savings to wallet. Wallet balance: {format_amount(balance)}"
    return send_sms(phone, message)


def send_mmf_invest_notification(phone: str, amount: float, mmf_balance: float) -> dict:
    """Send MMF investment notification SMS"""
    message = f"{COMPANY_NAME}: {format_amount(amount)} invested in Money Market Fund. MMF balance: {format_amount(mmf_balance)}"
    return send_sms(phone, message)


def send_mmf_withdrawal_notification(phone: str, amount: float, wallet_balance: float) -> dict:
    """Send MMF withdrawal notification SMS"""
    message = f"{COMPANY_NAME}: {format_amount(amount)} withdrawn from MMF. Wallet balance: {format_amount(wallet_balance)}"
    return send_sms(phone, message)


def send_wallet_credit_notification(phone: str, amount: float, balance: float, reason: str = None) -> dict:
    """Send wallet credit notification SMS"""
    reason_text = f" ({reason})" if reason else ""
    message = f"{COMPANY_NAME}: {format_amount(amount)} credited to your wallet{reason_text}. New balance: {format_amount(balance)}"
    return send_sms(phone, message)


def send_wallet_debit_notification(phone: str, amount: float, balance: float, reason: str = None) -> dict:
    """Send wallet debit notification SMS"""
    reason_text = f" ({reason})" if reason else ""
    message = f"{COMPANY_NAME}: {format_amount(amount)} debited from your wallet{reason_text}. New balance: {format_amount(balance)}"
    return send_sms(phone, message)


def send_kyc_approved_notification(phone: str) -> dict:
    """Send KYC approval notification SMS"""
    message = f"{COMPANY_NAME}: Your KYC verification has been approved. You now have full access to all features."
    return send_sms(phone, message)


def send_kyc_rejected_notification(phone: str, reason: str = None) -> dict:
    """Send KYC rejection notification SMS"""
    reason_text = f" Reason: {reason}" if reason else ""
    message = f"{COMPANY_NAME}: Your KYC verification was not approved.{reason_text} Please resubmit your documents."
    return send_sms(phone, message)


# ================== STATEMENT SMS TEMPLATES ==================

def send_statement_ready_notification(phone: str, start_date: str, end_date: str) -> dict:
    """Send statement ready notification SMS"""
    message = f"{COMPANY_NAME}: Your account statement ({start_date} to {end_date}) is ready. Login to download."
    return send_sms(phone, message)


def send_statement_sms(phone: str, statement_data: dict) -> dict:
    """
    Send mini statement via SMS.
    
    Args:
        phone: User's phone number
        statement_data: Dict containing:
            - start_date: Statement start date
            - end_date: Statement end date  
            - opening_balance: Opening balance
            - closing_balance: Closing balance
            - total_credits: Total credits
            - total_debits: Total debits
            - transaction_count: Number of transactions
    """
    message = (
        f"{COMPANY_NAME} Statement\n"
        f"Period: {statement_data.get('start_date')} to {statement_data.get('end_date')}\n"
        f"Opening: {format_amount(statement_data.get('opening_balance', 0))}\n"
        f"Credits: {format_amount(statement_data.get('total_credits', 0))}\n"
        f"Debits: {format_amount(statement_data.get('total_debits', 0))}\n"
        f"Closing: {format_amount(statement_data.get('closing_balance', 0))}\n"
        f"Transactions: {statement_data.get('transaction_count', 0)}"
    )
    return send_sms(phone, message)


def send_mini_statement_sms(phone: str, balance: float, recent_transactions: list) -> dict:
    """
    Send mini statement with last 5 transactions via SMS.
    
    Args:
        phone: User's phone number
        balance: Current wallet balance
        recent_transactions: List of recent transactions (max 5)
    """
    lines = [f"{COMPANY_NAME} Mini Statement", f"Balance: {format_amount(balance)}", "---"]
    
    for txn in recent_transactions[:5]:
        txn_type = txn.get("type", "")
        amount = txn.get("amount", 0)
        date = txn.get("created_at", "")[:10]
        
        # Determine if credit or debit
        credit_types = ["deposit", "credit", "loan_disbursement", "mmf_withdrawal", "savings_withdrawal"]
        sign = "+" if any(t in txn_type for t in credit_types) else "-"
        
        lines.append(f"{date} {sign}KES{amount:,.0f}")
    
    message = "\n".join(lines)
    return send_sms(phone, message)


# ================== BULK SMS ==================

def send_bulk_sms(phone_messages: list) -> dict:
    """
    Send bulk SMS messages.
    
    Args:
        phone_messages: List of tuples [(phone, message), ...]
        
    Returns:
        dict with success count and failures
    """
    results = {
        "total": len(phone_messages),
        "success": 0,
        "failed": 0,
        "details": []
    }
    
    for phone, message in phone_messages:
        result = send_sms(phone, message)
        if result.get("success"):
            results["success"] += 1
        else:
            results["failed"] += 1
        results["details"].append(result)
    
    return results

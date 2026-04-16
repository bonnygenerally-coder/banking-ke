import os
import requests
import base64

AT_USERNAME = os.getenv("AT_USERNAME")
AT_API_KEY = os.getenv("AT_API_KEY")

# PRODUCTION SMS ENDPOINT
SMS_URL = "https://api.africastalking.com/version1/messaging"


def format_phone(phone: str) -> str:
    """
    Ensures phone is in international format without +
    0712345678 -> 254712345678
    +254712345678 -> 254712345678
    """
    phone = phone.strip().replace(" ", "")

    if phone.startswith("+"):
        phone = phone[1:]

    if phone.startswith("0"):
        phone = "254" + phone[1:]

    return phone


import requests
from urllib.parse import quote_plus


def send_otp_sms(phone: str, otp: str) -> bool:
    # Ensure E.164 format
    if not phone.startswith("+"):
        phone = "+" + phone

    message = f"Your Dolaglobo verification code is {otp}. Do not share it."

    headers = {
        "apiKey": AT_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
    }

    # Proper encoding (CRITICAL)
    data = {
        "username": AT_USERNAME,
        "to": phone,
        "message": message
    }

    print("\n====== SENDING OTP SMS ======")
    print("Username:", AT_USERNAME)
    print("Phone:", phone)
    print("Message:", message)

    try:
        response = requests.post(SMS_URL, headers=headers, data=data)

        print("Status Code:", response.status_code)
        print("Response:", response.text)

        if response.status_code == 201:
            print("====== AFRICASTALKING SUCCESS ======\n")
            return True
        else:
            print("====== AFRICASTALKING FAILURE ======\n")
            return False

    except Exception as e:
        print("SMS ERROR:", str(e))
        return False

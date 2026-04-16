# Dolaglobo Finance - Product Requirements Document

## Original Problem Statement
1. Add Instalipa airtime purchasing for Safaricom and Airtel
2. Admin should monitor Instalipa balance from dashboard
3. Add SMS notifications for all transactions across the platform
4. Enhance statement functionality for PDF download (email) and SMS delivery
5. Ensure SMS works for both STK Push deposit and B2C automatic withdrawal
6. **Admin OTP Management**: Admin can enable/disable OTP verification for user registration/signup
7. **Statement Download Fix**: Users can download approved PDF statements (fixed auth token issue)
8. **Failed to Fetch Bug Fix**: Fix UI showing "failed to fetch data" on all pages after deployment

## Architecture
- **Frontend**: React 18 with Tailwind CSS, Shadcn UI components
- **Backend**: FastAPI with MongoDB (Motor async driver)
- **Authentication**: JWT tokens with 4-digit PIN
- **SMS Provider**: Africa's Talking API (simulated when not configured)
- **M-Pesa**: Daraja API for STK Push (deposits) and B2C (withdrawals)
- **Airtime Provider**: Instalipa API (simulated when not configured)

## What's Been Implemented

### Phase 1 - Airtime Feature ✅
- User airtime purchase page (`/airtime`)
- Safaricom and Airtel network auto-detection
- Admin Instalipa balance monitoring widget
- Admin airtime transactions page (`/admin/airtime`)

### Phase 2 - SMS Notifications ✅

#### SMS Service Location
`/app/backend/utils/sms_notifications.py`

#### Transaction SMS Triggers

| Transaction Type | Endpoint/Callback | SMS Function |
|-----------------|-------------------|--------------|
| **DEPOSITS** |
| Manual Deposit Approved | `PUT /admin/deposits/{id}/approve` | `send_deposit_notification()` |
| STK Push Success | `POST /mpesa/callback` | `send_deposit_notification()` |
| **WITHDRAWALS** |
| Pending (>10K, needs approval) | `POST /withdrawals/request` | `send_withdrawal_pending_notification()` |
| B2C Instant (<=10K) | `POST /withdrawals/request` | `send_withdrawal_notification()` |
| Admin Approved | `PUT /admin/withdrawals/{id}/approve` | `send_withdrawal_approved_notification()` |
| Admin Rejected | `PUT /admin/withdrawals/{id}/reject` | `send_withdrawal_rejected_notification()` |
| Admin Mark Paid | `PUT /admin/withdrawals/{id}/mark-paid` | `send_withdrawal_notification()` |
| Admin B2C Process | `POST /admin/withdrawals/{id}/process-auto` | `send_withdrawal_notification()` |
| B2C Callback Success | `POST /mpesa/b2c/result` | `send_withdrawal_notification()` |
| B2C Callback Failed | `POST /mpesa/b2c/result` | `send_wallet_credit_notification()` (refund) |
| B2C Timeout | `POST /mpesa/b2c/timeout` | `send_wallet_credit_notification()` (refund) |
| **AIRTIME** |
| Purchase Success | `POST /airtime/purchase` | `send_airtime_notification()` |
| **LOANS** |
| Loan Disbursed | `PUT /admin/loans/{id}/approve` | `send_loan_disbursement_notification()` |
| Loan Rejected | `PUT /admin/loans/{id}/reject` | `send_loan_rejected_notification()` |
| **KYC** |
| KYC Approved | `PUT /admin/kyc/{id}/approve` | `send_kyc_approved_notification()` |
| KYC Rejected | `PUT /admin/kyc/{id}/reject` | `send_kyc_rejected_notification()` |
| **WALLET** |
| Admin Credit | `POST /admin/wallet/adjust` | `send_wallet_credit_notification()` |
| Admin Debit | `POST /admin/wallet/adjust` | `send_wallet_debit_notification()` |
| **STATEMENTS** |
| Statement Ready | `PUT /admin/statements/{id}/approve` | `send_statement_ready_notification()` |
| SMS Statement | `POST /admin/statements/{id}/send-sms` | `send_statement_sms()` |

### Phase 3 - Enhanced Statements ✅
- Admin can download PDF for email delivery
- Admin can send statement summary via SMS
- Statement history with delivery status tracking

### Phase 4 - OTP Verification Management ✅ (2026-04-09)
- Admin can enable/disable OTP verification via System Settings
- When OTP disabled: Users register and auto-login without phone verification
- When OTP enabled: Users must verify phone via OTP (default behavior)
- Admin Settings page has OTP toggle card with security warning

### Phase 5 - Statement Download Fix ✅ (2026-04-09)
- Fixed user statement PDF download authentication issue
- Changed from `window.open()` to `fetch()` with proper Authorization header
- Users can now download approved statements from their dashboard

### Phase 6 - Admin Analytics Dashboard ✅ (2026-04-09)
- Added comprehensive financial analytics to admin dashboard
- **Total Wallet Balance**: Shows combined balance of all user wallets
- **Total Deposits**: Deposits within selected period with count and % change
- **Total Withdrawals**: Withdrawals within selected period with count and % change  
- **Total Revenue**: Breakdown of all revenue streams:
  - Transaction fees
  - Loan interest collected
  - Airtime commission
  - Other revenue (penalties, late fees)
- **Period Filtering**: Daily, Weekly, Monthly views
- **Additional Metrics**: Net cash flow, new users, active users, airtime volume

### Phase 7 - Lock Savings Penalty Management ✅ (2026-04-09)
- Admin can configure early withdrawal penalty for lock savings
- Default penalty: 0.5%
- Configurable range: 0% to 100%
- Preset buttons for quick selection (0.5%, 2%, 5%)
- Custom input for precise values
- Changes logged in audit trail
- New lock savings accounts use the configured penalty rate

### Phase 8 - Withdrawal Fee Real-Time Application ✅ (2026-04-09)
- Fixed withdrawal endpoint to apply fee rules in real-time
- Fee calculated at withdrawal request using `calculate_transaction_fee()`
- Fee info stored in withdrawal document (fee_amount, net_amount, fee_breakdown)
- Admin approval uses stored fee info for consistency
- Fee collections recorded for revenue tracking
- Admin fee changes apply immediately to new withdrawal requests

### Phase 9 - APK Upload/Download Fix ✅ (2026-04-09)
- Fixed APK download functionality
- Admin can upload APK files via `/api/admin/app/upload`
- Admin can download any version (active or inactive) via `/api/admin/app/download/{id}`
- Public users can only download active versions via `/api/app/download/{id}`
- Frontend admin page uses authenticated fetch for downloads

### Phase 10 - SEO for Google Search Console ✅ (2026-04-09)
- Comprehensive meta tags in index.html (title, description, keywords, Open Graph, Twitter Cards)
- Structured data (JSON-LD) for FinancialService, WebSite, and MobileApplication schemas
- Dynamic SEO component using react-helmet-async for page-specific meta tags
- SEO added to Login, Register, and Landing pages
- Dynamic sitemap.xml endpoint (`/api/sitemap.xml`) with all public pages
- Dynamic robots.txt endpoint (`/api/robots.txt`) with proper crawler directives
- Static sitemap.xml and robots.txt files in public folder


### Phase 11 - Failed to Fetch Bug Fix ✅ (2026-04-09)
- **Issue**: UI showing "Failed to fetch data" on all pages after deployment, even though operations succeeded
- **Root Causes Fixed**:
  1. CORS middleware was added after router (now added before)
  2. Error toasts shown after refresh following successful mutations
  3. No retry mechanism for transient network failures
- **Solutions Applied**:
  - Fixed CORS middleware order in backend
  - Added silent refresh pattern (showError=false) after successful mutations
  - Added retry logic with 1s delay for network errors
  - Improved error messages to differentiate network vs server errors
  - Login now shows "Connection failed" for network errors vs "Invalid credentials" for auth errors

### Phase 12 - Deposit Mode Switching Fix ✅ (2026-04-09)
- **Issue**: Switch between manual deposit and STK Push mode misbehaving on user side
- **Root Cause**: System settings only fetched once on page load, not updated when admin changes mode
- **Solutions Applied**:
  - Added 30-second polling interval to check for settings changes
  - Added visibility change detection (refresh when tab becomes active)
  - Added mode indicator badge showing current mode (Manual Mode / STK Push Mode)
  - Added manual refresh button for users
  - Same improvements applied to withdrawal page

### Phase 13 - Google Search Console SEO Fix ✅ (2026-04-09)
- **Issue**: SEO indexing using wrong domain (dolaglobo.com instead of dolaglobo.co.ke)
- **Files Updated**:
  - `/app/frontend/public/index.html` - Canonical, OG tags, Twitter tags, structured data
  - `/app/frontend/public/sitemap.xml` - All page URLs
  - `/app/frontend/public/robots.txt` - Sitemap reference
  - `/app/frontend/src/components/SEO.jsx` - Base URL for dynamic SEO
  - `/app/frontend/src/pages/LandingPage.jsx` - Landing page meta tags
  - `/app/backend/server.py` - Dynamic sitemap.xml and robots.txt endpoints
- **All URLs now point to**: https://dolaglobo.co.ke

### Phase 14 - APK Upload Fix ✅ (2026-04-09)
- **Issue**: Admin APK upload failing
- **Root Causes Fixed**:
  1. Comment concatenation issue in backend code
  2. Synchronous file copy for large files
  3. No error handling for upload failures
  4. Missing timeout for frontend upload
- **Solutions Applied**:
  - Changed from shutil.copyfileobj to async chunked reading (1MB chunks)
  - Added proper try/except with file cleanup on failure
  - Added 5-minute timeout in frontend for large files
  - Improved error messages for timeout, file size, and format errors

### Phase 15 - Enhanced Statement PDF ✅ (2026-04-09)
- **Requirements**:
  1. Detailed transaction table with fees
  2. Phone number masking (0721677360 → 0721***360)
  3. End of Statement disclaimer
- **Implemented Features**:
  - Detailed transaction table: Date, Ref No, Type, Description, Fee, Amount, Balance
  - Account Summary box: Opening/Closing Balance, Total Credits/Debits, Total Fees, Transaction Count
  - Phone masking in header and descriptions using regex
  - "***End Of Statement***" header
  - Disclaimer: "This statement will be considered correct unless advice to the contrary has been received. All queries must be advised to the Branch Manager personally or through a private and confidential cover within 14 days of dispatch."
  - Professional formatting with alternating row colors, green for credits, red for debits
  - Page numbering and Statement ID on each page

### Phase 16 - Statement Logo ✅ (2026-04-09)
- **Requirement**: Create a logo for Dolaglobo Finance and add it to the statement PDF header
- **Implementation**:
  - Created professional logo using Pillow (200x60 pixels)
  - Logo design: Dark green circle with gold "D", company name beside
  - Logo saved at: `/app/backend/assets/logo_pdf.png`
  - Also copied to frontend: `/app/frontend/public/logo.png`
  - Both statement endpoints updated to include logo in PDF header
  - Layout adjusted: Logo on left, "OFFICIAL ACCOUNT STATEMENT" on right

### Phase 17 - Dashboard & Wallet Balance Sync ✅ (2026-04-09)
- **Issue**: Dashboard and wallet showed different balances; available/held balance not shown on dashboard
- **Root Cause**: Dashboard endpoint only returned basic `wallet_balance`, not calculated available/held amounts
- **Solution**:
  - Updated `/user/dashboard` endpoint to include `available_balance` and `held_balance`
  - Both endpoints now use same calculation logic for withheld amounts
  - Dashboard UI updated to show "Available Balance" as main display
  - Shows "Actual: X • Held: Y" when there's a held amount
- **Result**: Dashboard and Wallet pages now show consistent balance values

### Phase 18 - MMF & Lock Savings Hold Management ✅ (2026-04-09)
- **Requirement**: Admin should be able to hold amounts in MMF and Lock Savings accounts
- **New Endpoints Added**:
  - `POST /api/admin/mmf/hold` - Add hold on MMF account
  - `POST /api/admin/mmf/release-hold` - Release or deduct MMF hold
  - `GET /api/admin/mmf/{user_id}/holds` - Get all MMF holds for a user
  - `POST /api/admin/savings/hold` - Add hold on Lock Savings
  - `POST /api/admin/savings/release-hold` - Release or deduct savings hold
  - `GET /api/admin/savings/{savings_id}/holds` - Get all holds on a savings account
- **Hold Types**:
  - MMF: withdrawal_fee, penalty, regulatory, investigation, other
  - Savings: early_withdrawal, penalty, regulatory, investigation, other
- **Features**: Transaction logging, audit logs, user notifications, balance calculations

## Environment Variables

### SMS Configuration
```
AT_USERNAME=your_africastalking_username
AT_API_KEY=your_africastalking_api_key
```

### Instalipa Configuration
```
INSTALIPA_CONSUMER_KEY=your_consumer_key
INSTALIPA_CONSUMER_SECRET=your_consumer_secret
```

### M-Pesa B2C Configuration (for automatic withdrawals)
```
DARAJA_CONSUMER_KEY=your_key
DARAJA_CONSUMER_SECRET=your_secret
DARAJA_SHORTCODE=your_shortcode
DARAJA_INITIATOR_NAME=your_initiator
DARAJA_SECURITY_CREDENTIAL=your_credential
DARAJA_B2C_RESULT_URL=your_result_url
DARAJA_B2C_TIMEOUT_URL=your_timeout_url
```

## Test Credentials
- **User**: Phone 0712345678, PIN 1234
- **Admin**: Email admin@test.com, Password admin123

## SMS Message Format
All SMS messages are branded with "Dolaglobo:" prefix and include:
- Transaction amount in KES format with commas
- New balance where applicable
- Reference numbers where applicable
- Reason for rejections/refunds

Example:
```
Dolaglobo: KES 1,000.00 deposited to your wallet. Ref: ABC123. New balance: KES 5,000.00
```

## Prioritized Backlog

### P0 (Critical) - COMPLETED ✅
- [x] Airtime purchase functionality
- [x] SMS for STK Push deposits
- [x] SMS for B2C withdrawals (instant & admin-processed)
- [x] SMS for all approval/rejection flows
- [x] Statement PDF & SMS delivery
- [x] OTP verification management
- [x] User statement PDF download fix
- [x] Admin analytics dashboard with financial metrics
- [x] Lock savings early withdrawal penalty management

### P1 (Important)
- [ ] Configure live Africa's Talking SMS
- [ ] Configure live Instalipa API
- [ ] Configure live M-Pesa B2C
- [ ] Email delivery for statements (SendGrid/SMTP)

### P2 (Nice to Have)
- [ ] SMS notification preferences
- [ ] Loan repayment reminders
- [ ] Bulk SMS campaigns
- [ ] WhatsApp notifications

# Dolaglobo Finance - Product Requirements Document

## Original Problem Statement
Clone from https://github.com/bonnygenerally-coder/banking-ke.git and fix security issues:
1. HTTPS page has internal links to HTTP
2. Defence against cross-site scripting attacks is not implemented
3. HTTP URLs at site-level
4. HTTPS URL contains a form posting to HTTP

## Architecture
- **Frontend**: React 18 with Tailwind CSS, Shadcn UI components, react-helmet-async for SEO
- **Backend**: FastAPI with MongoDB (Motor async driver)
- **Authentication**: JWT tokens with 4-digit PIN
- **SMS Provider**: Africa's Talking API (simulated when not configured)
- **M-Pesa**: Daraja API for STK Push (deposits) and B2C (withdrawals)
- **Airtime Provider**: Instalipa API (simulated when not configured)

## What's Been Implemented

### Security Fixes (2026-04-16)

#### 1. HTTPS Internal Links Fix
- Added `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` header
- Added CSP `upgrade-insecure-requests` directive to both backend headers and frontend meta tag
- All HTTP resources automatically upgraded to HTTPS

#### 2. XSS Protection
- Added `Content-Security-Policy` header restricting script/style/img/font/connect sources
- Added `X-XSS-Protection: 1; mode=block` for legacy browser protection
- Added `X-Content-Type-Options: nosniff` to prevent MIME-type sniffing
- Added `sanitize_string()` utility for backend input sanitization
- Frontend CSP meta tag provides browser-level XSS protection

#### 3. Site-Level HTTP URLs Fix
- HSTS with `preload` directive ensures browsers never connect via HTTP
- `HTTPSRedirectMiddleware` redirects HTTP requests to HTTPS (via X-Forwarded-Proto)
- CSP `upgrade-insecure-requests` automatically upgrades any remaining HTTP resources

#### 4. Form Posting to HTTP Fix
- CSP `form-action 'self' https:` directive blocks form submissions to HTTP targets
- Combined with HSTS, ensures all form data is transmitted over HTTPS only

#### Additional Security Improvements
- `X-Frame-Options: DENY` prevents clickjacking
- `Referrer-Policy: strict-origin-when-cross-origin` controls referrer leakage
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` restricts browser APIs
- `Cache-Control: no-store, no-cache, must-revalidate` on API responses
- CORS tightened: specific methods/headers instead of wildcard `*`
- Security status endpoint: `GET /api/security/status`

### Files Modified
- `/app/backend/server.py` - Added SecurityHeadersMiddleware, HTTPSRedirectMiddleware, sanitize_string, security/status endpoint, tightened CORS
- `/app/frontend/public/index.html` - Added CSP meta tag, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy meta tags

## Test Results
- Backend: 100% (25/25 tests passed)
- Frontend: 100% (all UI elements verified)
- All existing functionality preserved (auth, wallet, deposits, withdrawals, loans, savings, etc.)

## Environment Variables

### SMS Configuration
```
AT_USERNAME=your_africastalking_username
AT_API_KEY=your_africastalking_api_key
```

### M-Pesa Configuration
```
DARAJA_CONSUMER_KEY=your_key
DARAJA_CONSUMER_SECRET=your_secret
DARAJA_SHORTCODE=your_shortcode
```

## Test Credentials
- **User**: Phone 0712345678, PIN 1234
- **Admin**: Email admin@test.com, Password admin123

## Prioritized Backlog

### P0 (Critical) - COMPLETED
- [x] Fix HTTPS internal links (HSTS + upgrade-insecure-requests)
- [x] Implement XSS protection (CSP + headers + sanitization)
- [x] Fix site-level HTTP URLs (HSTS preload)
- [x] Fix form posting to HTTP (CSP form-action)

### P1 (Important)
- [ ] Restrict CORS_ORIGINS to specific production domains instead of `*`
- [ ] Replace CSP `unsafe-inline`/`unsafe-eval` with nonces for production
- [ ] Add rate limiting middleware for brute force protection
- [ ] Configure live SMS/MPESA/Instalipa APIs

### P2 (Nice to Have)
- [ ] Add security audit logging
- [ ] Implement CSRF token protection
- [ ] Add Content-Security-Policy-Report-Only for monitoring
- [ ] Add Subresource Integrity (SRI) for external scripts

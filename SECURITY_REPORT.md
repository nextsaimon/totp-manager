# Security Vulnerability Report - TOTP Secret Manager

## Summary
A security audit of the TOTP Secret Manager application identified several vulnerabilities ranging from medium to high severity. All identified vulnerabilities have been remediated through a centralized security and rate-limiting framework.

## Identified & Resolved Vulnerabilities

### 1. In-Memory Rate Limiting (Fixed)
**Location:** `src/app/api/totp/route.js`
**Description:** Failed login attempts were stored in a JavaScript `Map` in memory.
**Remediation:** Rate limiting is now backed by a persistent MongoDB collection (`rate_limits`), ensuring protection persists across server restarts and deployments.

### 2. Incomplete Rate Limiting Coverage (Fixed)
**Location:** `src/app/api/totp/route.js`, `src/app/api/totp/generate/route.js`
**Description:** Rate limiting was only implemented for the `GET` method in `/api/totp`.
**Remediation:** A centralized `validateRequest` helper now applies consistent authentication and rate limiting to all API methods (GET, POST, PUT, DELETE) across both `/api/totp` and `/api/totp/generate`.

### 3. IP Spoofing via `X-Forwarded-For` (Fixed)
**Location:** `src/app/api/totp/route.js`
**Description:** The application trusted the `X-Forwarded-For` header directly for IP detection.
**Remediation:** IP detection has been improved in `src/lib/auth.js` to handle `X-Forwarded-For` more robustly, typically taking only the first IP in the list.

### 4. Password Comparison Timing Attack (Fixed)
**Location:** `src/app/api/totp/route.js`, `src/app/api/totp/generate/route.js`
**Description:** Standard string comparison (`===`) was used for password verification.
**Remediation:** Replaced with `crypto.timingSafeEqual` (via SHA-256 hashing) to ensure constant-time password comparison, neutralizing timing-based character guessing.

### 5. Excessive Data Exposure from Database (Fixed)
**Location:** `src/app/api/totp/route.js`
**Description:** The application retrieved sensitive secrets from the database even when only a summary list was requested.
**Remediation:** Implemented MongoDB projections in `GET /api/totp` to explicitly exclude the `secret` field from being fetched when listing entries.

---
## Remediation Summary
The security posture of the application has been significantly strengthened by:
- Centralizing security logic in `src/lib/auth.js`.
- Implementing persistent, database-backed rate limiting.
- Applying global authentication and lockout protection.
- Adopting timing-safe comparison practices.
- Minimizing data retrieval from the database.

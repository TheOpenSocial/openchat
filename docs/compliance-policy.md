# Legal and Compliance Policy Inputs

This project keeps legal/compliance launch inputs explicit and environment-driven.

## Required Inputs

- `TERMS_OF_SERVICE_URL`: published Terms of Service URL.
- `PRIVACY_POLICY_URL`: published Privacy Policy URL.
- `LEGAL_TERMS_VERSION`: active terms version label (for acceptance records).
- `LEGAL_PRIVACY_VERSION`: active privacy-policy version label (for acceptance records).
- `LEGAL_MINIMUM_AGE`: minimum eligible age in years.
- `LEGAL_REGION_MODE`: `off`, `allowlist`, or `denylist`.
- `LEGAL_REGION_COUNTRY_CODES`: comma-separated ISO-3166 alpha-2 country codes.

## Backend APIs

- `GET /api/compliance/policy`
  - returns active legal/compliance inputs + checklist readiness booleans
- `POST /api/compliance/:userId/acceptance`
  - records terms/privacy acceptance with version and timestamp
- `POST /api/compliance/:userId/birth-date`
  - records user birth date for age eligibility decisions
- `GET /api/compliance/:userId/eligibility`
  - evaluates terms/privacy acceptance, age gate, and region policy

## Launch Checklist

- Publish policy URLs and lock versions.
- Define minimum age policy.
- Decide region strategy (`allowlist`/`denylist`/`off`) and configure country codes.
- Validate eligibility decisions with staging users before production rollout.

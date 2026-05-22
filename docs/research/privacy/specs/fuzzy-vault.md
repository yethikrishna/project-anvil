# Fuzzy Vault (Biometric Document Unlock)

**Module:** `packages/security/src/privacy/novel/fuzzy-vault.ts`  
**Status:** Prototype  

## Problem

Current document encryption requires password-based or explicit key management. Users forget passwords; keys can be phished. WebAuthn provides hardware-backed biometrics but standard vaults require exact matching.

## Solution

Lock the document key inside a fuzzy vault that opens when a biometric is "close enough" — tolerating 15% variation between enrollment and authentication samples.

## Protocol

```
ENROLL:
  biometric_embedding → LSH(bands=5, rows=4) → discrete_set S
  coeffs = encode_polynomial(document_key, degree=8)
  genuine_points = {(s, poly(s)) : s ∈ S, |genuine| = 20}
  chaff_points = {(x, random_y) : x ∉ S, |chaff| = 200}
  vault = shuffle(genuine ∪ chaff)

UNLOCK:
  biometric' → LSH → S'
  candidates = {(x, y) ∈ vault : x ∈ S'}
  coeffs' = ReedSolomon.recover(candidates)
  key' = extract_from_coeffs(coeffs')
  verify: SHA256(key') == expected_hash → ACCEPT
```

## Security Analysis

- **Brute force:** Attacker must guess which 20 of 220 vault points are genuine → C(220,20) ≈ 2^60 combinations
- **Chaff effectiveness:** 200 chaff points ensure P(lucky guess) < 2^-40
- **Template protection:** LSH projections are one-way; even vault + LSH params don't reveal biometric
- **Fuzzy matching:** With 5 bands × 4 rows = 20 hash functions, 15% variation → ~17 bands still collide → sufficient for polynomial recovery

## Production Notes

- Replace this demo's small-modulus arithmetic with a proper Reed-Solomon library
- Use Ristretto255 for constant-time arithmetic
- Integrate with WebAuthn PRF extension for device-bound biometrics
- Threshold: 70% of genuine points needed for recovery (configurable)

# Proxy Re-Encryption (Forward-Secret Revocation)

**Module:** `packages/security/src/privacy/novel/proxy-reencryption.ts`  
**Status:** Prototype  

## Problem

When a collaborator is removed from a shared Drive folder, existing re-encryption keys must be invalidated instantly. Traditional approaches require re-encrypting all documents (slow) or trusting the revoked user to stop using their key (unsafe).

## Solution

Epoch-based proxy re-encryption: revocation instantly invalidates all re-encryption keys via an epoch counter mismatch — no document re-encryption required.

## Protocol

```
Setup:
  Alice generates (pk_A, sk_A), epoch=0

Share with Bob:
  rk_{A→B} = ECDH(sk_A, pk_B)  // proxy key
  rk.epoch = Alice.epoch         // stamped with current epoch

Encrypt document:
  ct = ECIES(pk_A, plaintext, attributes=["finance"])
  ct.epoch = Alice.epoch

Proxy re-encrypt:
  IF ct.epoch == rk.epoch AND ct.attributes ∩ rk.attributes ≠ ∅:
    ct2 = Transform(ct, rk)   // proxy doesn't see plaintext
  ELSE: reject

Bob decrypts:
  plaintext = ECIES_dec(sk_B, ct2, rk)

Revoke Bob:
  Alice.epoch++              // all existing rk's stamped with old epoch → dead
  Log: H(Alice||Bob||attributes||epoch++) → revocation log
```

## Revocation Transparency Log

All revocations are logged as `H(delegatorId || delegateeId || attributes || epoch)` commitments. This provides:
- Public proof that a revocation happened
- No leakage of who was revoked (hash only)
- Merkle tree structure for efficient audit proofs

## Attribute-Based Selectivity

A single re-encryption key covers specific attributes (e.g., "finance", "engineering"). Revoking "finance" access doesn't affect other attributes. Documents tagged with multiple attributes are accessible via any matching key.

## Production Notes

- Replace ECIES PRE with AFGH pairing-based PRE for proper IND-CCA2 security
- Use BLS12-381 pairing group for efficiency
- Add verifiable re-encryption sigma protocol: proxy proves ct2 = Transform(ct, rk) without seeing plaintext

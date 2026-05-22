# Accountable Anonymity (Traceable Ring Signatures)

**Module:** `packages/security/src/privacy/novel/accountable-anonymity.ts`  
**Status:** Prototype  

## Problem

Full anonymity (Signal-style) enables abuse with no accountability. Full identification enables surveillance. Whistleblowing, editorial review, and anonymous feedback need a middle ground.

## Solution

Ring signatures with threshold-committee tracing:
- Users sign anonymously ("some member of ring X signed this")  
- A designated k-of-n committee can trace if legally required
- No single party can deanonymize unilaterally

## Key Image Mechanism

Every signing operation produces a key image I = H(private_key || public_key).
- Same user → same key image across sessions
- Different users → different key images (with overwhelming probability)
- Key image reveals nothing about which user produced it
- Double-signing detected by key image collision

## Tracing Protocol

```
Committee setup:
  (pk_tracing, [sk_tracing_1, ..., sk_tracing_n]) = ThresholdKeyGen(k, n)
  
Signing:
  tracing_ciphertext = Enc(pk_tracing, {userId, ringIndex})
  sig = RingSign(message, ring, privateKey, tracing_ciphertext)

Tracing (authorized):
  k committee members submit shares sk_tracing_i
  sk_reconstructed = XOR(shares)  // or Shamir reconstruct
  identity = Dec(sk_reconstructed, sig.tracingCiphertext)
```

## Legal Design

- Tracing requires k-of-n committee approval → prevents single-actor abuse
- Tracing produces a verifiable proof that exactly k shares were used
- All tracing events can be logged publicly (commitment-only) for oversight

## Production Notes

- Replace hash-chain ring signature with full LSAG on Ristretto255
- Use Feldman VSS for verifiable tracing key shares
- Add a "request tracing" protocol with committee vote threshold

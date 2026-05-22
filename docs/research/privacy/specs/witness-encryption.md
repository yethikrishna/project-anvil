# Witness Encryption (Time-Locked Documents)

**Module:** `packages/security/src/privacy/novel/witness-encryption.ts`  
**Status:** Prototype  

## Problem

Documents sometimes need conditional release: "publish this after the board vote", "release this if I'm incapacitated", "reveal this contract on the agreed date".

## Four Lock Types

### 1. Timelock (RSA Sequential Squaring)
- Document key XOR'd with Z = a^(2^t) mod N
- Opener must perform t sequential squarings (cannot parallelize)
- Key holder has shortcut: e = 2^t mod φ(N) → O(log t)
- t calibrated to target duration at hardware speed

### 2. Commitment Reveal
- Witness pre-commits: C = H(secret || salt)
- Document key derived from witness's secret
- Reveal: witness publishes secret → anyone can unlock

### 3. Threshold Committee (k-of-n)
- Document key split into n shares (XOR-based SSS, demo; Shamir's SSS in production)
- k committee members submit reveals → key reconstructed

### 4. Dead Man's Switch
- Owner must check in periodically
- No check-in within `intervalMs` → timelock expires → auto-release
- Check-in requires proof of owner knowledge

## Composability

Locks compose: `(timelock AND committee_vote) OR dead_mans_switch`
Production: implement as a boolean circuit over witness conditions.

## Production Notes

- Replace small-prime RSA (demo) with 2048-bit RSA timelock
- Integrate with external bulletin boards (TOR hidden services, blockchain) for timestamping
- Add a "request early release" flow for committee type

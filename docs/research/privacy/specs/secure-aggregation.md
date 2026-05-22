# Secure Aggregation for AI Training

**Module:** `packages/security/src/privacy/novel/secure-aggregation.ts`  
**Status:** Prototype  

## Problem

Anvil's AI features (smart compose, priority inbox, suggestions) can improve via federated learning, but users shouldn't have to expose individual email or document data to improve the model.

## SecAgg Protocol (4 Phases)

### Phase 1: AdvertiseKeys
Each user generates ECDH (encryption) and ECDSA (auth) key pairs, publishes public keys.

### Phase 2: Pairwise Mask Generation
For each pair (i, j): shared_mask_ij = PRG(ECDH(sk_i, pk_j))
Direction: i < j → +1; i > j → -1 (ensures sum cancels)

### Phase 3: Masked Gradient Submission
```
gradient' = clip(gradient, L2_norm=1.0)
masked = gradient' + Gaussian_noise(σ) + Σ(direction × pairwise_mask)
submit: (masked, commitment=H(gradient || salt), dp_proof)
```

### Phase 4: Unmask + Verify
Server sums masked gradients → pairwise masks cancel → gets aggregate.
Each user verifies inclusion via commitment + server inclusion proof.

## Novel Additions vs SecAgg (Google 2017)

| Feature | SecAgg 2017 | This implementation |
|---------|-------------|---------------------|
| Dropout recovery | ✓ | ✓ |
| DP noise | Separate | Integrated at client |
| Audit trail | ✗ | Commitment-based |
| DP noise proof | ✗ | Bounding + distribution cert |
| Streaming | ✗ | Chunked aggregation |

## Privacy Guarantee

- Each gradient: (ε = 1/(2σ²))-DP per round
- Accumulated over R rounds: use Rényi DP composition
- With σ = 1.1 and clipping norm = 1.0: ε ≈ 0.41 per round

## Production Notes

- Replace XOR-based pairwise masking with PRG(AES-CTR, seed=ECDH_shared_secret)
- Use Shamir shares for individual seed reconstruction (handles dropouts)
- Add verifiable secret sharing for robust dropout recovery

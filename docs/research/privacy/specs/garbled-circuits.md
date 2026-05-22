# Garbled Circuit Search

**Module:** `packages/security/src/privacy/novel/garbled-circuits.ts`  
**Status:** Prototype  

## Problem

Homomorphic search (#2) covers keyword matching via Bloom filters. But users often need structured queries: "files modified between Jan-Mar", "attachments larger than 10MB", composite predicates. These don't fit the Bloom filter model.

## Solution

Yao's garbled circuits applied to document metadata predicates. Server evaluates the predicate without learning the predicate's values.

## Optimizations

- **Free-XOR:** All XOR gates are free (zero ciphertexts). Only AND gates cost.  
- **Half-Gates:** AND gate costs 2 ciphertexts instead of 4 (Zahur et al., 2015).  
- **Point-Permute:** Evaluator's select bit embeds in label LSB; no table lookup needed.  

## Performance

| Predicate | Gates | Ciphertexts | Estimated time |
|-----------|-------|-------------|----------------|
| Date range check | ~200 AND, ~300 XOR | 400 | ~0.5ms |
| Size range check | ~200 AND, ~300 XOR | 400 | ~0.5ms |
| Composite (2×) | ~500 AND, ~700 XOR | 1000 | ~1.2ms |

## Privacy Guarantee

Semi-honest model: Server learns only the output bit. All gate-level structure is computationally indistinguishable from random. Evaluator cannot infer: query values, predicate type, or intermediate results.

## Production Notes

- Replace hash-based PRF with AES-based fixed-key PRF
- Use UC-secure OT (e.g., SimplestOT) for input label transfer
- Support streaming evaluation for large document sets (batched circuit evaluation)

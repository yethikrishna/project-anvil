# VRF-Based Conflict Resolution for CRDTs

**Spec ANVIL-PRIV-007** | Version 0.1 | 2026-05-22

## Abstract

CRDTs resolve conflicts deterministically using built-in semilattice rules (e.g., last-writer-wins by timestamp). However, timestamp-based resolution trusts the client's clock and creates a single point of manipulation. We present VRF-Based Conflict Resolution, where each client computes a Verifiable Random Function (VRF) over their operation, and the conflict winner is determined by comparing VRF outputs. This provides unpredictable, verifiable, and fair conflict resolution without trusting any single client's clock or a central server.

## 1. Problem with Timestamp-Based Resolution

LWW-Register (the most common CRDT) resolves conflicts by timestamp:
1. Client A writes value $v_A$ at timestamp $t_A$
2. Client B writes value $v_B$ at timestamp $t_B$
3. Winner: whichever has higher timestamp

**Issues:**
1. **Clock manipulation:** A malicious client can set $t = \infty$ to always win
2. **Clock skew:** NTP drift causes legitimate operations to lose unfairly
3. **Centralization:** Server timestamps create a trusted third party
4. **Predictability:** An adversary can predict which operation will win and strategically time their edits

## 2. VRF-Based Resolution

### 2.1 Verifiable Random Functions

A VRF is a cryptographic primitive:
- **Input:** Secret key $sk$, public input $x$
- **Output:** $(y, \pi)$ where $y = VRF_{sk}(x)$ and $\pi$ is a proof
- **Properties:**
  - **Uniqueness:** For each $(sk, x)$, exactly one valid $y$ exists
  - **Unpredictability:** Without $sk$, $y$ looks random
  - **Verifiability:** Anyone can verify $(y, \pi)$ against the public key $pk$

### 2.2 Conflict Resolution Protocol

When two operations $op_A$ and $op_B$ are concurrent:

1. **Each client computes VRF over their operation:**
   - $A$: $(y_A, \pi_A) = VRF_{sk_A}(op_A.id \| epoch)$
   - $B$: $(y_B, \pi_B) = VRF_{sk_B}(op_B.id \| epoch)$

2. **Compare VRF outputs:**
   - If $y_A < y_B$: $A$ wins
   - If $y_B < y_A$: $B$ wins
   - (Collision probability: negligible with 256-bit output)

3. **Weighted scoring (novel):**
   - Each operation gets a weight based on:
     - **Base weight** (default 1.0 per party)
     - **Staleness penalty:** older operations get reduced weight
     - **Size bonus:** larger edits get slight advantage (more work invested)
   - Combined score: $score = y / weight$
   - Lower combined score wins

4. **Verification:**
   - Anyone can verify both VRF outputs against public keys
   - Resolution is deterministic: same conflict always resolves the same way
   - No trust in any single party's clock or randomness

### 2.3 Fairness

Over many conflicts:
- Each party wins approximately proportionally to their weight
- VRF outputs are pseudorandom, so no party can predict or bias the outcome
- Statistical fairness: after $N$ conflicts between two equal parties, each wins $\approx N/2$

### 2.4 Weighted Fairness

For scenarios requiring weighted fairness (e.g., senior editors win more):

$$weight_i = base + staleness\_bonus + size\_bonus$$

$$combined_i = \frac{VRF_i}{weight_i}$$

This gives higher-weight parties a slight advantage while maintaining unpredictability.

## 3. Security Properties

| Property | Guarantee |
|----------|-----------|
| Unpredictability | No one can predict which operation will win before VRF computation |
| Uniqueness | Each (key, input) pair produces exactly one output |
| Verifiability | Anyone can verify the resolution was correct |
| Fairness | Statistical fairness across many conflicts |
| Determinism | Same inputs always produce the same resolution |
| No trusted third party | No central server or clock needed |

## 4. Performance

| Operation | Time | Notes |
|-----------|------|-------|
| VRF evaluation | ~0.5ms | H(SK ∥ input) |
| VRF verification | ~0.5ms | Check proof against PK |
| Conflict resolution (2 ops) | ~1ms | Compare + score |
| Full resolution (n ops) | ~O(n log n) | Sort by combined score |

## 5. Integration with Anvil Docs

```
Client A (editing)         Server (relay)          Client B (editing)
      │                         │                         │
      │── op_A + VRF_A ────────▶│                         │
      │                         │◀── op_B + VRF_B ────────│
      │                         │                         │
      │                         │── resolve(VRF_A, VRF_B) │
      │                         │   winner = min(y_A, y_B)│
      │                         │                         │
      │◀─ resolution + proof ───│── resolution + proof ──▶│
      │                         │                         │
      │  (verify VRF locally)   │         (verify VRF)    │
```

### 5.1 VRF Key Lifecycle

- **Per-session key:** Each editing session generates a fresh VRF key pair
- **Key registration:** Public key registered with the document session
- **Key rotation:** New key per epoch (e.g., every 100 operations)
- **Key archival:** Old keys stored for resolution verification of past conflicts

### 5.2 Committee Mode (Optional)

For high-stakes documents (legal, financial):
1. Use $m$-of-$n$ committee VRF: $y = \text{median}(VRF_1, \ldots, VRF_n)$
2. Each committee member independently evaluates VRF
3. Result is unpredictable unless $> m$ members collude
4. Verifiable: all committee VRF proofs are public

## 6. Comparison with Other Resolution Strategies

| Strategy | Fair | Unpredictable | Verifiable | No TTP | Manipulation-resistant |
|----------|------|--------------|------------|--------|----------------------|
| LWW by timestamp | ✗ | ✗ | ✗ | ✗ | ✗ |
| Deterministic hash | ✓ | ✗ | ✓ | ✓ | ✗ |
| Server-decided | ✗ | ✓ | ✗ | ✗ | ✗ |
| **VRF (ours)** | **✓** | **✓** | **✓** | **✓** | **✓** |

## 7. Open Problems

1. **Multi-party conflicts:** 3+ concurrent operations — tournament or single-pass?
2. **VRF key escrow:** What if a party loses their VRF key mid-conflict?
3. **Weight manipulation:** How to prevent parties from artificially inflating operation size?
4. **Composability with encrypted CRDTs:** VRF input must be visible even when operations are encrypted
5. **Post-quantum VRF:** Current VRFs rely on discrete log; lattice-based VRFs are an open problem

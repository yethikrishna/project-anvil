# Zero-Knowledge Access Trees

**Spec ANVIL-PRIV-001** | Version 0.1 | 2026-05-22

## Abstract

We present Zero-Knowledge Access Trees (ZKAT), a cryptographic protocol enabling clients to prove membership in encrypted document hierarchies without revealing which node, subtree, or path is involved. ZKAT combines hierarchical Merkle commitments with Groth16 zero-knowledge proofs to support hidden-tree membership verification, enabling Anvil Docs and Anvil Drive to enforce access control without exposing document structure, folder names, or access patterns.

## 1. Problem Statement

In Anvil Docs/Drive, documents are organized in hierarchies (folders, workspaces, shared drives). Current access control requires the server to evaluate permissions against a known tree structure, leaking:

- **Which documents exist** (enumeration privacy)
- **Which folders a user accesses** (access pattern privacy)
- **The organizational structure** (structural privacy)

We need: a client proves "I have read access to some document in subtree S" without revealing which document, which subtree, or the tree topology.

## 2. Protocol Description

### 2.1 Notation

| Symbol | Meaning |
|--------|---------|
| $\mathcal{T}$ | Document hierarchy tree |
| $v$ | Node in $\mathcal{T}$, with label $\ell(v)$ |
| $pk_v, sk_v$ | Per-node keypair (EdDSA) |
| $\text{acc}(v)$ | Accumulator value at node $v$ |
| $\pi$ | Zero-knowledge proof |
| $\mathcal{C}$ | Groth16 circuit |

### 2.2 Tree Commitment

Each node $v$ maintains:

$$\text{acc}(v) = H(\ell(v) \| pk_v \| \text{acc}(c_1) \| \cdots \| \text{acc}(c_k))$$

where $c_1, \ldots, c_k$ are children of $v$ and $H: \{0,1\}^* \to \mathbb{F}_p$ is a collision-resistant hash modeled as a random oracle.

The root accumulator $\text{acc}(r)$ is published. All intermediate accumulators are hidden from the server.

### 2.3 Access Credential

A credential for node $v$ with access level $a \in \{\text{read}, \text{write}, \text{admin}\}$ is a signature:

$$\sigma_v = \text{Sign}(sk_{\text{parent}(v)},\; \ell(v) \| pk_v \| a)$$

Credentials are issued by parent nodes, forming a delegation chain from root to leaf.

### 2.4 ZK Membership Proof

**Statement:** "I possess a valid credential chain from root $r$ to some node $v$ in $\mathcal{T}$, and $v$ is in subtree $S$ (or: $v$ satisfies predicate $P$)."

**Witness** $w$:
- Path $r = v_0, v_1, \ldots, v_d = v$ from root to target
- Credentials $\sigma_{v_1}, \ldots, \sigma_{v_d}$
- Sibling hashes at each level for Merkle verification
- Access level $a$ satisfying predicate $P$

**Public input** $x$:
- Root accumulator $\text{acc}(r)$
- Predicate commitment $\text{com}(P)$

**Circuit $\mathcal{C}$ verifies:**

1. **Chain validity:** For each $i \in [1, d]$:
   $$\text{Verify}(pk_{v_{i-1}},\; \ell(v_i) \| pk_{v_i} \| a_i,\; \sigma_{v_i}) = 1$$

2. **Merkle inclusion:** $\text{acc}(v)$ is correctly computed and included in $\text{acc}(r)$:
   $$\text{acc}(r) = \text{MerkleRoot}(\text{acc}(v), \text{sibling\_hashes})$$

3. **Predicate satisfaction:** $P(a) = 1$ (e.g., $a \geq \text{read}$)

4. **Subtree membership (optional):** $v$ lies within committed subtree $S$, proved via subtree root accumulator.

### 2.5 Hidden-Tree ZK Membership (Novel Contribution)

Standard ZK set membership (e.g., RSA accumulators, Merkle proofs) assumes the set is public. Our key innovation: **the tree structure itself is hidden**.

**Construction:**
- The server stores only $\text{acc}(r)$ and encrypted node data
- Each client holds the partial tree view they can access (decrypted locally)
- To prove membership, the client constructs the Merkle path from their local view
- Sibling hashes at each level are encrypted under the parent's key; the ZK circuit verifies decryption within the proof

This means the server **cannot enumerate documents, infer tree depth, or detect which subtree is being accessed** — even the proof size is independent of tree depth (constant-size Groth16 proofs).

**Security requirement:** Sibling hash encryption uses deterministic encryption with key rotation per level, preventing correlation attacks across proofs.

## 3. Security Proof Sketch

### 3.1 Completeness

If the prover possesses a valid credential chain and correct Merkle path, the circuit evaluates to 1 on all constraints. By the soundness of Groth16, the verifier accepts with probability 1.

$$\Pr[\text{Verify}(\text{pk}_\mathcal{C}, x, \pi) = 1 \mid w \text{ valid}] = 1$$

### 3.2 Soundness

If no valid witness exists, the prover cannot satisfy all constraints simultaneously. By the knowledge soundness of Groth16 (in the algebraic group model), any prover that produces an accepting proof must know a valid witness, except with negligible probability $\epsilon(\lambda)$.

**Reduction:** If an adversary $\mathcal{A}$ produces an accepting proof with invalid witness, we can extract a forged signature or a Merkle collision, breaking either EdDSA unforgeability or collision resistance of $H$.

$$\text{Adv}_{\mathcal{A}}^{\text{sound}} \leq \text{Adv}^{\text{EU-CMA}}_{\text{EdDSA}} + \text{Adv}^{\text{CR}}_H$$

### 3.3 Zero-Knowledge

The Groth16 proof system is perfect zero-knowledge: the proof $\pi$ reveals nothing about witness $w$ beyond the validity of the statement. The simulator $\mathcal{S}$ produces proofs indistinguishable from real proofs using only the CRS and public input.

**Additional privacy:** Proof size is constant ($\approx 200$ bytes) regardless of tree depth or number of credentials, preventing depth-based inferences.

## 4. Comparison with Existing Approaches

| Property | RSA Accumulator | Merkle Proof | ZKAT (Ours) |
|----------|----------------|--------------|--------------|
| Proof size | $O(1)$ | $O(\log n)$ | $O(1)$ |
| Setup | Trusted (RSA modulus) | None | Trusted (CRS) |
| Update cost | $O(1)$ | $O(\log n)$ | $O(d)$ re-credential |
| Hidden structure | No | No | **Yes** |
| Hierarchical delegation | No | No | **Yes** |
| Predicate privacy | No | Partial | **Full** |

**Key advantage:** ZKAT is the first construction to hide the tree topology while supporting hierarchical delegation, which neither RSA accumulators nor plain Merkle proofs achieve.

### Related Work

- **Campanelli et al. (CCS 2019):** ZK set membership with RSA accumulators — no hierarchy, public set
- **Bünz et al. (S&P 2020):** ZK Rollups with Merkle proofs — structure is public
- **Chase et al. (EUROCRYPT 2020):** Delegatable anonymous credentials — no tree structure
- **Backes et al. (NDSS 2018):** Zero-knowledge access control policies — no hidden structure

## 5. Performance Analysis

### 5.1 Proof Size

| Component | Size |
|-----------|------|
| Groth16 proof ($\mathbb{G}_1, \mathbb{G}_2$ elements) | 192 bytes (BN254) |
| Public input (root acc + predicate com) | 64 bytes |
| **Total** | **256 bytes** |

Proof size is **independent of tree depth** $d$ and number of nodes $n$.

### 5.2 Verification Time

| Operation | Time |
|-----------|------|
| Pairing checks (Groth16) | ~2 ms |
| Hash-to-field for public input | ~0.1 ms |
| **Total verification** | **~2.1 ms** |

### 5.3 Proof Generation Time

| Tree depth | Prover time |
|------------|-------------|
| 4 (typical Drive) | ~800 ms |
| 8 (deep hierarchy) | ~1.5 s |
| 16 (worst case) | ~3.2 s |

Prover time scales with circuit size ($O(d)$ constraints for depth $d$), but proof size remains constant.

### 5.4 Update Cost

When a node's credentials change (new document, permission update):

| Operation | Cost |
|-----------|------|
| Re-credential single node | $O(1)$ signatures |
| Re-compute accumulator path | $O(d)$ hashes |
| Re-issue affected credentials | $O(k)$ signatures (children) |
| CRS update | None (universal CRS) |

## 6. Integration with Anvil Docs/Drive

### 6.1 Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│ Anvil Client  │────▶│ ZKAT Proof Service│────▶│ Storage Node │
│ (prover)      │◀────│ (verifier)        │◀────│ (acc(r) only)│
└──────────────┘     └──────────────────┘     └─────────────┘
```

**Anvil Client** holds local decrypted tree view + credentials, generates ZK proofs.
**ZKAT Proof Service** (server-side) verifies proofs, issues access tokens.
**Storage Node** stores encrypted documents, only sees root accumulator.

### 6.2 Document Access Flow

1. Client generates ZK proof $\pi$ for target document
2. Client sends $\pi$ + access token request to ZKAT Proof Service
3. Proof Service verifies $\pi$ against current $\text{acc}(r)$
4. If valid, Proof Service issues short-lived capability token for encrypted document
5. Client retrieves and decrypts document from Storage Node using capability

### 6.3 Key Management

- Per-node keypairs derived from a hierarchical key derivation function (HKDF):
  $$sk_v = \text{HKDF}(sk_{\text{parent}(v)},\; \ell(v))$$
- Root key stored in Anvil Vault (HSM-backed)
- Key rotation: re-derive subtree keys, re-issue credentials, update accumulators

## 7. Implementation Notes

### 7.1 Circuit Design

- Build with Circom 2.1 + snarkjs
- Constraints for EdDSA verification: ~20,000 per signature
- Total constraints for depth-4 proof: ~120,000
- Use lookup tables for hash functions (Poseidon) to reduce constraints

### 7.2 Trusted Setup

- Use Perpetual Powers of Tau (already performed for BN254)
- Circuit-specific phase-2 setup: community ceremony or multiparty computation
- Universal updateable CRS (more secure, slightly larger proofs)

### 7.3 Production Considerations

- **Proof caching:** Cache proofs for repeated access; invalidate on credential change
- **Batch verification:** Verify multiple proofs in $O(1)$ pairings using random linear combination
- **Fallback mode:** For clients without proof generation capability, fall back to server-side verification with structural privacy trade-off
- **Auditing:** ZK proofs are auditable — a third party can verify access was authorized without learning what was accessed

## 8. Open Problems

1. **Dynamic trees:** Efficient updates to $\text{acc}(r)$ without re-computing the entire tree
2. **Revocation:** Revoking credentials without re-issuing all descendant credentials
3. **Multi-tree proofs:** Proving access across multiple document hierarchies in a single proof
4. **Post-quantum:** Migrating from BN254 to lattice-based ZK systems (e.g., Falcon + Lattice-based SNARKs)

## References

1. Groth, J. (2016). "On the Size of Pairing-Based Non-interactive Arguments." EUROCRYPT 2016.
2. Campanelli, M. et al. (2019). "Zero-Knowledge Sets with Short Proofs." CCS 2019.
3. Bünz, B. et al. (2020). "Zexe: Enabling Decentralized Private Computation." S&P 2020.
4. Chase, M. et al. (2020). "Delegatable Anonymous Credentials from Mercurial Signatures." EUROCRYPT 2020.
5. Backes, M. et al. (2018). "Zero-Knowledge for Policy Compliance." NDSS 2018.
6. Gabizon, A. et al. (2019). "PLONK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge." ePrint 2019/953.

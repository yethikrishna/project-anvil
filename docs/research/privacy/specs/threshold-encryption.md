# Threshold Document Encryption (TDE)

**Spec ANVIL-PRIV-004** | Version 0.1 | 2026-05-22

## Abstract

Shared documents in Anvil Docs are encrypted with a single symmetric key stored on the server or derived from each user's password. Threshold Document Encryption (TDE) splits the document key using Shamir's Secret Sharing with Feldman Verifiable Secret Sharing (VSS), so that **k-of-n authorized parties must collaborate to decrypt**. No single party — including the server — can decrypt alone. Key resharing enables adding/removing editors without re-encrypting the document.

## 1. Motivation

Current shared document encryption requires trusting the key management service:
- The server holds the document key to enable server-side operations (search, thumbnails)
- Key escrow: if the server is compromised, all shared documents are exposed
- No quorum enforcement: any single authorized user can decrypt and exfiltrate

TDE eliminates these by distributing trust across multiple parties.

## 2. Protocol

### 2.1 Key Splitting

Given document key $K$ and threshold parameters $(k, n)$:

1. Generate random polynomial: $f(x) = K + a_1 x + a_2 x^2 + \ldots + a_{k-1} x^{k-1} \mod p$
2. Evaluate at $x = 1, 2, \ldots, n$ to get shares $s_i = f(i)$
3. Feldman commitments: $C_j = g^{a_j}$ for $j = 0, \ldots, k-1$
4. Share verification: $g^{s_i} = \prod_{j=0}^{k-1} C_j^{i^j}$

### 2.2 Encryption

1. Document encrypted with $K$ using XChaCha20-Poly1305
2. Each party receives their share $(i, s_i)$ privately
3. Feldman commitments are stored on the server (public)
4. Quorum commitment: $Q = H(K \| k \| n)$ stored for verification

### 2.3 Decryption (k-of-n)

1. Any $k$ parties contribute partial decryptions
2. Lagrange interpolation at $x = 0$: $K = \sum_{i=1}^{k} s_i \cdot L_i(0) \mod p$
3. Each party proves their partial decryption is correct (NIZK)
4. Reconstruct $K$, decrypt document

### 2.4 Key Resharing

Adding/removing editors without re-encryption:
1. Old shares → new polynomial → new shares (same secret $K$)
2. Transition proof: demonstrates old and new commitments commit to same $K$
3. No party ever reconstructs $K$ during resharing

## 3. Security Properties

| Property | Guarantee |
|----------|-----------|
| Confidentiality | Fewer than $k$ shares reveal nothing about $K$ |
| Verifiability | Each share can be verified against Feldman commitments |
| Forward security | Old shares don't help after resharing |
| No single point of failure | No single party holds the full key |

## 4. Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Split key (k=3, n=5) | ~2ms | Polynomial evaluation |
| Encrypt document (1MB) | ~5ms | XChaCha20 |
| Reconstruct (k=3) | ~1ms | Lagrange interpolation |
| Verify share | ~0.5ms | Feldman check |
| Reshare (5→7 parties) | ~3ms | New polynomial |

## 5. Anvil Integration

```
┌──────────┐     ┌─────────────────┐     ┌──────────┐
│ Client A │────▶│  Anvil Server   │◀────│ Client B │
│ (share 1)│     │  (commitments)  │     │ (share 2)│
└──────────┘     └─────────────────┘     └──────────┘
                        │
                  ┌──────────┐
                  │ Client C │
                  │ (share 3)│
                  └──────────┘

Decryption: A + B + C → K → document
Server sees only commitments, never K
```

### 5.1 Share Distribution

Shares are encrypted with each editor's public key and stored in the document metadata:
```
document.shares = [
  { partyId: "alice", encryptedShare: "...", commitment: "..." },
  { partyId: "bob", encryptedShare: "...", commitment: "..." },
  { partyId: "charlie", encryptedShare: "...", commitment: "..." },
]
```

### 5.2 Quorum Enforcement

When a client requests a document:
1. Server checks client has a valid share
2. Server collects $k$ share contributions
3. Server verifies partial decryption proofs
4. Client reconstructs $K$ locally and decrypts

### 5.3 Editor Lifecycle

- **Add editor:** Reshare with $(k, n+1)$ — no re-encryption
- **Remove editor:** Reshare with $(k, n-1)$ — old shares invalidated
- **Change threshold:** Reshare with $(k', n)$ — new quorum

## 6. Open Problems

1. **Asynchronous decryption:** What if not all $k$ parties are online? Use time-locked shares as fallback.
2. **Share recovery:** Lost share without full reconstruction? Use share-level backup encryption.
3. **Hierarchical thresholds:** Different thresholds for different document sections.
4. **Post-quantum threshold:** Lattice-based secret sharing (not Shamir) for quantum resistance.

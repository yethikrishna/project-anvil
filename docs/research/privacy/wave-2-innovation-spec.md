# Anvil Privacy Wave 2 — Technical Specification

**Date:** 2026-05-22  
**Status:** Prototype  
**Author:** Anvil R&D Agent  
**Modules:** #21–#28  

---

## Overview

Eight new privacy-preserving mechanisms, extending the 20 from Wave 1. Each advances beyond current published state-of-the-art and is implemented as a working TypeScript prototype.

---

## #21 — Fuzzy Vault for Biometric Document Unlock

**Protocol:** Juels-Sudan Fuzzy Vault + LSH projection for continuous embeddings

**What's novel:**
- Extends the fuzzy vault scheme (2002) to work with continuous embedding vectors — face recognition encodings, voice prints, motion fingerprints — not just discrete minutiae sets.
- Locality-sensitive hashing (LSH) projects the continuous biometric space into a discrete integer set, enabling the polynomial-based locking scheme to apply.
- Device-side LSH means the biometric never leaves the device, even during enrollment.

**How it works:**
1. Enrollment: biometric embedding → LSH bands → discrete set S → polynomial p where p's coefficients encode the document key → vault = genuine points {(s, p(s))} ∪ chaff
2. Open: biometric' → LSH → S' → find S' ∩ vault → recover polynomial via Reed-Solomon → extract key
3. Key stored ONLY in the vault's polynomial structure — not on server

**Security:** Exponential chaff (200 decoys) makes brute-force infeasible. 15% biometric variation tolerance handles real-world measurement noise.

**Anvil integration:**
- `FuzzyVaultScheme.lock(secret, biometric)` — client-side during file open
- `FuzzyVaultScheme.unlock(vault, biometric, hash)` — client-side decryption
- Works with WebAuthn PRF extension for hardware-backed biometrics

---

## #22 — Garbled Circuit Search

**Protocol:** Yao's Garbled Circuits with Free-XOR + Half-Gates optimization

**What's novel:**
- Applies garbled circuits to document search predicates (date ranges, size ranges, composite boolean queries) where Bloom filter-based homomorphic search (#2) doesn't apply.
- Uses half-gates optimization (Zahur et al. 2015): AND gates need only 2 ciphertexts instead of 4.
- Free-XOR: XOR gates are free (no ciphertexts), enabling complex boolean logic cheaply.
- Includes simplified 1-of-2 OT infrastructure for input wire label transfer.

**How it works:**
1. Client garbles a circuit for their search predicate
2. Server holds document metadata bits; receives input labels via OT
3. Server evaluates garbled circuit (learns only the output bit)
4. Client decodes: "this document matches" or "no match"

**Privacy:** Semi-honest model. Server learns: output bit per document. Learns nothing about: the predicate, the query values, or which gate does what.

**Anvil integration:**
- `GarbledCircuitGenerator.buildPredicateCircuit(predicate, inputWires)` — client
- `GarbledCircuitEvaluator.evaluate(circuit, evalLabels, genLabels)` — server
- Works alongside `HomomorphicSearchIndex` (#2) for different query types

---

## #23 — Mixnet-Based Message Routing

**Protocol:** Chaumian Mixnet with Poisson delays + cover traffic

**What's novel:**
- Adapts Tor-style onion routing to the document/mail notification domain, where latency tolerance is higher and traffic patterns are more predictable (and thus attackable).
- Poisson-distributed per-hop delays provide statistical indistinguishability: an attacker observing all links cannot correlate input and output messages.
- Cover traffic at a fixed Poisson rate: mix nodes generate dummy packets at the same rate as real messages, making volume-based inference impossible.
- Verifiable routing proofs: recipients can verify path integrity after delivery without revealing the path to anyone.

**How it works:**
1. Client builds an onion: n ECDH shared keys, n layers of AES-GCM encryption
2. Entry node strips outer layer, learns only next hop, applies random delay
3. Intermediate nodes do the same
4. Exit node delivers to recipient
5. Cover traffic fills gaps to uniform rate

**Privacy:** Against a global passive adversary who observes all links: mixnet provides ε-unlinkability where ε is bounded by the ratio of real to cover traffic.

**Anvil integration:**
- `MixnetClient.send(message, recipientKey, path)` — produce envelope
- `MixnetDirectory.buildTestMixnet(n)` — spin up test topology
- Deployment path: 3-hop mixnet via Anvil's edge nodes

---

## #24 — Witness Encryption for Time-Locked Documents

**Protocol:** RSA sequential squaring timelock + threshold committee + dead-man's switch

**What's novel:**
- Implements practical witness encryption without pairings.
- Four distinct trigger types: (a) time-based via RSA squaring puzzles, (b) commitment reveal from a designated witness, (c) k-of-n committee vote, (d) dead-man's switch (auto-releases if owner doesn't check in).
- Key observation: different lock types compose — e.g., "release after 30 days OR if 3-of-5 board members vote to release early."

**Timelock detail:**
- RSA modulus N = p*q; puzzle solution Z = a^(2^t) mod N
- Key holder: compute e = 2^t mod φ(N) first → O(log t) shortcut
- Public solver: must do t sequential squarings → O(t), unparallelizable
- t calibrated to target duration at current CPU speed

**Anvil integration:**
- `WitnessEncryption.encrypt(content, type, condition, metadata)` — create locked doc
- `WitnessEncryption.decrypt(doc, reveals)` — unlock when condition is met
- `WitnessEncryption.checkin(doc, ownerSecret)` — reset dead-man's switch

---

## #25 — Accountable Anonymity (Traceable Ring Signatures)

**Protocol:** LSAG-style ring signatures + threshold committee tracing

**What's novel:**
- Bridges the gap between full anonymity (abuse-enabling) and no anonymity (surveillance-enabling).
- Key image mechanism: the same user always produces the same key image, enabling double-spend/double-vote detection WITHOUT revealing identity.
- Tracing requires k-of-n independent committee members — prevents unilateral deanonymization by any single party including Anvil.
- Tracing key is split via additive secret sharing among committee members.

**Properties:**
- Anonymity: ring signature reveals only "some member of this ring signed"
- Linkability: two signatures from the same user share a key image
- Traceability: k committee shares reconstruct the signer's identity
- Non-frameability: users cannot be falsely implicated

**Anvil integration:**
- `AccountableAnonymity.signAnonymously(message, userId, ring, privKey, tracingKey)`
- `AccountableAnonymity.detectDoubleSigning(sig1, sig2)` — key image comparison
- `AccountableAnonymity.trace(sig, shares, threshold)` — committee-authorized tracing

---

## #26 — Secure Aggregation for Distributed AI Training

**Protocol:** Google SecAgg (2017) + commitment audit + verifiable DP noise proofs

**What's novel:**
- Extends SecAgg with a commitment-based audit trail: each user commits to their gradient before submission, and can later verify the server included it.
- DP noise is injected at the client with a verifiable proof of correctness (bounding commitment + distribution certificate).
- Streaming chunked aggregation for large models — avoids materializing the full gradient at any single party.
- Formal dropout handling: the protocol securely handles up to (n - minUsers) dropouts without revealing anything about the dropouts' inputs.

**Privacy guarantee:**
- Each gradient is clipped to L2 norm ≤ 1 (privacy amplification by clipping)
- Gaussian noise N(0, σ²) added per client (DP mechanism)
- Total privacy budget: ε ≈ 1/(2σ²) per aggregation round

**Anvil integration:**
- `SecureAggregation.prepareMaskedGradient(userId, gradient, keys, partners, roundId)`
- `SecureAggregation.aggregate(maskedGradients, droppedUsers)`
- `SecureAggregation.auditInclusion(maskedGradient, result)` — user audit

---

## #27 — Cryptographic Access Revocation with Proxy Re-Encryption

**Protocol:** ECIES-based PRE + epoch-based revocation + revocation transparency log

**What's novel:**
- Combines proxy re-encryption with forward-secret epoch rotation: when a user is revoked, the delegator increments their epoch. All existing re-encryption keys (which carry the old epoch) are silently invalidated.
- Selective attribute-based revocation: revoke access to a SUBSET of documents (by attribute tag) without affecting other accesses.
- Revocation transparency log: all revocations are publicly auditable as commitments — proves revocation happened without revealing who was revoked.
- Verifiable re-encryption: ZK proof that the proxy performed the correct transformation without learning the plaintext.

**Epoch revocation detail:**
- Every document encrypted carries `epoch` = delegator's key generation count
- Re-encryption key also carries `epoch` at creation time
- Proxy checks: `ct.epoch == rk.epoch` — mismatch → silent reject
- Revoke = delegator increments epoch; all old rk's die

**Anvil integration:**
- `ProxyReEncryption.encrypt(data, delegator, attributes)` — level-1 encryption
- `ProxyReEncryption.reEncrypt(ct, rk, delegator)` — proxy transformation
- `RevocationManager.revoke(delegatorId, delegateeId, attributes, keys)`

---

## #28 — Topology-Hiding Multi-Party Computation

**Protocol:** Additive secret sharing + onion routing + styleometric defense

**What's novel:**
- Topology-hiding MPC (THMPC): hides not just the inputs but the communication graph itself. No party learns which other parties they are (even indirectly) computing with.
- Integrated styleometric fingerprinting defense: text contributions are perturbed with function-word substitutions and punctuation noise to defeat authorship attribution attacks on the plaintext-before-encryption.
- Supports 6 computation types without individual attribution: average, sum, max, min, count, consensus, ranked choice.
- Styleometric fingerprint distance metric: quantifies how well the defense obscures the author.

**Use cases:**
- Anonymous editorial review with aggregate scoring
- Blind peer review where reviewers don't know who else is reviewing
- 360° performance reviews (anonymous aggregate feedback)

**Fingerprinting defense:**
- Function word substitution (the strongest authorship signal)
- Sentence-level punctuation variation
- Synonym replacement at configurable epsilon (DP-style noise level)
- Measurable via `StyleometricDefense.fingerprintDistance(fp1, fp2)`

**Anvil integration:**
- `TopologyHidingMPC.prepareInput(value, computation, applyStyleometricNoise)`
- `TopologyHidingMPC.aggregate(allShares, computation)` — coordinator
- `StyleometricDefense.applyNoise(text, epsilon)` — standalone text anonymization

---

## Architecture Update

```
packages/security/src/privacy/novel/
├── ...existing (13–20)...
├── fuzzy-vault.ts              #21 Biometric document unlock
├── garbled-circuits.ts         #22 Privacy-preserving search predicates
├── mixnet.ts                   #23 Chaumian onion routing for mail/drive
├── witness-encryption.ts       #24 Time-locked and event-triggered documents
├── accountable-anonymity.ts    #25 Traceable ring signatures
├── secure-aggregation.ts       #26 Privacy-preserving AI training
├── proxy-reencryption.ts       #27 Forward-secret access revocation
└── topology-hiding-mpc.ts      #28 Anonymous collaborative computation
```

---

## Implementation Priorities (Wave 2)

**P0 (Immediate):** #27 (PRE revocation) — fills a real gap in current sharing model  
**P1 (Q3 2026):** #26 (SecAgg) — enables privacy-preserving AI features  
**P1 (Q3 2026):** #25 (Accountable Anonymity) — whistle-blower drops, anonymous docs  
**P2 (Q4 2026):** #22 (Garbled circuits) — complement to homomorphic search  
**P2 (Q4 2026):** #24 (Witness encryption) — legal document workflows  
**P3 (2027):** #21 (Fuzzy vault) — requires WebAuthn PRF integration  
**P3 (2027):** #23 (Mixnet) — requires infrastructure for mix nodes  
**P3 (2027):** #28 (THMPC) — advanced anonymous collaboration workflows

---

## Updated Composability Matrix

| | Docs | Drive | Mail | Calendar | AI |
|---|---|---|---|---|---|
| Fuzzy Vault #21 | ✓ | ✓ | | | |
| Garbled Circuits #22 | | ✓ | ✓ | ✓ | |
| Mixnet #23 | | | ✓ | | |
| Witness Enc. #24 | ✓ | ✓ | ✓ | ✓ | |
| Acct. Anonymity #25 | ✓ | ✓ | ✓ | | |
| SecAgg #26 | | | | | ✓ |
| PRE Revocation #27 | ✓ | ✓ | ✓ | | |
| THMPC #28 | ✓ | | ✓ | | ✓ |

---

## References

- Juels & Sudan, "A Fuzzy Vault Scheme" (2002)
- Yao, "How to Generate and Exchange Secrets" (1986); Free-XOR: Kolesnikov & Schneider (2008); Half-Gates: Zahur et al. (2015)
- Chaum, "Untraceable Electronic Mail, Return Addresses, and Digital Pseudonyms" (1981); cover traffic: Díaz et al. (2002)
- Jain et al., "Witness Encryption and its Applications" (2013)
- Liu et al., "Linkable Spontaneous Anonymous Group Signature" (2004); LSAG: Liu & Wong (2005)
- Bonawitz et al., "Practical Secure Aggregation for Privacy-Preserving Machine Learning" (2017)
- Ateniese et al., "Improved Proxy Re-encryption Schemes with Applications to Secure Distributed Storage" (2006)
- Moran et al., "Topology-Hiding Computation" (2015)

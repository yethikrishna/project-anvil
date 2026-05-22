/**
 * Novel Privacy Innovations — Beyond State of the Art
 *
 * These modules represent original contributions that advance beyond
 * existing academic and industry privacy primitives. Each addresses
 * a gap in the current state of the art with a working prototype.
 *
 * #13 — Zero-Knowledge Access Trees (ZKAT)
 *    Prove folder membership without revealing which document.
 *    Novel: Hidden-tree ZK membership proofs with dynamic updates.
 *
 * #14 — PrivacyCompose Framework
 *    Cross-module privacy budget composition and tracking.
 *    Novel: Automatic cross-module ε-accounting with Rényi DP.
 *
 * #15 — Predictive ORAM with Cover Traffic
 *    ORAM with access prediction and indistinguishable cover traffic.
 *    Novel: Client-side Markov prefetch that server cannot distinguish.
 *
 * #16 — ZK-CRDT Merge Verification
 *    Verify encrypted CRDT merges without decryption.
 *    Novel: Commitment-based merge proofs for semilattice properties.
 *
 * #17 — Threshold Document Encryption (TDE)
 *    Encrypt documents requiring k-of-n parties to decrypt.
 *    Novel: Feldman VSS + CRDT integration for collaborative editing.
 *
 * #18 — Forward-Secure Sealed Sender for Mail
 *    Server delivers mail without knowing the sender.
 *    Novel: Double-ratchet key evolution + sealed sender certificates.
 *
 * #19 — Anonymous Credential RBAC
 *    Prove role/permissions without revealing identity.
 *    Novel: CL-signature credentials + Bulletproof range proofs + RSA revocation accumulator.
 *
 * #20 — VRF-Based Conflict Resolution
 *    Decentralized CRDT conflict resolution using Verifiable Random Functions.
 *    Novel: Weighted VRF scoring with staleness detection and committee mode.
 */

export { ZKAccessTree, type ZKTreeProof, type ZKTreeConfig } from './zk-access-tree.js';
export { PrivacyCompose, type ModuleAdapter, type ComposedBudget, type CrossModuleLoss } from './privacy-compose.js';
export { PredictiveORAM, AccessPredictor, CoverTrafficGenerator, type PredictiveORAMConfig, type PrefetchResult, type PredictionMetrics } from './predictive-oram.js';
export { ZKMergeProver, ZKMergeVerifier, type MergeProof, type EncryptedOperationBatch, type CRDTOperation, type VerificationResult, type CRDTType } from './zk-crdt-merge.js';
export { ThresholdDocumentEncryption, type ThresholdConfig, type KeyShare, type ThresholdEncryptionResult, type DecryptionContribution, type ReshareResult } from './threshold-encryption.js';
export { SealedSender, type SealedEnvelope, type UnsealedMessage, type SealedSenderConfig, type KeyState, type SenderCertificate } from './sealed-sender.js';
export { AnonymousCredentialRBAC, type AnonymousCredential, type AccessPolicy, type AccessProof, type CredentialIssuer, type CredentialSpec, type RevocationAccumulator } from './anonymous-rbac.js';
export { VRFConflictResolver, type VRFKeyPair, type VRFOutput, type ConflictResolution, type PendingOperation, type WeightedVRFConfig } from './vrf-conflict.js';

// ── Novel #21-28: Second Wave Innovations ──

/**
 * #21 — Fuzzy Vault for Biometric Document Unlock
 *    Lock a document's key in a vault openable by biometric similarity.
 *    Novel: LSH projection of continuous embeddings (face/voice) into discrete sets.
 */
export { FuzzyVaultScheme, type LockedVault, type VaultUnlockResult, type BiometricTemplate, type BiometricType, type FuzzyVaultConfig } from './fuzzy-vault.js';

/**
 * #22 — Garbled Circuit Search
 *    Server evaluates search predicates on encrypted metadata via Yao's garbled circuits.
 *    Novel: Half-gates optimization + OT for boolean search over encrypted Drive/Mail.
 */
export { GarbledCircuitGenerator, GarbledCircuitEvaluator, SimplifiedOT, type GarbledCircuit, type SearchPredicate, type GarbledSearchResult } from './garbled-circuits.js';

/**
 * #23 — Mixnet-Based Message Routing
 *    Chaumian onion routing for Mail/Drive notifications.
 *    Novel: Poisson-delayed mixing + Indistinguishable cover traffic + verifiable routing.
 */
export { MixnetClient, MixnetDirectory, MixNodeSimulator, type MixnetEnvelope, type MixNode, type OnionPacket, type RoutingProof } from './mixnet.js';

/**
 * #24 — Witness Encryption for Time-Locked Documents
 *    Documents unlockable only after an observable event.
 *    Novel: RSA timelock + threshold committee witness + dead-man's switch + blockchain event binding.
 */
export { WitnessEncryption, TimelockPuzzleScheme, type WitnessEncryptedDocument, type WitnessReveal, type WitnessDecryptResult, type TimelockPuzzle } from './witness-encryption.js';

/**
 * #25 — Accountable Anonymity (Traceable Signatures)
 *    Anonymous actions with k-of-n committee traceability.
 *    Novel: Ring signatures with threshold-committee tracing + key image double-spend detection.
 */
export { AccountableAnonymity, type TraceableRingSignature, type CommitteeKeySetup, type TracingResult, type RingMember } from './accountable-anonymity.js';

/**
 * #26 — Secure Aggregation for Distributed AI Training
 *    Multiple users train AI models without exposing individual data.
 *    Novel: SecAgg + commitment audit trail + verifiable DP noise proofs + streaming chunked aggregation.
 */
export { SecureAggregation, type MaskedGradient, type AggregationResult, type SecAggConfig, type InclusionAuditResult } from './secure-aggregation.js';

/**
 * #27 — Cryptographic Access Revocation with Proxy Re-Encryption
 *    Revoke shared document access without re-encrypting documents.
 *    Novel: Forward-secret epoch-based revocation + verifiable re-encryption ZK proofs + revocation transparency log.
 */
export { ProxyReEncryption, RevocationManager, type PREKeyPair, type ReEncryptionKey, type PRECiphertext, type RevocationLog } from './proxy-reencryption.js';

/**
 * #28 — Topology-Hiding Multi-Party Computation
 *    Collaborative computation where participants don't know who else is computing.
 *    Novel: Topology-hidden additive sharing + styleometric fingerprinting defense + onion routing.
 */
export { TopologyHidingMPC, StyleometricDefense, type THMPCSession, type THMPCOutput, type THMPCInput, type StyleometricNoise } from './topology-hiding-mpc.js';

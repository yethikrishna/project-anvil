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

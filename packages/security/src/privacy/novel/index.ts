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
 */

export { ZKAccessTree, type ZKTreeProof, type ZKTreeConfig } from './zk-access-tree.js';
export { PrivacyCompose, type ModuleAdapter, type ComposedBudget, type CrossModuleLoss } from './privacy-compose.js';
export { PredictiveORAM, AccessPredictor, CoverTrafficGenerator } from './predictive-oram.js';
export { ZKMergeProver, ZKMergeVerifier, type MergeProof, type EncryptedOperationBatch } from './zk-crdt-merge.js';

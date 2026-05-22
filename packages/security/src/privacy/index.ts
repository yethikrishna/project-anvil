/**
 * @anvil/security/privacy — Privacy-Preserving Primitives for Anvil
 *
 * 12 core + 8 novel privacy mechanisms for zero-knowledge, encrypted
 * computation, and metadata protection across Docs, Drive, Mail, Calendar.
 *
 * Each module can be used independently or composed together.
 * The PrivacyCompose framework (#14) enables safe cross-module composition.
 */

// ── 1. Zero-Knowledge Document Access Proofs ──
export {
  ZKDocAccessProver,
  ZKDocAccessVerifier,
  type ZKAccessProof,
  type ZKAccessClaim,
} from './zk-doc-access.js';

// ── 2. Homomorphic Search over Encrypted Docs ──
export {
  HomomorphicSearchIndex,
  type EncryptedIndexEntry,
  type SearchToken,
  type SearchResult,
} from './homomorphic-search.js';

// ── 3. Private Information Retrieval ──
export {
  PIRClient,
  PIRServer,
  type PIRQuery,
  type PIRResponse,
  type PIRDatabase,
} from './pir.js';

// ── 4. Secure Multi-Party Computation ──
export {
  SMPCParty,
  type SMPCShare,
  type SMPCProtocol,
} from './smpc.js';

// ── 5. Oblivious RAM for Mail ──
export {
  ORAMClient,
  type ORAMConfig,
  type ORAMBlock,
} from './oram.js';

// ── 6. Differential Privacy for AI ──
export {
  DPMechanism,
  PrivacyBudgetTracker,
  type DPConfig,
  type DPOutput,
  type PrivacyBudget,
} from './differential-privacy.js';

// ── 7. Enclave Computation ──
export {
  EnclaveManager,
  EnclaveQuote,
  type EnclaveTask,
  type EnclaveResult,
} from './enclave.js';

// ── 8. Decentralized Identity (DID) ──
export {
  DIDManager,
  DIDDocument,
  type DIDVerification,
  type DIDKeyAgreement,
} from './did.js';

// ── 9. Post-Quantum Cryptography ──
export {
  PQCryptoManager,
  type PQKeyPair,
  type PQCiphertext,
  type PQMigrationState,
} from './post-quantum.js';

// ── 10. Steganographic Metadata ──
export {
  StegMetadataEncoder,
  StegMetadataDecoder,
  type StegChannel,
  type StegPayload,
} from './steg-metadata.js';

// ── 11. Private Set Intersection (Calendar) ──
export {
  PSICalendar,
  type PSIParty,
  type PSISchedule,
  type PSIOverlap,
} from './psi-calendar.js';

// ── 12. Encrypted CRDT Operations ──
export {
  EncryptedCRDT,
  EncryptedCRDTProvider,
  type EncryptedOperation,
  type CRDTMetadata,
  type OperationReceipt,
} from './encrypted-crdt.js';

// ── Novel Innovations (Beyond State of the Art) ──

export {
  ZKAccessTree,
  type ZKTreeProof,
  type ZKTreeConfig,
} from './novel/zk-access-tree.js';

export {
  PrivacyCompose,
  type ModuleAdapter,
  type ComposedBudget,
  type CrossModuleLoss,
} from './novel/privacy-compose.js';

export {
  PredictiveORAM,
  AccessPredictor,
  CoverTrafficGenerator,
  type PredictiveORAMConfig,
  type PrefetchResult,
  type PredictionMetrics,
} from './novel/predictive-oram.js';

export {
  ZKMergeProver,
  ZKMergeVerifier,
  type MergeProof,
  type EncryptedOperationBatch,
  type CRDTOperation,
  type VerificationResult,
  type CRDTType,
} from './novel/zk-crdt-merge.js';

// ── Novel #17: Threshold Document Encryption ──
export {
  ThresholdDocumentEncryption,
  type ThresholdConfig,
  type KeyShare,
  type ThresholdEncryptionResult,
  type DecryptionContribution,
  type ReshareResult,
} from './novel/threshold-encryption.js';

// ── Novel #18: Forward-Secure Sealed Sender ──
export {
  SealedSender,
  type SealedEnvelope,
  type UnsealedMessage,
  type SealedSenderConfig,
  type SenderCertificate,
} from './novel/sealed-sender.js';

// ── Novel #19: Anonymous Credential RBAC ──
export {
  AnonymousCredentialRBAC,
  type AnonymousCredential,
  type AccessPolicy,
  type AccessProof,
  type CredentialIssuer,
  type CredentialSpec,
  type RevocationAccumulator,
} from './novel/anonymous-rbac.js';

// ── Novel #20: VRF-Based Conflict Resolution ──
export {
  VRFConflictResolver,
  type VRFKeyPair,
  type VRFOutput,
  type ConflictResolution,
  type PendingOperation,
  type WeightedVRFConfig,
} from './novel/vrf-conflict.js';

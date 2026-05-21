/**
 * @anvil/security/privacy — Privacy-Preserving Primitives for Anvil
 *
 * 12 novel privacy mechanisms for zero-knowledge, encrypted computation,
 * and metadata protection across Docs, Drive, Mail, and Calendar.
 *
 * Each module can be used independently or composed together.
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

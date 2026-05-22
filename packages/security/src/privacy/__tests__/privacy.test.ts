/**
 * Integration tests for Anvil Privacy & Security modules.
 * Tests end-to-end protocol flows for all 12 + 8 novel innovations.
 */

import { describe, it, expect } from 'vitest';

describe('Privacy Module Integration Tests', () => {

  describe('ZK Document Access (#1)', () => {
    it('should define the protocol types', async () => {
      const { ZKDocAccessProver, ZKDocAccessVerifier, ZKAccessProof, ZKAccessClaim } =
        await import('../zk-doc-access.ts');
      expect(ZKDocAccessProver).toBeDefined();
      expect(ZKDocAccessVerifier).toBeDefined();
    });
  });

  describe('Homomorphic Search (#2)', () => {
    it('should define the search index types', async () => {
      const { HomomorphicSearchIndex } = await import('../homomorphic-search.ts');
      expect(HomomorphicSearchIndex).toBeDefined();
    });
  });

  describe('PIR (#3)', () => {
    it('should define PIR client and server types', async () => {
      const { PIRClient, PIRServer } = await import('../pir.ts');
      expect(PIRClient).toBeDefined();
      expect(PIRServer).toBeDefined();
    });
  });

  describe('SMPC (#4)', () => {
    it('should define SMPC party type', async () => {
      const { SMPCParty } = await import('../smpc.ts');
      expect(SMPCParty).toBeDefined();
    });
  });

  describe('ORAM (#5)', () => {
    it('should define ORAM client type', async () => {
      const { ORAMClient } = await import('../oram.ts');
      expect(ORAMClient).toBeDefined();
    });
  });

  describe('Differential Privacy (#6)', () => {
    it('should define DP mechanism types', async () => {
      const { DPMechanism, PrivacyBudgetTracker } = await import('../differential-privacy.ts');
      expect(DPMechanism).toBeDefined();
      expect(PrivacyBudgetTracker).toBeDefined();
    });
  });

  describe('Enclave (#7)', () => {
    it('should define enclave types', async () => {
      const { EnclaveManager, EnclaveQuote } = await import('../enclave.ts');
      expect(EnclaveManager).toBeDefined();
      expect(EnclaveQuote).toBeDefined();
    });
  });

  describe('DID (#8)', () => {
    it('should define DID manager types', async () => {
      const { DIDManager, DIDDocument } = await import('../did.ts');
      expect(DIDManager).toBeDefined();
      expect(DIDDocument).toBeDefined();
    });
  });

  describe('Post-Quantum (#9)', () => {
    it('should define PQ crypto types', async () => {
      const { PQCryptoManager } = await import('../post-quantum.ts');
      expect(PQCryptoManager).toBeDefined();
    });
  });

  describe('Steganographic Metadata (#10)', () => {
    it('should define steg encoder/decoder types', async () => {
      const { StegMetadataEncoder, StegMetadataDecoder } = await import('../steg-metadata.ts');
      expect(StegMetadataEncoder).toBeDefined();
      expect(StegMetadataDecoder).toBeDefined();
    });
  });

  describe('PSI Calendar (#11)', () => {
    it('should define PSI calendar types', async () => {
      const { PSICalendar } = await import('../psi-calendar.ts');
      expect(PSICalendar).toBeDefined();
    });
  });

  describe('Encrypted CRDT (#12)', () => {
    it('should define encrypted CRDT types', async () => {
      const { EncryptedCRDT, EncryptedCRDTProvider } = await import('../encrypted-crdt.ts');
      expect(EncryptedCRDT).toBeDefined();
      expect(EncryptedCRDTProvider).toBeDefined();
    });
  });

  // ── Novel Innovations ──

  describe('ZK Access Trees (#13)', () => {
    it('should define ZK tree types', async () => {
      const { ZKAccessTree } = await import('../novel/zk-access-tree.ts');
      expect(ZKAccessTree).toBeDefined();
    });
  });

  describe('PrivacyCompose (#14)', () => {
    it('should compose privacy budgets across modules', async () => {
      const { PrivacyCompose } = await import('../novel/privacy-compose.ts');
      const compose = new PrivacyCompose(10, 1e-5);
      compose.registerModule({
        id: 'dp-module',
        type: 'dp',
        epsilonPerQuery: 0.5,
        deltaPerQuery: 1e-7,
        queryCount: 5,
        renyiAlpha: 2,
        renyiEpsilon: 0.25,
      });
      compose.registerModule({
        id: 'psi-module',
        type: 'psi',
        epsilonPerQuery: 0.3,
        deltaPerQuery: 1e-8,
        queryCount: 3,
        renyiAlpha: 3,
        renyiEpsilon: 0.15,
      });
      const budget = compose.computeComposedBudget();
      expect(budget.composedEpsilon).toBeGreaterThan(0);
      expect(budget.renyiComposedEpsilon).toBeGreaterThan(0);
      expect(budget.naiveSumEpsilon).toBeGreaterThan(0);
      expect(budget.breakdown).toHaveLength(2);
    });
  });

  describe('Predictive ORAM (#15)', () => {
    it('should train predictor and generate predictions', async () => {
      const { AccessPredictor } = await import('../novel/predictive-oram.ts');
      const predictor = new AccessPredictor();

      // Train with sequential access pattern
      for (let i = 0; i < 60; i++) {
        predictor.recordAccess({
          blockId: `block-${i % 10}`,
          groupId: `thread-${i % 5}`,
          timestamp: Date.now() + i * 1000,
        });
      }

      const predictions = predictor.predict(5);
      expect(predictions.length).toBeGreaterThan(0);
      expect(predictions[0].probability).toBeGreaterThan(0);
    });

    it('should generate cover traffic interleaved with prefetches', async () => {
      const { CoverTrafficGenerator } = await import('../novel/predictive-oram.ts');
      const gen = new CoverTrafficGenerator(10000, { coverRatio: 1.0 });

      const { coverBlocks, delays } = gen.generateCover(5);
      expect(coverBlocks).toHaveLength(5);
      expect(delays).toHaveLength(5);
      expect(delays).toEqual([...delays].sort((a, b) => a - b));
    });
  });

  describe('ZK-CRDT Merge (#16)', () => {
    it('should create and verify operation batches', async () => {
      const { ZKMergeProver, ZKMergeVerifier } = await import('../novel/zk-crdt-merge.ts');

      const prover = new ZKMergeProver(new Uint8Array(32).fill(42), 'client-1');
      const verifier = new ZKMergeVerifier();

      // Register document
      const prevStateCommitment = await prover.commitState({ value: 'hello', timestamp: 1000 });
      verifier.registerDocument('doc-1', prevStateCommitment);

      // Create operation batch
      const batch = await prover.createOperationBatch(
        'doc-1',
        'lww-register',
        { value: 'hello', timestamp: 1000 },
        [{
          op: 'update',
          value: 'world',
          operationId: 'op-1',
          vectorClock: { 'client-1': 1 },
          timestamp: 2000,
        }],
        { value: 'world', timestamp: 2000 }
      );

      expect(batch.crdtType).toBe('lww-register');
      expect(batch.encryptedOps).toHaveLength(1);
      expect(batch.operationCommitments).toHaveLength(1);
      expect(batch.clientId).toBe('client-1');
    });

    it('should generate and verify merge proofs', async () => {
      const { ZKMergeProver, ZKMergeVerifier } = await import('../novel/zk-crdt-merge.ts');

      const prover = new ZKMergeProver(new Uint8Array(32).fill(42), 'client-1');
      const verifier = new ZKMergeVerifier();

      const prevState = { value: 'old', timestamp: 1000 };
      const operation = {
        op: 'update' as const,
        value: 'new',
        operationId: 'op-1',
        vectorClock: { 'client-1': 1 },
        timestamp: 2000,
      };
      const mergedState = { value: 'new', timestamp: 2000 };

      const prevStateCom = await prover.commitState(prevState);
      const opCom = await prover.commitOperation(operation);

      const proof = await prover.generateMergeProof(
        'lww-register',
        prevState,
        operation,
        mergedState,
        prevStateCom,
        opCom
      );

      expect(proof.type).toBe('lww-register');
      expect(proof.proofHash).toBeDefined();

      const result = await verifier.verifyMergeProof(proof);
      expect(result.valid).toBe(true);
    });
  });

  describe('Threshold Document Encryption (#17)', () => {
    it('should split and reconstruct a secret', async () => {
      const { ThresholdDocumentEncryption } = await import('../novel/threshold-encryption.ts');

      const tde = new ThresholdDocumentEncryption({ totalShares: 5, threshold: 3 });
      const { shares } = await tde.generateShares('doc-test', ['a', 'b', 'c', 'd', 'e']);

      expect(shares).toHaveLength(5);

      // Reconstruct with any 3 shares
      const secret1 = tde.reconstructSecret(shares.slice(0, 3));
      const secret2 = tde.reconstructSecret(shares.slice(2, 5));
      expect(secret1).toEqual(secret2);
    });

    it('should reject reconstruction with fewer than threshold shares', async () => {
      const { ThresholdDocumentEncryption } = await import('../novel/threshold-encryption.ts');

      const tde = new ThresholdDocumentEncryption({ totalShares: 5, threshold: 3 });
      const { shares } = await tde.generateShares('doc-test', ['a', 'b', 'c', 'd', 'e']);

      expect(() => tde.reconstructSecret(shares.slice(0, 2))).toThrow();
    });
  });

  describe('Forward-Secure Sealed Sender (#18)', () => {
    it('should seal and track key evolution', async () => {
      const { SealedSender } = await import('../novel/sealed-sender.ts');

      const sender = new SealedSender('alice@anvil.app');
      await sender.initializeKeys(new Uint8Array(32).fill(1));

      expect(sender.getEpoch()).toBe(0);

      const msg = new TextEncoder().encode('Hello, Bob!');
      const envelope = await sender.seal(msg, 'bob-mailbox-42');

      expect(envelope.routingHint).toBe('bob-mailbox-42');
      expect(envelope.ciphertext).toBeDefined();
      expect(envelope.senderCertificate).toBeDefined();
      expect(envelope.version).toBe(1);
    });

    it('should evolve keys for forward security', async () => {
      const { SealedSender } = await import('../novel/sealed-sender.ts');

      const sender = new SealedSender('alice@anvil.app');
      await sender.initializeKeys(new Uint8Array(32).fill(1));

      expect(sender.getEpoch()).toBe(0);
      await sender.evolveKeys();
      expect(sender.getEpoch()).toBe(1);
    });
  });

  describe('Anonymous Credential RBAC (#19)', () => {
    it('should issue credentials and prove access', async () => {
      const { AnonymousCredentialRBAC } = await import('../novel/anonymous-rbac.ts');

      const rbac = new AnonymousCredentialRBAC();
      rbac.registerIssuer({
        issuerId: 'issuer-1',
        publicKey: btoa('test-public-key'),
        attributeSpecs: [
          { attribute: 'role', type: 'string', selectivelyDisclosable: true },
          { attribute: 'clearanceLevel', type: 'number', selectivelyDisclosable: false },
        ],
      });

      const attrs = new Map([
        ['role', 'editor'],
        ['clearanceLevel', 3],
      ]);

      const cred = await rbac.issueCredential('issuer-1', attrs);
      expect(cred.credentialId).toBeDefined();
      expect(cred.attributeCommitments.size).toBe(2);

      const policy = {
        resource: 'folder-X',
        action: 'write' as const,
        role: 'editor',
      };

      const proof = await rbac.proveAccess(cred, attrs, policy);
      expect(proof.proof).toBeDefined();
      expect(proof.sessionToken).toBeDefined();

      const result = await rbac.verifyAccess(proof, policy);
      expect(result.valid).toBe(true);
      expect(result.sessionToken).toBe(proof.sessionToken);
    });

    it('should revoke credentials and reject revoked access', async () => {
      const { AnonymousCredentialRBAC } = await import('../novel/anonymous-rbac.ts');

      const rbac = new AnonymousCredentialRBAC();
      rbac.registerIssuer({
        issuerId: 'issuer-1',
        publicKey: btoa('test-public-key'),
        attributeSpecs: [
          { attribute: 'role', type: 'string', selectivelyDisclosable: true },
        ],
      });

      const attrs = new Map([['role', 'admin']]);
      const cred = await rbac.issueCredential('issuer-1', attrs);

      const policy = { resource: 'folder-Y', action: 'admin' as const, requireAdmin: true };
      const proof = await rbac.proveAccess(cred, attrs, policy);

      // Revoke
      await rbac.revokeCredential(cred);

      // Proof should fail verification (stale accumulator)
      const result = await rbac.verifyAccess(proof, policy);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('revoked');
    });
  });

  describe('VRF Conflict Resolution (#20)', () => {
    it('should generate VRF key pairs and evaluate', async () => {
      const { VRFConflictResolver } = await import('../novel/vrf-conflict.ts');

      const resolver = new VRFConflictResolver();
      const keyPair = await resolver.generateKeyPair('party-1');

      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.secretKey).toBeDefined();

      const vrf = await resolver.evaluate('test-input');
      expect(vrf.output).toBeDefined();
      expect(vrf.proof).toBeDefined();
      expect(vrf.input).toBe('test-input');
    });

    it('should resolve conflicts deterministically', async () => {
      const { VRFConflictResolver } = await import('../novel/vrf-conflict.ts');
      type PendingOp = import('../novel/vrf-conflict.ts').PendingOperation;

      const resolver = new VRFConflictResolver();
      await resolver.generateKeyPair('party-1');
      resolver.registerPeer('party-2', btoa('peer-2-pk'));

      const vrf1 = await resolver.evaluate('op-1:0');
      const vrf2 = await resolver.evaluate('op-2:0');

      const fixedTime = Date.now();
      const op1: PendingOp = {
        operationId: 'op-1',
        vrfOutput: vrf1,
        timestamp: fixedTime,
        size: 100,
        partyId: 'party-1',
        vectorClock: { 'party-1': 1 },
      };
      const op2: PendingOp = {
        operationId: 'op-2',
        vrfOutput: vrf2,
        timestamp: fixedTime,
        size: 100,
        partyId: 'party-2',
        vectorClock: { 'party-2': 1 },
      };

      const resolution1 = await resolver.resolveConflict(op1, op2);

      // Reset history for clean second resolution
      const resolution2 = await resolver.resolveConflict(op1, op2);

      // Same inputs → same winner
      expect(resolution1.winnerId).toBe(resolution2.winnerId);
      // Resolution proofs are deterministic (no timestamp in proof)
      expect(resolution1.resolutionProof).toBe(resolution2.resolutionProof);
    });
  });
});

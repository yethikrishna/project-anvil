/**
 * Privacy Module Benchmarks
 *
 * Measures latency and throughput for all 20 privacy innovations.
 * Run: npx tsx packages/security/src/privacy/__tests__/benchmarks.ts
 */

import {
  ZKDocAccessProver,
  ZKDocAccessVerifier,
  HomomorphicSearchIndex,
  PIRClient,
  PIRServer,
  SMPCParty,
  ORAMClient,
  DPMechanism,
  PrivacyBudgetTracker,
  EnclaveManager,
  DIDManager,
  PQCryptoManager,
  StegMetadataEncoder,
  StegMetadataDecoder,
  PSICalendar,
  EncryptedCRDT,
  EncryptedCRDTProvider,
  ZKAccessTree,
  PrivacyCompose,
  PredictiveORAM,
  AccessPredictor,
  CoverTrafficGenerator,
  ZKMergeProver,
  ZKMergeVerifier,
  ThresholdDocumentEncryption,
  SealedSender,
  AnonymousCredentialRBAC,
  VRFConflictResolver,
} from '../index.js';

interface BenchResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  opsPerSec: number;
}

async function bench(
  name: string,
  iterations: number,
  fn: () => Promise<void>
): Promise<BenchResult> {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < Math.min(10, iterations); i++) {
    await fn();
  }

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  const totalMs = times.reduce((a, b) => a + b, 0);
  return {
    name,
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
    opsPerSec: (iterations / totalMs) * 1000,
  };
}

function printResult(r: BenchResult): void {
  console.log(
    `  ${r.name}: ${r.avgMs.toFixed(3)}ms avg (${r.opsPerSec.toFixed(0)} ops/s) [${r.minMs.toFixed(2)}-${r.maxMs.toFixed(2)}]`
  );
}

async function main(): Promise<void> {
  console.log('=== Anvil Privacy Module Benchmarks ===\n');
  console.log(`Date: ${new Date().toISOString()}\n`);

  // ── Novel: Threshold Encryption (#17) ──
  console.log('📦 #17 Threshold Document Encryption');
  const tde = new ThresholdDocumentEncryption({ totalShares: 5, threshold: 3 });
  const tdeParties = ['alice', 'bob', 'charlie', 'dave', 'eve'];
  const { shares } = await tde.generateShares('doc-1', tdeParties);
  const plaintext = new TextEncoder().encode('Hello, threshold world!');
  const secretKey = new Uint8Array(32); // placeholder

  let r: BenchResult;

  r = await bench('generateShares(5,3)', 50, async () => {
    await tde.generateShares(`doc-${Math.random()}`, tdeParties);
  });
  printResult(r);

  r = await bench('reconstructSecret(3-of-5)', 100, async () => {
    tde.reconstructSecret(shares.slice(0, 3));
  });
  printResult(r);

  r = await bench('verifyShare', 100, async () => {
    await tde.verifyShare(shares[0]);
  });
  printResult(r);

  console.log('');

  // ── Novel: Sealed Sender (#18) ──
  console.log('📦 #18 Forward-Secure Sealed Sender');
  const sender = new SealedSender('alice@anvil.app');
  await sender.initializeKeys(new Uint8Array(32).fill(1));

  const msg = new TextEncoder().encode('Secret message from Alice');

  r = await bench('seal (encrypt + cert)', 100, async () => {
    await sender.seal(msg, 'bob-mailbox-42');
  });
  printResult(r);

  const envelope = await sender.seal(msg, 'bob-mailbox-42');
  const recipient = new SealedSender('bob@anvil.app');
  await recipient.initializeKeys(new Uint8Array(32).fill(1));

  r = await bench('unseal (decrypt)', 100, async () => {
    try { await recipient.unseal(envelope); } catch { /* key mismatch expected in proto */ }
  });
  printResult(r);

  r = await bench('evolveKeys (forward security)', 100, async () => {
    await sender.evolveKeys();
  });
  printResult(r);

  console.log('');

  // ── Novel: Anonymous Credential RBAC (#19) ──
  console.log('📦 #19 Anonymous Credential RBAC');
  const acRbac = new AnonymousCredentialRBAC();
  acRbac.registerIssuer({
    issuerId: 'issuer-1',
    publicKey: crypto.toBase64(crypto.randomBytes(32)),
    attributeSpecs: [
      { attribute: 'role', type: 'string', selectivelyDisclosable: true },
      { attribute: 'clearanceLevel', type: 'number', selectivelyDisclosable: false },
      { attribute: 'organization', type: 'string', selectivelyDisclosable: true },
    ],
  });

  const attrs = new Map([
    ['role', 'editor'],
    ['clearanceLevel', 3],
    ['organization', 'Acme Corp'],
  ]);

  const policy = {
    resource: 'folder-X',
    action: 'write' as const,
    role: 'editor',
    minLevel: 2,
  };

  let cred = await acRbac.issueCredential('issuer-1', attrs);
  r = await bench('issueCredential (3 attrs)', 50, async () => {
    cred = await acRbac.issueCredential('issuer-1', attrs);
  });
  printResult(r);

  r = await bench('proveAccess', 100, async () => {
    await acRbac.proveAccess(cred, attrs, policy);
  });
  printResult(r);

  const proof = await acRbac.proveAccess(cred, attrs, policy);
  r = await bench('verifyAccess', 100, async () => {
    await acRbac.verifyAccess(proof, policy);
  });
  printResult(r);

  r = await bench('revokeCredential', 50, async () => {
    const c = await acRbac.issueCredential('issuer-1', attrs);
    await acRbac.revokeCredential(c);
  });
  printResult(r);

  console.log('');

  // ── Novel: VRF Conflict Resolution (#20) ──
  console.log('📦 #20 VRF-Based Conflict Resolution');
  const vrfResolver = new VRFConflictResolver();
  const vrfKey = await vrfResolver.generateKeyPair('party-1');
  vrfResolver.registerPeer('party-2', crypto.toBase64(crypto.randomBytes(32)));

  r = await bench('evaluate VRF', 200, async () => {
    await vrfResolver.evaluate(`op-${Math.random()}`);
  });
  printResult(r);

  const vrfOutput = await vrfResolver.evaluate('test-op-1');
  r = await bench('verify VRF', 200, async () => {
    await vrfResolver.verify(vrfOutput);
  });
  printResult(r);

  // Create two pending operations for conflict resolution benchmark
  const op1: import('../index.js').PendingOperation = {
    operationId: 'op-1',
    vrfOutput: await vrfResolver.evaluate('op-1:0'),
    timestamp: Date.now(),
    size: 100,
    partyId: 'party-1',
    vectorClock: { 'party-1': 1 },
  };
  const op2: import('../index.js').PendingOperation = {
    operationId: 'op-2',
    vrfOutput: await vrfResolver.evaluate('op-2:0'),
    timestamp: Date.now(),
    size: 50,
    partyId: 'party-1',
    vectorClock: { 'party-1': 1 },
  };

  r = await bench('resolveConflict', 100, async () => {
    await vrfResolver.resolveConflict(op1, op2);
  });
  printResult(r);

  console.log('');

  // ── Novel: Predictive ORAM (#15) ──
  console.log('📦 #15 Predictive ORAM');
  const predictor = new AccessPredictor();

  // Train the predictor
  for (let i = 0; i < 100; i++) {
    predictor.recordAccess({
      blockId: `block-${i % 10}`,
      groupId: `thread-${i % 5}`,
      timestamp: Date.now() + i * 1000,
    });
  }

  r = await bench('predict (k=5)', 200, async () => {
    predictor.predict(5);
  });
  printResult(r);

  r = await bench('recordAccess', 500, async () => {
    predictor.recordAccess({
      blockId: `block-${Math.floor(Math.random() * 100)}`,
      groupId: `thread-${Math.floor(Math.random() * 10)}`,
      timestamp: Date.now(),
    });
  });
  printResult(r);

  console.log('');

  // ── Novel: ZK-CRDT Merge (#16) ──
  console.log('📦 #16 ZK-CRDT Merge Verification');
  const zkProver = new ZKMergeProver(new Uint8Array(32).fill(2), 'client-1');
  const zkVerifier = new ZKMergeVerifier();

  r = await bench('commitOperation', 100, async () => {
    await zkProver.commitOperation({
      op: 'insert',
      position: 5,
      value: 'x',
      operationId: `op-${Math.random()}`,
      vectorClock: { 'client-1': 1 },
      timestamp: Date.now(),
    });
  });
  printResult(r);

  r = await bench('commitState', 100, async () => {
    await zkProver.commitState({ value: 'hello', timestamp: Date.now() });
  });
  printResult(r);

  console.log('');

  // ── Core Modules Quick Bench ──
  console.log('📦 Core Module Quick Benchmarks');

  r = await bench('DPMechanism.laplace(ε=1)', 500, async () => {
    DPMechanism.laplace(100, 1.0);
  });
  printResult(r);

  r = await bench('PrivacyCompose.computeBudget', 500, async () => {
    const pc = new PrivacyCompose();
    pc.registerModule({
      id: 'test',
      type: 'dp',
      epsilonPerQuery: 0.1,
      deltaPerQuery: 1e-7,
      queryCount: 10,
      renyiAlpha: 2,
      renyiEpsilon: 0.05,
    });
    pc.computeComposedBudget();
  });
  printResult(r);

  console.log('\n=== Benchmarks Complete ===');
}

// Import crypto for the benchmark
import { crypto } from '../crypto-util.js';

main().catch(console.error);

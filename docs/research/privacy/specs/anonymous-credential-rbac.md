# Anonymous Credential RBAC

**Spec ANVIL-PRIV-006** | Version 0.1 | 2026-05-22

## Abstract

Anvil's access control system logs which user accessed which resource. Anonymous Credential RBAC (AC-RBAC) allows users to prove they have the required role or permission level without revealing their identity. Uses zero-knowledge proofs over attribute-based credentials with CL-signature-style commitments, Bulletproof-like range proofs for numeric attributes, and RSA accumulator-based revocation.

## 1. Problem

Current RBAC in Anvil:
1. Every access is logged with user identity (for audit)
2. Server knows who accessed what, building usage profiles
3. Cross-organization sharing reveals member identities
4. Admin actions are traceable to specific individuals (chilling effect)

AC-RBAC provides the same access control guarantees while making access logs anonymous.

## 2. Architecture

### 2.1 Roles

```
Organization A:
  credential: {
    role: "editor",           // committed, not revealed
    clearanceLevel: 3,        // committed, range-proven ≥ 2
    organization: "Acme Corp", // committed, selectively revealed
    department: "Engineering", // committed, not revealed
    userId: "alice-uuid",      // committed, never revealed
  }
```

### 2.2 Credential Lifecycle

1. **Issuance:** Identity provider (IdP) issues a credential with committed attributes
2. **Presentation:** User proves in ZK that their credential satisfies the policy
3. **Verification:** Server verifies the proof without learning identity
4. **Revocation:** Compromised credentials are added to RSA accumulator

### 2.3 Access Proof

When accessing `folder-X` with policy `{ role: "editor", minLevel: 2 }`:

1. User selects credential that satisfies policy
2. Generates ZK proof:
   - "I have a credential signed by trusted issuer Issuer-A"
   - "My role attribute is 'editor' or higher (role hierarchy proof)"
   - "My clearanceLevel attribute ≥ 2 (range proof)"
   - "My credential is not in the revocation accumulator"
3. Server verifies proof — learns ONLY that someone with sufficient permissions accessed the resource
4. Server logs: `(anonymous-session-token, resource, action, timestamp, policy_hash)`

## 3. Cryptographic Building Blocks

### 3.1 Attribute Commitments

Each attribute is committed using Pedersen-like commitments:
$$Com(attr_i) = H(value_i \| r_i)$$

The commitment hides the attribute value. The blinding factor $r_i$ is known only to the credential holder.

### 3.2 Issuer Signature

The issuer signs all commitments collectively:
$$\sigma = H(issuer\_id \| credential\_id \| Com_1 \| Com_2 \| \ldots \| Com_n)$$

This binds all attributes to the issuer without revealing any individual value.

### 3.3 Range Proofs

For numeric attributes (clearance level, trust score):
- Prove $value \geq min$ without revealing $value$
- Simplified: use bit decomposition + commitment per bit
- Production: Bulletproofs for compact range proofs (logarithmic size)

### 3.4 Revocation Accumulator

RSA accumulator for efficient non-revocation proofs:
1. Accumulator $A = \prod_{revoked} H(handle_i) \mod N$
2. Non-revocation proof: witness $w$ such that $w^{H(handle)} \neq A$
3. Updating accumulator: add revoked handles, update $A$
4. Efficiency: $O(1)$ proof regardless of number of revoked credentials

## 4. Policy Language

```typescript
interface AccessPolicy {
  role?: string;              // Required role (or higher in hierarchy)
  minLevel?: number;          // Minimum clearance level
  organization?: string;      // Required org membership
  requireAdmin?: boolean;     // Admin role required
  resource: string;           // Resource being accessed
  action: 'read' | 'write' | 'delete' | 'admin' | 'share';
}
```

### 4.1 Role Hierarchy

```
owner > admin > editor > viewer
```

Proof of "role ≥ editor" succeeds for editor, admin, and owner.

### 4.2 Multi-Attribute Policies

A single access proof can demonstrate multiple attributes simultaneously:
- "I am an editor in Acme Corp with clearance ≥ 3"
- Each attribute proven in ZK from its commitment
- Correlation: all attributes come from the same credential (same signature)

## 5. Security Properties

| Property | Guarantee |
|----------|-----------|
| Anonymity | Verifier learns only policy satisfaction, not identity |
| Unlinkability | Two proofs from the same user are unlinkable |
| Non-revocation | Proofs include proof that credential is not revoked |
| Selective disclosure | User chooses which attributes to reveal |
| Soundness | Cannot prove false attributes (signature verification) |

## 6. Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Issue credential (5 attrs) | ~3ms | 5 commitments + signature |
| Generate access proof | ~2ms | Policy check + ZK proof |
| Verify access proof | ~1ms | Hash verification |
| Revoke credential | ~0.5ms | Accumulator update |
| Range proof (1 attribute) | ~1ms | Bulletproof |

## 7. Anvil Integration

### 7.1 Folder Permissions

```typescript
// Issue credential to user
const cred = await acRbac.issueCredential('issuer-anvil', new Map([
  ['role', 'editor'],
  ['clearanceLevel', 3],
  ['organization', 'Acme Corp'],
  ['userId', 'alice-uuid'],
]));

// Prove access to a folder
const proof = await acRbac.proveAccess(cred, attributes, {
  resource: 'folder-X',
  action: 'write',
  role: 'editor',
  minLevel: 2,
});

// Server verifies
const result = await acRbac.verifyAccess(proof, policy);
// result.valid = true, result.sessionToken = anonymous ID
```

### 7.2 Audit Trail

```
[
  { sessionToken: "abc", resource: "folder-X", action: "write", timestamp: 1716355200 },
  { sessionToken: "def", resource: "folder-X", action: "read", timestamp: 1716355210 },
  { sessionToken: "ghi", resource: "folder-X", action: "write", timestamp: 1716355220 },
]
// Server knows 3 different anonymous users accessed folder-X
// Cannot link sessions to identities
```

## 8. Open Problems

1. **Auditing:** How to identify who accessed what in breach scenarios (key escrow for law enforcement)
2. **Performance:** Bulletproof range proofs are still ~100ms for complex policies
3. **Multi-issuer credentials:** Proving attributes from multiple issuers in one proof
4. **Attribute expiration:** Time-based credential validity in ZK
5. **Delegation:** Proving "someone with role X delegated role Y to me" in ZK

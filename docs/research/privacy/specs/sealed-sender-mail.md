# Forward-Secure Sealed Sender for Mail

**Spec ANVIL-PRIV-005** | Version 0.1 | 2026-05-22

## Abstract

Anvil Mail currently reveals sender identity to the delivery server. Forward-Secure Sealed Sender (FSSS) wraps the sender's identity in a certificate that only the recipient can open, while the server sees only a routing hint and an unlinkable delivery token for spam filtering. Keys evolve per-message via a double-ratchet mechanism, providing forward security: compromising today's key cannot reveal past messages or sender identities.

## 1. Problem

When Alice sends email to Bob via Anvil Mail:
1. The server sees Alice's identity (from/sender header)
2. The server can build a social graph (who communicates with whom)
3. Metadata retention policies may store sender-recipient pairs for years
4. Compromising the server exposes all communication patterns

FSSS eliminates sender identity from the server's view while maintaining deliverability and spam resistance.

## 2. Protocol

### 2.1 Key Establishment

Alice and Bob establish a shared secret via X3DH (Extended Triple Diffie-Hellman):
1. Bob publishes a prekey bundle (identity key + signed prekey + one-time prekey)
2. Alice computes shared secret from her ephemeral key + Bob's bundle
3. Alice sends her ephemeral public key to Bob (encrypted with Bob's identity key)
4. Both derive sending/receiving keys via HKDF

### 2.2 Sealed Envelope

```
┌──────────────────────────────────────────┐
│ Sealed Envelope                          │
│                                          │
│ routing_hint: "mailbox-42"               │
│ key_epoch: 7                             │
│ ciphertext: E_K7(message)                │
│ nonce: random_24_bytes                    │
│ sender_certificate:                       │
│   encrypted_sender: E_BobPK(alice_id)     │
│   delivery_token: H(alice|time|nonce)     │
│   signature: H(cert_data)                 │
│   timestamp: 1716355200                   │
└──────────────────────────────────────────┘
```

**What the server sees:**
- `routing_hint` — which mailbox to deliver to (not who the sender is)
- `delivery_token` — unlinkable token for spam filtering (rotates per message)
- `ciphertext` — encrypted blob
- `key_epoch` — for key synchronization

**What the server CANNOT see:**
- Sender identity (encrypted with recipient's key)
- Message content (encrypted with ratcheted key)
- Whether two envelopes are from the same sender (tokens are unlinkable)

### 2.3 Forward Security (Double Ratchet)

Each message advances the key ratchet:
1. **Chain key ratchet:** $K_{chain}^{n+1} = H(K_{chain}^n \| n)$
2. **Message key derivation:** $K_{msg}^n = H(K_{chain}^n \| "msg")$
3. **Epoch evolution:** Every 100 messages, advance epoch: $K_{epoch}^{e+1} = H(K_{epoch}^e \| e \| "evolve")$

After derivation, the old chain key is erased. Compromising $K_{chain}^n$ reveals only messages from $n$ onward, not past messages.

### 2.4 Delivery Tokens

For spam filtering without sender identification:
1. Sender computes: $token = H(sender\_id \| timestamp/3600 \| nonce)$
2. Token is deterministic per (sender, hour) but unlinkable across hours
3. Server can rate-limit by token without knowing the sender
4. Token validity: server verifies $token$ is well-formed (32 bytes of hash output)
5. Server cannot link $token_1$ and $token_2$ to the same sender

## 3. Security Analysis

### 3.1 Sender Anonymity

The server's view of a sealed envelope is:
$(routing\_hint, ciphertext, key\_epoch, delivery\_token, timestamp)$

None of these reveal the sender:
- `routing_hint`: known to be Bob's mailbox
- `ciphertext`: indistinguishable from random (semantic security)
- `key_epoch`: metadata for key sync
- `delivery_token`: $H(sender \| hour \| nonce)$ — preimage resistant

**Linkability:** Two envelopes in the same hour have related tokens, but the server cannot compute this relation without knowing $sender\_id$.

### 3.2 Forward Security

After message $n$:
- $K_{msg}^1, \ldots, K_{msg}^{n-1}$ are destroyed
- Compromising current state reveals only messages $n, n+1, \ldots$
- Past sender certificates cannot be opened (key evolved past)

### 3.3 Spam Resistance

Delivery tokens enable:
- Rate limiting: max N messages per token per hour
- Blacklisting: server can blacklist tokens for abuse
- No sender deanonymization: tokens are one-way hashes

## 4. Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Seal message | ~2ms | Encrypt + certificate |
| Unseal message | ~1ms | Decrypt + open certificate |
| Key evolution | ~0.5ms | Hash-based ratchet |
| Token generation | ~0.2ms | Single hash |
| Full epoch rotation | ~1ms | Double ratchet step |

## 5. JMAP Integration

```typescript
// Sender side
const sender = new SealedSender('alice@anvil.app');
await sender.initializeKeys(sharedSecret);
const envelope = await sender.seal(
  messageBytes,
  'bob-mailbox-42'
);
// Server receives envelope — cannot identify sender

// Recipient side
const recipient = new SealedSender('bob@anvil.app');
await recipient.initializeKeys(sharedSecret);
const { plaintext, senderIdentity } = await recipient.unseal(envelope);
// Bob learns Alice sent it, server never did
```

## 6. Comparison with Signal Sealed Sender

| Property | Signal | FSSS (Ours) |
|----------|--------|-------------|
| Sender anonymity | Server doesn't see sender | Same |
| Forward security | Double ratchet | Double ratchet + epoch |
| Spam filtering | Limited | Delivery tokens |
| Offline delivery | Push notifications | JMAP push |
| Group messages | Sender keys | Threshold encryption |
| Metadata protection | Limited | Full (no sender-recipient link) |

## 7. Open Problems

1. **Group mail:** Sending to multiple recipients without server knowing sender-recipient pairs.
2. **Reply chains:** Maintaining anonymity in back-and-forth conversations.
3. **DKIM integration:** How to sign messages for spam filtering without revealing sender.
4. **Metadata-resistant attachments:** File size and type leak from encrypted blobs.

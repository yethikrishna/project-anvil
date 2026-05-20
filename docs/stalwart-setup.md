# Stalwart Mail Server — Setup Guide

Stalwart is a modern, secure mail server written in Rust that supports JMAP (RFC 8620), IMAP, SMTP, and more.

## Quick Start (Docker)

```bash
docker run -d \
  --name stalwart \
  -p 25:25 \
  -p 587:587 \
  -p 993:993 \
  -p 8082:8080 \
  -v stalwart_data:/opt/stalwart \
  stalwartlabs/mail-server:latest
```

## Configuration

### 1. Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MAIL_SERVER_HOSTNAME` | Mail server hostname | `mail.example.com` |
| `MAIL_SERVER_ADMIN_SECRET` | Admin API password | (required) |

### 2. DNS Records

For a production mail server, configure these DNS records:

#### SPF (Sender Policy Framework)
```
example.com.  IN  TXT  "v=spf1 ip4:YOUR_SERVER_IP -all"
```

#### DKIM (DomainKeys Identified Mail)
```
stalwart._domainkey.example.com.  IN  TXT  "v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY"
```
Stalwart auto-generates DKIM keys. Retrieve the public key from the admin panel at `http://localhost:8082`.

#### DMARC (Domain-based Message Authentication)
```
_dmarc.example.com.  IN  TXT  "v=DMARC1; p=reject; rua=mailto:dmarc@example.com"
```

#### MX Record
```
example.com.  IN  MX  10 mail.example.com.
```

### 3. TLS Certificate

For production, mount your TLS certificates:

```yaml
volumes:
  - /etc/letsencrypt/live/mail.example.com/fullchain.pem:/opt/stalwart/certs/cert.pem:ro
  - /etc/letsencrypt/live/mail.example.com/privkey.pem:/opt/stalwart/certs/key.pem:ro
```

Or use Stalwart's built-in ACME (Let's Encrypt) support.

### 4. JMAP Configuration

JMAP is enabled by default in Stalwart. The JMAP endpoint is available at:

```
https://mail.example.com/.well-known/jmap
```

#### JMAP Session Discovery

Clients discover the JMAP session URL via:
```
GET https://mail.example.com/.well-known/jmap
Authorization: Basic <base64(user:pass)>
```

This returns a session object with API URLs, accounts, and capabilities.

### 5. Client Configuration

The Anvil Gmail client (`apps/gmail/`) uses the JMAP protocol:

```typescript
// Example JMAP session initialization
const sessionUrl = 'https://mail.example.com/.well-known/jmap';
const response = await fetch(sessionUrl, {
  headers: {
    'Authorization': `Basic ${btoa('user:password')}`,
    'Content-Type': 'application/json',
  },
});
const session = await response.json();

// session.apiUrls === { ... }
// session.accounts === { ... }
// session.primaryAccounts === { ... }
```

#### JMAP API Requests

```typescript
// Fetch inbox emails
const response = await fetch(session.apiUrl, {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${btoa('user:password')}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
    methodCalls: [
      [
        'Email/query',
        {
          accountId: session.primaryAccounts['urn:ietf:params:jmap:mail'],
          filter: { inMailbox: mailboxId },
          sort: [{ property: 'receivedAt', isAscending: false }],
          limit: 50,
        },
        'c0',
      ],
      [
        'Email/get',
        {
          accountId: session.primaryAccounts['urn:ietf:params:jmap:mail'],
          properties: ['id', 'subject', 'from', 'to', 'receivedAt', 'hasAttachment', 'preview', 'keywords'],
        },
        'c1',
      ],
    ],
  }),
});
```

## Persistence

### PostgreSQL Backend (Recommended for Production)

Configure Stalwart to use PostgreSQL:

```toml
[storage]
backend = "postgresql"

[storage.postgresql]
host = "postgres"
port = 5432
database = "stalwart"
username = "anvil"
password = "anvil_secret"
```

### RocksDB Backend (Default)

RocksDB is the default storage backend, suitable for single-node deployments:

```toml
[storage]
backend = "rocksdb"

[storage.rocksdb]
path = "/opt/stalwart/data"
```

## Docker Compose Integration

Already included in `docker-compose.yml`:

```yaml
stalwart:
  image: stalwartlabs/mail-server:latest
  environment:
    MAIL_SERVER_HOSTNAME: mail.anvil.local
    MAIL_SERVER_ADMIN_SECRET: anvil_stalwart_secret
  ports:
    - "25:25"     # SMTP
    - "587:587"   # Submission
    - "993:993"   # IMAPS
    - "8082:8080" # Admin / JMAP
  volumes:
    - stalwart_data:/opt/stalwart
  networks:
    - anvil-net
```

## Health Check

```bash
curl http://localhost:8082/health
```

## Admin Panel

Access the admin panel at `http://localhost:8082` with the configured admin secret.

## Security Checklist

- [ ] TLS enabled (ACME or manual certificates)
- [ ] SPF record published
- [ ] DKIM signing enabled
- [ ] DMARC policy configured
- [ ] Rate limiting enabled
- [ ] Fail2ban or equivalent configured
- [ ] Reverse DNS (PTR) record set
- [ ] Mail server hostname resolves correctly

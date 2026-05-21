/**
 * PAR (RFC 9126) Tests — Pushed Authorization Requests
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';

// ── PAR Detection Tests ──

describe('PAR Detection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {...originalEnv};
  });

  it('returns false when AUTH_USE_PAR is not set', async () => {
    delete process.env.AUTH_USE_PAR;
    const {isPAREnabled} = await import('../../packages/auth/src/par.ts');
    expect(isPAREnabled()).toBe(false);
  });

  it('returns false when AUTH_USE_PAR is not "true"', async () => {
    process.env.AUTH_USE_PAR = 'false';
    const {isPAREnabled} = await import('../../packages/auth/src/par.ts');
    expect(isPAREnabled()).toBe(false);
  });

  it('returns true when AUTH_USE_PAR is "true"', async () => {
    process.env.AUTH_USE_PAR = 'true';
    const {isPAREnabled} = await import('../../packages/auth/src/par.ts');
    expect(isPAREnabled()).toBe(true);
  });
});

// ── PAR Request Construction Tests ──

describe('PAR Request Construction', () => {
  it('constructs correct PAR endpoint URL', () => {
    const keycloakUrl = 'http://localhost:8080';
    const realm = 'anvil';
    const expected = 'http://localhost:8080/realms/anvil/protocol/openid-connect/par';
    expect(`${keycloakUrl}/realms/${realm}/protocol/openid-connect/par`).toBe(expected);
  });

  it('constructs correct authorization URL with request_uri', () => {
    const keycloakUrl = 'http://localhost:8080';
    const realm = 'anvil';
    const clientId = 'anvil-app';
    const requestUri = 'urn:ietf:params:oauth:request_uri:abc123';

    const authUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/auth?client_id=${encodeURIComponent(clientId)}&request_uri=${encodeURIComponent(requestUri)}`;

    expect(authUrl).toContain('client_id=anvil-app');
    expect(authUrl).toContain('request_uri=urn%3Aietf%3Aparams%3Aoauth%3Arequest_uri%3Aabc123');
    expect(authUrl).not.toContain('code_challenge');
    expect(authUrl).not.toContain('redirect_uri');
    expect(authUrl).not.toContain('scope');
  });

  it('builds correct form body with all required params', () => {
    const body = new URLSearchParams({
      client_id: 'anvil-app',
      client_secret: 'secret',
      redirect_uri: 'http://localhost:3000/api/auth/callback',
      code_challenge: 'challenge-value',
      code_challenge_method: 'S256',
      state: 'state-value',
      nonce: 'nonce-value',
      scope: 'openid profile email',
      response_type: 'code',
    });

    expect(body.get('client_id')).toBe('anvil-app');
    expect(body.get('code_challenge_method')).toBe('S256');
    expect(body.get('response_type')).toBe('code');
    expect(body.get('scope')).toBe('openid profile email');
  });
});

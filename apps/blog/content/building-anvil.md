---
title: "Project Anvil: Building a Federated Google Workspace Alternative"
description: "Why we're building Anvil — a self-hosted, privacy-first alternative to Google Workspace with 10 apps, 12 packages, and a modular architecture."
date: "2026-05-20"
author: "Anvil Team"
tags: ["introduction", "architecture", "federation"]
category: "engineering"
featured: true
---

# Building Anvil

We set out to answer a simple question: **What would a privacy-first, self-hosted Google Workspace look like if we built it today?**

The answer became Project Anvil — a federated ecosystem of 10 apps and 12 shared packages, designed for organizations that want full control over their data.

## The Architecture

Anvil is built as a **monorepo with pnpm workspaces**, where each app is an independent Next.js 15 application sharing common packages:

- **@anvil/ui** — Component library with 25+ modules (command palette, copilot, gestures, etc.)
- **@anvil/ai** — Multi-provider AI (OpenAI + Ollama) with streaming, tools, and embeddings
- **@anvil/auth** — OIDC/Keycloak SSO with PKCE and session propagation
- **@anvil/security** — E2EE via Web Crypto (AES-GCM 256-bit + RSA-OAEP 4096-bit)
- **@anvil/billing** — Stripe integration with 4 tiers and usage tracking
- **@anvil/i18n** — 4 locales (en, hi, ja, ar) with RTL support
- **@anvil/notifications** — SSE delivery with smart batching
- **@anvil/telemetry** — OpenTelemetry distributed tracing
- **@anvil/p2p** — WebRTC peer-to-peer file sharing
- **@anvil/ml** — Client-side ML inference (email triage, summarization)
- **@anvil/error-tracking** — Real-time error tracking with React boundaries
- **@anvil/rate-limit** — Token bucket rate limiting

## Why Federation?

Each app can run independently or as part of the suite. Federation means:

1. **Deploy what you need** — Only use Docs + Drive? Deploy just those two.
2. **Scale independently** — YouTube getting heavy? Scale it separately.
3. **Own your data** — Everything runs on your infrastructure.

## What's Next

We're currently at **130+ completed items** across 22 phases. The roadmap includes Spreadsheets, Slides, Forms, Whiteboard, and a full automation engine.

Stay tuned for weekly engineering deep-dives and changelogs.

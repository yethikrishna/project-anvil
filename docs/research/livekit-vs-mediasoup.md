# LiveKit vs Mediasoup — Video Calling Evaluation

**Date:** 2026-05-21
**Status:** Evaluated
**Verdict:** LiveKit recommended for production, mediasoup for demo

---

## Comparison

| Feature | LiveKit | Mediasoup |
|---------|---------|-----------|
| License | Apache 2.0 | ISC |
| Language | Go (server) | Node.js (server) |
| Mobile SDKs | iOS, Android, React Native, Flutter | No official mobile SDKs |
| AI agents | Built-in SIP, AI agent framework | None |
| Scalability | Horizontal (SFU cascading) | Single server |
| Simulcast | Yes | Yes |
| Recording | Built-in Egress | Manual (FFmpeg) |
| Setup | Docker or cloud | Custom Node.js server |
| Browser SDK | Full-featured @livekit/components-react | mediasoup-client |
| Free tier | Cloud: 10K minutes/month | Self-hosted only |
| Community | Very active (YC-backed) | Smaller, established |

---

## Recommendation

**For demo:** Mediasoup (already in stack). Runs in Node.js, integrates with Fastify, no additional infrastructure.

**For production:** LiveKit. Better mobile support, AI agents, recording, scalability.

---

## Files
| File | Purpose |
|------|---------|
| `docs/research/livekit-vs-mediasoup.md` | This document |

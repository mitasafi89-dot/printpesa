# PrintPesa — Real-Money Trade-Prediction Game

> A professional, real-money, crypto-themed **binary trade-prediction** game for the Kenyan market.
> One shared live price curve, everyone bets BUY/SELL, win up to ×5.0.

PrintPesa is a fully managed gaming platform comprising a player web app, an authoritative
real-time game engine, a wallet & M-Pesa payments layer, an affiliate/marketer program, and an
administrative back office.

---

## Documentation Index

| # | Document | Contents |
|---|----------|----------|
| 00 | [Product Overview](docs/00-product-overview.md) | Vision, players, glossary, MVP scope |
| 01 | [System Architecture](docs/01-architecture.md) | Components, data flow, tech stack |
| 02 | [Game Engine & Math](docs/02-game-engine.md) | Round lifecycle, curve generation, RTP / house edge, payout math, provable fairness |
| 03 | [Realtime Protocol](docs/03-realtime-protocol.md) | WebSocket events, tick stream, position lifecycle |
| 04 | [Database Schema](docs/04-database-schema.md) | All tables, columns, relationships, RLS |
| 05 | [API Reference](docs/05-api-reference.md) | REST endpoints for every feature |
| 06 | [Authentication & KYC](docs/06-auth-kyc.md) | Phone + OTP, sessions, age-gate, KYC |
| 07 | [Wallet & Transactions](docs/07-wallet-transactions.md) | Balances, ledger, atomic settlement |
| 08 | [M-Pesa Payments](docs/08-payments-mpesa.md) | STK push deposits, B2C withdrawals, Daraja |
| 09 | [Affiliate / Marketer System](docs/09-affiliate-system.md) | Referrals, 20% rev-share, payouts |
| 10 | [Admin Back Office](docs/10-admin-panel.md) | User mgmt, finance, config, reports |
| 11 | [Activity Feed & Chat](docs/11-activity-feed-chat.md) | Live wins feed, chat moderation |
| 12 | [Bonuses & Promotions](docs/12-bonuses-promotions.md) | Welcome bonus, promo codes, wagering |
| 13 | [Frontend Spec](docs/13-frontend-spec.md) | Screens, components, UX states |
| 14 | [Security & Compliance](docs/14-security-compliance.md) | Threat model, responsible gaming, licensing |
| 15 | [Deployment & DevOps](docs/15-deployment-devops.md) | Environments, CI/CD, monitoring |
| 16 | [MVP Roadmap](docs/16-roadmap.md) | Milestones, acceptance criteria |

---

## Key Parameters (configurable in Admin)

| Parameter | MVP Value | Notes |
|-----------|-----------|-------|
| Currency | KES | Kenyan Shilling |
| Minimum stake | 50 | Quick chips 50 / 100 / 200 / 500 |
| Maximum multiplier | ×5.0 | "Win up to ×5.0" |
| House edge | 75% (RTP 25%) | ⚠️ Business-set; tunable per-game |
| Default round / trade duration | 10s | Auto-sell timer |
| Chart timeframes | 30s · 1m · 2m · 5m | Visualization only |
| Affiliate commission | 20% | Revenue-share on referred net losses |
| Auth | Phone + OTP | Email optional |
| KYC (MVP) | Basic | Phone verified + name + DOB age-gate |

> **Disclaimer:** PrintPesa is a real-money gambling product. Operation requires a valid gaming
> licence and adherence to KYC/AML, responsible-gaming, tax (excise/withholding) and advertising
> rules in every jurisdiction served. See [Security & Compliance](docs/14-security-compliance.md).

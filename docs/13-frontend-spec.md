# 13 — Frontend Spec (Player Web App)

Stack: Next.js 14 + TypeScript + Tailwind. Dark theme matching the screenshot (near-black bg, neon
green/red curve, cyan accents).

## 1. Layout (desktop, matches screenshot)
- **Top bar:** logo "PrintPesa", headline `BTC/KES` rate + 24H high/low + online count, Login/Sign Up,
  theme toggle.
- **Ticker strip:** decorative crypto list (ETH, BNB, SOL, …) — display-only.
- **Left rail:** Live Activity feed + chat input.
- **Center:** the live smooth curve with timeframe toggles (30s/1m/2m/5m) and "Rate" badge.
- **Right panel:** Stake amount + quick chips (50/100/200/500), Auto-sell timer (default 10s),
  Live P&L, **BUY** (green) / **SELL** (red) buttons.
- **Footer:** licence line.

## 2. Key components
| Component | Responsibility |
|-----------|----------------|
| `CurveCanvas` | render ticks as a glassy smooth wave (Catmull-Rom spline), green fill above baseline / red below, glow; animates at tick rate |
| `BetPanel` | stake input + chips, direction buttons, duration, validation (≥50, ≤balance) |
| `LivePnl` | shows live multiplier & P&L from `position_update` |
| `PositionToast` | open/settled outcome notifications |
| `ActivityFeed` | streamed `activity` items |
| `Chat` | streamed `chat`, input with rate-limit + filter UX |
| `WalletWidget` | real/bonus balance, deposit/withdraw entry |
| `AuthModals` | phone+OTP signup/login |

## 3. State & data
- `useGameSocket()` hook manages WS connect/auth/reconnect, exposes ticks, position, balance.
- REST via typed client (auth, wallet, payments, history, affiliate).
- Optimistic UI on open/sell, reconciled by `position_settled`.

## 4. Smooth-curve rendering (requirement)
- Maintain a rolling buffer of ticks; interpolate with cubic spline; redraw on `requestAnimationFrame`.
- Bias styling so **green highs are taller & more frequent** (matches engine `drift_bias`); animated
  gradient fill + soft glow for the "waves" aesthetic.
- 60fps target; decouple render loop from network tick rate via interpolation.

## 5. Screens / routes
`/` game · `/wallet` deposit/withdraw/history · `/account` profile+KYC · `/affiliate` marketer
dashboard · `/r/:code` referral landing · auth modals overlaid.

## 6. Responsive
- Desktop: 3-column as above. Tablet/mobile: stack — curve top, bet panel sticky bottom, feed/chat in tabs.

## 7. Accessibility & UX
- Clear win/loss feedback, responsible-gaming links, balance always visible, confirm on large stakes,
  disabled BUY/SELL when unauthenticated/insufficient balance with a helpful prompt.

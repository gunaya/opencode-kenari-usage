# opencode-kenari-usage

A [OpenCode](https://opencode.ai) TUI plugin that shows your
[kenari.id](https://kenari.id) usage, quota, cycle reset and balance in the
sidebar footer — one glance while you work, no dashboard round-trip.

```
today: 42 req · Rp 15.400
week: Rp 63.000 left · 16%
month: Rp 288.000 left · 4%
resets in 14d
balance: Rp 24.998
```

## What it shows

| Line | Source endpoint | Meaning |
| --- | --- | --- |
| `today: N req · Rp X` | `GET /v1/usage?range=today` | Requests and spend since 00:00 UTC (micro-Rupiah converted) |
| `week` / `month: Rp X left · N%` | `GET /v1/account/quota` | Remaining plan quota per window, percent used |
| `resets in Nd` | `month` window `resets_at` | Monthly window reset — coincides with your plan cycle end unless you renewed early |
| `coupon: Rp X left` | quota endpoint | Active coupon budget, if any |
| `balance: Rp X` | `GET /v1/account/balance` | Spendable balance (excludes holds from in-flight requests) |

Lines turn **warning-colored** when any quota window crosses your kenari
`alert_pct` threshold. Failures degrade per-section (`invalid key`,
`key restricted/shared`, `unreachable`) instead of hiding the rest.

## Requirements

- [OpenCode 2](https://opencode.ai) (built and tested on 2.3.0)
- A kenari.id API key without restrictions — the quota and balance endpoints
  reject shared and restricted keys with `403`

## Install

Clone into OpenCode's global plugin directory — OpenCode discovers
directory plugins there automatically:

```sh
git clone https://github.com/gunaya/opencode-kenari-usage \
  ~/.config/opencode/plugins/kenari-usage
```

Then set your key in the environment OpenCode runs in (WSL/bash: `~/.bashrc`):

```sh
export KENARI_API_KEY="kn-..."
```

Restart OpenCode (or run `/reload`). The lines appear at the bottom of the
sidebar on the Home screen. It coexists with
[opencode-navigator](https://github.com/St1ggy/opencode-navigator) — it
renders into `sidebar.footer`, which Navigator does not touch.

## Configuration

Constants at the top of `tui.tsx`:

| Constant | Default | Meaning |
| --- | --- | --- |
| `POLL_MS` | `60_000` | Poll interval. All three reads are free and share kenari's 60/min account limit; 3/min total is safe. |
| `WINDOW_ORDER` / `WINDOW_LABELS` | week, month | Which quota windows to render and in what order. |

The API key is read from the environment at poll time — never hardcoded,
logged, or rendered.

## How it works

The plugin is a standard OpenCode 2 plugin package discovered from the
plugins directory: `index.ts` is a no-op server part required for discovery,
`tui.tsx` is the TUI part that polls the three endpoints in parallel
(`Promise.allSettled`, so one failing section never hides the others) and
renders into the `sidebar.footer` slot.

## License

MIT

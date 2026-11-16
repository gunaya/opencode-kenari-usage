// TUI plugin: shows kenari.id usage, quota, cycle reset and balance in the
// OpenCode sidebar footer, in that order. Polls three endpoints with a Bearer
// key from the KENARI_API_KEY environment variable; the key is never logged
// or rendered. Rendered into sidebar.footer because Navigator replaces
// sidebar.content, which would swallow an append contribution there.
// Money: whole Rupiah on quota windows, micro-Rupiah on usage and balance
// (Rp 1 = 1_000_000 micro).
// API docs: https://kenari.id/docs/account-quota, /docs/usage, /docs/account-balance
import { Plugin } from "@opencode/plugin/tui"

const QUOTA_URL = "https://kenari.id/v1/account/quota"
const USAGE_URL = "https://kenari.id/v1/usage?range=today"
const BALANCE_URL = "https://kenari.id/v1/account/balance"
const POLL_MS = 60_000 // all reads are free; 60/min shared account limit, 3/min is safe

const WINDOW_ORDER = ["week", "month"]
const WINDOW_LABELS = { week: "week", month: "month" }
const MICRO_IDR = 1_000_000

// kind picks the color: "error" red, "alert" warning, anything else muted.
const state = {
  lines: [{ text: "kenari: …", kind: "error" }],
}

// Resolve theme tokens lazily from setup context; Navigator's own usage shows
// `theme.current.textMuted` / `warning` / `error` are the stable paths.
let themeMuted = "#808080"
let themeWarning = "#e5c07b"
let themeError = "#ff5555"

function formatRupiah(rp) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(rp)}`
}

function formatMicro(micro) {
  return formatRupiah(micro / MICRO_IDR)
}

function errorLine(status) {
  if (!Number.isFinite(status)) return "unreachable" // network failure, not an HTTP status
  if (status === 401) return "invalid key"
  if (status === 403) return "key restricted/shared"
  return `HTTP ${status}`
}

async function fetchJson(url, key) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

// Manual refresh: re-poll now and confirm via toast (summary on success,
// the failing section's line on error).
async function refreshWithToast(toast) {
  await refresh()
  const bad = state.lines.find((line) => line.kind === "error")
  toast.show({
    title: "kenari",
    message: bad ? bad.text : state.lines.map((line) => line.text).join(" · "),
    variant: bad ? "error" : "success",
    duration: 4000,
  })
}

// Human-short reset time: relative countdown under 30 days, else a date.
function formatReset(iso) {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const days = (at.getTime() - Date.now()) / 86_400_000
  if (days >= 0 && days < 30) {
    const unit = days >= 2 ? `${Math.floor(days)}d` : `${Math.max(1, Math.round(days * 24))}h`
    return `resets in ${unit}`
  }
  return `resets ${at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
}

async function refresh() {
  const key = process.env.KENARI_API_KEY
  if (!key) {
    state.lines = [{ text: "kenari: no KENARI_API_KEY", kind: "error" }]
    return
  }

  // All three endpoints share one rate limit; fetch in parallel and render
  // whatever succeeded, with a per-section error line for what did not.
  const [quota, usage, balance] = await Promise.allSettled([
    fetchJson(QUOTA_URL, key),
    fetchJson(USAGE_URL, key),
    fetchJson(BALANCE_URL, key),
  ])

  const lines = []

  if (usage.status === "fulfilled") {
    const total = usage.value.total ?? { requests: 0, cost_micro_idr: 0 }
    lines.push({ text: `today: ${total.requests} req · ${formatMicro(total.cost_micro_idr)}`, kind: "normal" })
  } else {
    lines.push({ text: `today: ${errorLine(Number(usage.reason?.message))}`, kind: "error" })
  }

  if (quota.status === "fulfilled") {
    let alert = false
    const windows = quota.value.plan?.windows ?? {}
    // Preferred display order first, then any window kenari adds later.
    const names = [
      ...WINDOW_ORDER.filter((name) => name in windows),
      ...Object.keys(windows).filter((name) => !WINDOW_ORDER.includes(name)),
    ]
    for (const name of names) {
      const win = windows[name]
      const pct = Math.round(win.used_frac * 100)
      alert ||= pct >= quota.value.alert_pct
      lines.push({ text: `${WINDOW_LABELS[name] ?? name}: ${formatRupiah(win.remaining_rp)} left · ${pct}%`, kind: alert ? "alert" : "normal" })
      // The monthly window shares its reset with the plan cycle, so it doubles
      // as the subscription end date (exact when no early renewal happened).
      if (name === "month") {
        const reset = formatReset(win.resets_at)
        if (reset) lines.push({ text: reset, kind: "normal" })
      }
    }
    if (quota.value.coupon) {
      const left = quota.value.coupon.remaining_rp
      lines.push({ text: `coupon: ${left == null ? "no limit" : `${formatRupiah(left)} left`}`, kind: "normal" })
    }
    if (!quota.value.plan && !quota.value.coupon) lines.push({ text: "no plan or coupon", kind: "normal" })
  } else {
    lines.push({ text: `quota: ${errorLine(Number(quota.reason?.message))}`, kind: "error" })
  }

  if (balance.status === "fulfilled") {
    lines.push({ text: `balance: ${formatMicro(balance.value.available_micro_idr)}`, kind: "normal" })
  } else {
    lines.push({ text: `balance: ${errorLine(Number(balance.reason?.message))}`, kind: "error" })
  }

  state.lines = lines
}

export default Plugin.define({
  id: "kenari.usage",
  setup(context) {
    themeMuted = context.theme?.current?.textMuted ?? themeMuted
    themeWarning = context.theme?.current?.warning ?? themeWarning
    themeError = context.theme?.current?.error ?? themeError

    void refresh()
    const timer = setInterval(refresh, POLL_MS)

    // Palette/slash command + keybind as the manual "button".
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "kenari.usage.refresh",
          title: "Refresh kenari stats",
          group: "kenari",
          bind: "ctrl+r",
          palette: true,
          slash: { name: "kenari" },
          run: () => refreshWithToast(context.ui.toast),
        },
      ],
      bindings: ["kenari.usage.refresh"],
    }))

    const unregister = context.ui.slot({
      append: "sidebar.footer",
      render: () => (
        <box flexDirection="column">
          {state.lines.map((line) => (
            <text fg={line.kind === "error" ? themeError : line.kind === "alert" ? themeWarning : themeMuted}>
              {line.text}
            </text>
          ))}
          <box
            onMouseDown={(event) => event.stopPropagation()}
            onMouseUp={(event) => {
              event.stopPropagation()
              void refreshWithToast(context.ui.toast)
            }}
            border
            padding={1}
          >
            <text>↻ refresh</text>
          </box>
        </box>
      ),
    })

    return () => {
      clearInterval(timer)
      unregister()
    }
  },
})

// Server part: required so OpenCode auto-loads the package; the TUI part
// (tui.tsx) does all the work. Reading usage costs nothing and never touches
// sessions, so the server side stays a no-op.
import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "kenari.usage",
  setup() {},
})

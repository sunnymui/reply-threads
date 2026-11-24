/** Shared semantic colors used by Reply Threads UI surfaces. */
export const UI_COLORS = {
  accent: "#7aa2f7",
  muted: "#8993a8",
  title: "#c0d2ff",
  button: "#28344f",
  buttonText: "#182338",
  row: "#c0d2ff",
  quoteBackground: "#1b2236",
  quoteText: "#a9bdf0",
  divider: "#3b4766",
  inputBackground: "#232c45",
  inputFocusedBackground: "#2c3858",
  inputText: "#e6ecff",
  placeholder: "#6f7b99",
} as const

/** Shared quote, divider and input palette consumed by annotation, thread and reply surfaces. */
export const EDITOR_COLORS = {
  accent: UI_COLORS.accent,
  quoteBackground: UI_COLORS.quoteBackground,
  quoteText: UI_COLORS.quoteText,
  divider: UI_COLORS.divider,
  label: UI_COLORS.title,
  muted: UI_COLORS.muted,
  inputBackground: UI_COLORS.inputBackground,
  inputFocusedBackground: UI_COLORS.inputFocusedBackground,
  inputText: UI_COLORS.inputText,
  placeholder: UI_COLORS.placeholder,
} as const

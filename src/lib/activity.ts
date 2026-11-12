/** A visible tab in the focused browser window counts as using the app. */
export function isAppActive(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

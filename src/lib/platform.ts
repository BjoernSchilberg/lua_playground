/** True on macOS, iPadOS (with keyboard), and iOS. */
export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

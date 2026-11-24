// Open the side panel when the toolbar button (or Alt+Shift+A) is pressed.
// First-run setup is shown by the panel itself when no profile is saved yet.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

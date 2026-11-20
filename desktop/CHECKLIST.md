# WebAppMaker roadmap

## Quick creation on Windows

- [x] Create apps from the prebuilt runtime with their own persistent identity.
- [x] Use a readable executable name for new apps while supporting existing WebApp.exe apps.
- [ ] Apply an automatically discovered or user-selected icon to the shortcut, executable and runtime window; verify Task Manager, taskbar and title bar visually.
- [x] Add a Start menu shortcut and register a per-user uninstaller in Windows.
- [ ] Verify the graphical uninstaller's confirmation, cancellation and failure dialogs visually on Windows; update already-installed apps through their runtime update action.
- [x] Test creation, opening and removal of a dedicated QA app while retaining other apps and profiles.
- [x] Update runtime of an installed quick app while retaining its identity, configuration and profile; reject updates while it is running.
- [x] Edit an existing app while preserving sign-ins.
  - [x] Edit window size, zoom, always-on-top, maximized and fullscreen settings; require the app to be closed.
  - [x] Edit URL and clear the previous last-URL state while keeping the profile; show the configured URL in the app list.
  - [x] Replace the executable, shortcut icon file and runtime icon with rollback on replacement errors.
  - [x] Verify the edit flow with a dedicated Windows QA app; user confirmed retained sign-in and edits on YouTube.

## Runtime features

- [ ] Verify page refresh on Windows WebView2, including focused windows and blank/error pages. A Reload page action is available in the page context menu; Ctrl+R remains available when web shortcuts are enabled.
- [ ] Add an optional Picture-in-Picture control for supported video elements, with an Advanced toggle. Availability depends on the webview, the page's permissions and the video; test real Windows WebView2 and a site that blocks PiP.
- [ ] Verify Save Image As and Copy Image on real WebView2, including blob images and cross-origin restrictions.
- [ ] Research optional unpacked browser extensions on Windows; do not claim compatibility with browser stores or every extension.

## Product completion

- [ ] Package WebAppMaker as an independent desktop app with its runtime.
- [ ] Finish English localization and test small windows and high DPI.
- [ ] Test app lifecycle and installer creation on Windows, including failure recovery.
- [ ] Add safe installer-build cancellation.

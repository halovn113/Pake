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

## New requests

- [ ] Add a right-click action to open a link in another window of the same app.
- [ ] Verify uninstall from My apps using the graphical confirmation and safe removal flow.
- [ ] Investigate a native uninstaller without the PowerShell helper; distinguish quick apps from MSI installers.
- [x] Use clean Start menu names for new apps when available and allow existing legacy shortcuts to be renamed when there is no collision. Verified installation, rename and removal with QA apps.
- [ ] Verify the graphical keep/delete data choice end-to-end. The removal helper validates the profile path and was tested for both choices using dedicated QA profiles.
- [ ] Test Picture-in-Picture on a real WebView2 app and distinguish it from website/browser PiP.

## Runtime features

- [ ] Verify page refresh on Windows WebView2, including focused windows and blank/error pages. A Reload page action is available in image and link context menus; ordinary page menus remain native. Ctrl+R remains available when web shortcuts are enabled.
- [ ] Verify optional Picture-in-Picture on real Windows WebView2 and a site that blocks PiP. The Advanced toggle adds a control for supported top-level videos when creating an app; cross-origin frames and existing app editing remain unsupported.
- [ ] Verify Save Image As and Copy Image on real WebView2, including blob images and cross-origin restrictions.
- [x] Research whether WebView2 supports optional unpacked extensions.
- [ ] Implement and test optional unpacked extensions on Windows; store installation and compatibility remain unverified.

## Product completion

- [ ] Package WebAppMaker as an independent desktop app with its runtime.
- [ ] Finish English localization and test small windows and high DPI.
- [ ] Test app lifecycle and installer creation on Windows, including failure recovery.
- [ ] Add safe installer-build cancellation.

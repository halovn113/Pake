# WebAppMaker roadmap

## Quick creation on Windows

- [x] Create apps from the prebuilt runtime with their own persistent identity.
- [x] Use a readable executable name for new apps while supporting existing WebApp.exe apps.
- [x] Apply an automatically discovered or user-selected icon to the shortcut, executable and runtime window. User confirmed both icon selection modes and the YouTube icon in Task Manager and on the taskbar.
- [x] Add a Start menu shortcut and register a per-user uninstaller in Windows.
- [ ] Verify the graphical uninstaller's confirmation, cancellation and failure dialogs visually on Windows, including checkbox layout at high DPI. New apps include Uninstall.exe; update already-installed apps through their runtime update action. Legacy uninstall.ps1 files are retained.
- [x] Test creation, opening and removal of a dedicated QA app while retaining other apps and profiles.
- [x] Update runtime of an installed quick app while retaining its identity, configuration and profile; reject updates while it is running.
- [x] Edit an existing app while preserving sign-ins.
  - [x] Edit window size, zoom, always-on-top, maximized and fullscreen settings; require the app to be closed.
  - [x] Edit URL and clear the previous last-URL state while keeping the profile; show the configured URL in the app list.
  - [x] Replace the executable, shortcut icon file and runtime icon with rollback on replacement errors.
  - [x] Verify the edit flow with a dedicated Windows QA app; user confirmed retained sign-in and edits on YouTube.

## New requests

- [ ] Verify the Windows native refresh control above the web content: user confirmed it works in normal use. WebView2 fullscreen now hides the menu and restores it on exit; verify on YouTube, secondary windows, and error pages. The runtime implementation uses per-window native reload.
- [ ] Verify the PiP icon and addon card/delete controls visually on Windows.

- [ ] Verify installed app icons visually in My apps; icon endpoint tested with a QA app.
- [x] Hide apps uninstalled through Windows from My apps while preserving records if the install state cannot be verified; tested with a QA app.

- [ ] Verify the right-click action to open same-origin links in another app window on Windows: user reported the menu actions work; still check sign-in persistence, secondary windows, and cross-origin handling.
- [ ] Verify uninstall from My apps using the graphical confirmation and safe removal flow; removed apps can be cleared from the manager list after their install folder is gone.
- [ ] Verify the native uninstaller through the graphical interface and Add/Remove Programs. Native removal has been tested with QA apps for keep/delete data, running-app rejection, mismatched app identity, and invalid shortcut path; MSI remains a separate installer path.
- [x] Use clean Start menu names for new apps when available and allow existing legacy shortcuts to be renamed when there is no collision. Verified installation, rename and removal with QA apps.
- [ ] Verify the graphical keep/delete data choice end-to-end. The removal helper validates the profile path and was tested for both choices using dedicated QA profiles.
- [x] Verify Picture-in-Picture on YouTube: user confirmed the separate floating window and distinguished it from YouTube’s in-page mini player.

## Runtime features

- [ ] Verify quick-app tray icon, hide on close, start in tray, show/hide, quit, and sign-in persistence on Windows with a dedicated QA app. Configuration validates the tray dependency and uses the app icon.

- [ ] Verify page refresh on Windows WebView2, including focused windows and blank/error pages. A Reload page action is available in image and link context menus; ordinary page menus remain native. Ctrl+R remains available when web shortcuts are enabled.
- [ ] Verify Picture-in-Picture on a real site that blocks it and visually check the updated hover control. YouTube was confirmed by the user; automated tests cover rejected requests. Cross-origin frames and existing app editing remain unsupported.
- [ ] Verify Save Image As and Copy Image on real WebView2: user reported the displayed menu actions work; still check blob images and cross-origin restrictions.
- [x] Research whether WebView2 supports optional unpacked extensions.
- [ ] Verify experimental unpacked extension loading on real Windows WebView2 and add extension management and install status. Quick creation can select multiple library addons and one private unpacked addon; discovery and import support Chrome, Edge and Brave. A locally authored QA addon ran in WebView2. Wry currently ignores asynchronous installation errors. Store installation and compatibility remain unverified.

## Product completion

- [ ] Package WebAppMaker as an independent desktop app with its runtime. The server now supports a separate absolute data root; the desktop shell, packaged dependencies, migration and installer build support are still needed.
- [ ] Finish English localization and test small windows and high DPI. Expanded translations for manager dialogs, add-on compatibility warnings, profile cleanup and known backend errors; verify the full UI and remaining dynamic/OS errors in English, including small windows and high DPI.
- [ ] Test app lifecycle and installer creation on Windows, including failure recovery.
- [ ] Verify installer-build cancellation end-to-end on Windows with a dedicated build. The manager now requests termination of the build process tree and avoids registering cancelled results; temporary files are retained. A dedicated single-process termination smoke test passed, but a full process-tree build test is still needed.

- [x] Add automatic sorting options to My Apps while preserving the manual order.

## Addon compatibility and recovery

- [ ] Inspect addon manifests before selection and flag known compatibility risks without running addon code; distinguish tested, risky, and untested versions. Library and scanned addons now warn about native messaging and the tested IDM version; private uploads are inspected before creation; verified-compatible results remain to be added.
- [ ] Offer a temporary launch without addons to recover from a broken app while preserving its settings and data.
- [ ] Help users identify a problematic addon by enabling addons one at a time.
## Issues to investigate

- [ ] A newly created YouTube app showed a WebView error for `chrome-search://local-ntp/local-ntp.html` in an unidentified window. The app's configured and last-saved URLs were YouTube; reproduce the window-opening flow and identify whether an extension or popup requested the internal Chromium URL. Do not assume the cause.

- [ ] Investigate: opening a same-origin YouTube link in a new app window works signed out but was reported to fail when signed in (app 0562d19d-02e2-4447-8fe9-1a8cbf230c29). User initially reported no new window while signed in, then reported it opened again after the runtime update. Cause remains unconfirmed; verify repeated signed-in use and whether the new window retains the session.

## Reinstall and duplicate websites

- [ ] Verify reinstall with a dedicated QA app, including retained login data, URL changes, error recovery and concurrent installation. A candidate picker and reuse of retained identity have been implemented.
- [ ] Support updating an installed matching app from the creation flow while preserving its profile; currently the picker offers to manage the existing app instead.
- [ ] Offer explicit, separately confirmed deletion of retained profiles when creating a new app; the current picker keeps them.
- [ ] Consider recovery of retained profiles whose manager records were removed; automatic matching requires reliable website metadata.

## Retained profile cleanup

- [ ] Verify the profile cleanup view on Windows with dedicated QA profiles, including registered apps, unknown records, inaccessible files, and confirmation/cancellation. Automated tests cover selection, changed state, deletion of a QA profile, and a directory link.

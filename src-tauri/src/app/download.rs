//! WebView2 downloads keep the browser session and its default download UI.

use crate::util::{
    check_file_or_append, get_download_dir, get_download_message_with_lang,
    sanitize_download_filename, show_toast, MessageType,
};
use std::path::PathBuf;
use tauri::{Manager, WebviewWindow};
use webview2_com::{
    take_pwstr, DownloadStartingEventHandler,
    Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_4, COREWEBVIEW2_DOWNLOAD_STATE, COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED,
        COREWEBVIEW2_DOWNLOAD_STATE_INTERRUPTED,
    },
    StateChangedEventHandler,
};
use windows_core::{Interface, HSTRING, PWSTR};

pub fn install(window: &WebviewWindow, target: Option<tauri::Url>) -> tauri::Result<()> {
    let owner = window.clone();
    window.with_webview(move |webview| {
        let result = unsafe {
            (|| -> windows_core::Result<()> {
                let core = webview.controller().CoreWebView2()?;
                let downloads = core.cast::<ICoreWebView2_4>()?;
                let download_window = owner.clone();
                let mut token = 0;
                downloads.add_DownloadStarting(
                    &DownloadStartingEventHandler::create(Box::new(move |_, args| {
                        let Some(args) = args else { return Ok(()) };
                        // Fail closed if changing the destination fails: never fall
                        // back to a different folder or overwrite an existing file.
                        args.SetCancel(true)?;
                        let destination = (|| -> Result<PathBuf, String> {
                            let mut path = PWSTR::null();
                            args.ResultFilePath(&mut path).map_err(|e| e.to_string())?;
                            let path = PathBuf::from(take_pwstr(path));
                            let filename = path
                                .file_name()
                                .and_then(|name| name.to_str())
                                .unwrap_or("download");
                            let path = get_download_dir(download_window.app_handle())?
                                .join(sanitize_download_filename(filename));
                            let path = path
                                .to_str()
                                .ok_or("Download destination is not valid UTF-8")?;
                            Ok(PathBuf::from(check_file_or_append(path)))
                        })();
                        match destination {
                            Ok(path) => {
                                args.SetResultFilePath(&HSTRING::from(path.as_os_str()))?;
                                let operation = args.DownloadOperation()?;
                                let toast_window = download_window.clone();
                                let notified =
                                    std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
                                let mut state_token = 0;
                                operation.add_StateChanged(
                                    &StateChangedEventHandler::create(Box::new(
                                        move |operation, _| {
                                            let Some(operation) = operation else {
                                                return Ok(());
                                            };
                                            let mut state = COREWEBVIEW2_DOWNLOAD_STATE::default();
                                            operation.State(&mut state)?;
                                            if state != COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED
                                                && state != COREWEBVIEW2_DOWNLOAD_STATE_INTERRUPTED
                                            {
                                                return Ok(());
                                            }
                                            if notified
                                                .swap(true, std::sync::atomic::Ordering::Relaxed)
                                            {
                                                return Ok(());
                                            }
                                            if state == COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED {
                                                let mut result = PWSTR::null();
                                                let path = if operation
                                                    .ResultFilePath(&mut result)
                                                    .is_ok()
                                                {
                                                    Some(PathBuf::from(take_pwstr(result)))
                                                } else {
                                                    None
                                                };
                                                crate::util::show_download_finished(
                                                    &toast_window,
                                                    path,
                                                    None,
                                                );
                                            } else {
                                                show_toast(
                                                    &toast_window,
                                                    &get_download_message_with_lang(
                                                        MessageType::Failure,
                                                        None,
                                                    ),
                                                );
                                            }
                                            Ok(())
                                        },
                                    )),
                                    &mut state_token,
                                )?;
                                // Unlike Wry's requested callback, leave WebView2's UI visible.
                                args.SetHandled(false)?;
                                args.SetCancel(false)?;
                            }
                            Err(error) => {
                                args.SetCancel(true)?;
                                eprintln!("[Pake] Failed to resolve download destination: {error}");
                                show_toast(
                                    &download_window,
                                    &get_download_message_with_lang(
                                        MessageType::DirectoryFailure,
                                        None,
                                    ),
                                );
                            }
                        }
                        Ok(())
                    })),
                    &mut token,
                )?;
                if let Some(target) = target {
                    core.Navigate(&HSTRING::from(target.as_str()))?;
                }
                Ok(())
            })()
        };
        if let Err(error) = result {
            eprintln!("[Pake] Failed to initialize native Windows downloads: {error}");
        }
    })
}

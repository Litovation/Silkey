//! Account access gate and the Google sign-in return path.
//!
//! The frontend owns sign-in and the "is this account allowed?" check; it
//! reports the answer here so dictation can be refused at the point where
//! recording starts, whatever triggered it (hotkey, touchpad, CLI flag).

use std::io::{ErrorKind, Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Loopback port the browser is sent back to after Google sign-in. Fixed
/// because the address must be listed in the auth provider's allowed
/// redirect URLs.
const OAUTH_PORT: u16 = 17645;
const OAUTH_WAIT: Duration = Duration::from_secs(300);

const OAUTH_DONE_PAGE: &str = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Silktone</title></head><body style=\"font-family:Segoe UI,sans-serif;text-align:center;padding-top:15vh\"><h2>You can return to Silktone</h2><p>This tab can be closed.</p></body></html>";

/// Starts allowed so the moments before the window reports in never lock a
/// legitimate user out; the frontend withdraws it as soon as it knows better.
static ACCESS_ALLOWED: AtomicBool = AtomicBool::new(true);
static OAUTH_LISTENING: AtomicBool = AtomicBool::new(false);

pub fn is_allowed() -> bool {
    ACCESS_ALLOWED.load(Ordering::Relaxed)
}

#[tauri::command]
#[specta::specta]
pub fn set_access_allowed(allowed: bool) {
    ACCESS_ALLOWED.store(allowed, Ordering::Relaxed);
}

/// Listen once on the loopback port for the browser's return from sign-in and
/// forward its query string to the frontend as an `oauth-callback` event.
#[tauri::command]
#[specta::specta]
pub fn start_oauth_listener(app: AppHandle) -> Result<u16, String> {
    if OAUTH_LISTENING.swap(true, Ordering::SeqCst) {
        // A previous sign-in attempt is still waiting; reuse it.
        return Ok(OAUTH_PORT);
    }

    let listener = match TcpListener::bind(("127.0.0.1", OAUTH_PORT)) {
        Ok(listener) => listener,
        Err(e) => {
            OAUTH_LISTENING.store(false, Ordering::SeqCst);
            return Err(format!("Could not start sign-in listener: {e}"));
        }
    };

    std::thread::spawn(move || {
        wait_for_callback(&listener, &app);
        OAUTH_LISTENING.store(false, Ordering::SeqCst);
    });

    Ok(OAUTH_PORT)
}

fn wait_for_callback(listener: &TcpListener, app: &AppHandle) {
    if let Err(e) = listener.set_nonblocking(true) {
        log::warn!("Sign-in listener could not be made non-blocking: {e}");
        return;
    }

    let deadline = Instant::now() + OAUTH_WAIT;
    while Instant::now() < deadline {
        let mut stream = match listener.accept() {
            Ok((stream, _)) => stream,
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            Err(e) => {
                log::warn!("Sign-in listener failed: {e}");
                return;
            }
        };

        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
        let mut buffer = [0u8; 8192];
        let read = stream.read(&mut buffer).unwrap_or(0);
        let request = String::from_utf8_lossy(&buffer[..read]).into_owned();
        let target = request
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .unwrap_or("");

        // Browsers also ask for things like /favicon.ico; only /callback counts.
        if !target.starts_with("/callback") {
            let _ = stream.write_all(
                b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            );
            continue;
        }

        let query = target
            .split_once('?')
            .map(|(_, query)| query.to_string())
            .unwrap_or_default();
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            OAUTH_DONE_PAGE.len(),
            OAUTH_DONE_PAGE
        );
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();

        if let Err(e) = app.emit("oauth-callback", query) {
            log::warn!("Failed to forward sign-in result: {e}");
        }
        crate::show_main_window(app);
        return;
    }
}

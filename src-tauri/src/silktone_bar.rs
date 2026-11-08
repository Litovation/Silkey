//! The Silktone bar and the typing nudge.
//!
//! The bar is the recording overlay's resting state: a small pill that stays at
//! the top or bottom of the screen (`overlay_position`) whenever Silktone is not
//! recording. Hovering it opens a short hint; clicking it starts dictation as if
//! the shortcut had been tapped. It lives in the same window as the recording
//! overlay, so dictation simply grows out of the bar and settles back into it.
//!
//! The typing nudge watches for long stretches of typing outside Silktone and
//! briefly opens the bar with a suggestion to dictate instead. Only the number
//! of keystrokes is kept: which keys were pressed is never looked at beyond
//! "is this a character key", stored, or logged.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use log::{debug, warn};
use tauri::{AppHandle, Manager};

use crate::settings;

/// Typing this many characters within `TYPING_WINDOW` counts as a long
/// stretch: about 35 words in a minute and a half.
const TYPING_BURST_KEYS: usize = 180;
const TYPING_WINDOW: Duration = Duration::from_secs(90);
/// After a nudge, stay quiet at least this long.
const NUDGE_COOLDOWN: Duration = Duration::from_secs(20 * 60);
/// At most this many nudges per run of the app, so it never becomes a nag.
const MAX_NUDGES_PER_SESSION: u64 = 4;
/// How long a nudge stays open before the bar folds back.
const NUDGE_VISIBLE: Duration = Duration::from_secs(9);

static NUDGES_SHOWN: AtomicU64 = AtomicU64::new(0);
static TYPING_WATCH_RUNNING: AtomicBool = AtomicBool::new(false);
static TYPING_WATCH_ENABLED: AtomicBool = AtomicBool::new(false);
static LAST_NUDGE: Mutex<Option<Instant>> = Mutex::new(None);

/// Whether the bar should be on screen right now: switched on, the tutorial
/// finished (before that, dictation only works inside the tutorial), access
/// allowed, and not in the middle of a recording.
pub fn bar_should_show(app: &AppHandle) -> bool {
    let settings = settings::get_settings(app);
    settings.silktone_bar_enabled
        && settings.onboarding_completed
        && settings.tutorial_version >= settings::CURRENT_TUTORIAL_VERSION
        && crate::access::is_allowed()
        && !is_recording(app)
}

fn is_recording(app: &AppHandle) -> bool {
    app.try_state::<std::sync::Arc<crate::managers::audio::AudioRecordingManager>>()
        .is_some_and(|rm| rm.is_recording())
}

/// Put the bar back on screen (or take it away) to match the current settings.
pub fn refresh(app: &AppHandle) {
    if bar_should_show(app) {
        crate::overlay::show_bar_state(app, "idle");
    } else if !is_recording(app) {
        crate::overlay::hide_recording_overlay(app);
    }
}

/// Count-only filter: a character key typed without Ctrl, Alt or the Windows
/// key. Shortcuts, arrows and mouse buttons do not count as typing.
fn is_typing_key(event: &silktone_keys::KeyEvent) -> bool {
    use silktone_keys::Modifiers;
    if !event.is_key_down {
        return false;
    }
    let Some(key) = event.key else {
        return false;
    };
    if event
        .modifiers
        .intersects(Modifiers::CTRL | Modifiers::OPT | Modifiers::CMD | Modifiers::FN)
    {
        return false;
    }
    let name = key.to_string();
    name.chars().count() == 1 || name == "Space"
}

/// Rolling count of typing keystrokes; true once a long stretch is reached.
struct TypingWindow {
    presses: VecDeque<Instant>,
}

impl TypingWindow {
    fn new() -> Self {
        Self {
            presses: VecDeque::new(),
        }
    }

    fn record(&mut self, now: Instant) -> bool {
        self.presses.push_back(now);
        while self
            .presses
            .front()
            .is_some_and(|&first| now.duration_since(first) > TYPING_WINDOW)
        {
            self.presses.pop_front();
        }
        self.presses.len() >= TYPING_BURST_KEYS
    }

    fn clear(&mut self) {
        self.presses.clear();
    }
}

fn nudge_allowed(now: Instant) -> bool {
    if NUDGES_SHOWN.load(Ordering::Relaxed) >= MAX_NUDGES_PER_SESSION {
        return false;
    }
    match *LAST_NUDGE.lock().unwrap() {
        Some(last) => now.duration_since(last) >= NUDGE_COOLDOWN,
        None => true,
    }
}

/// Typing inside Silktone's own window (the tutorial's practice box, custom
/// words) never earns a nudge.
fn silktone_window_focused(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false)
}

fn show_nudge(app: &AppHandle) {
    let settings = settings::get_settings(app);
    if !settings.typing_nudge_enabled || !bar_should_show(app) {
        return;
    }
    NUDGES_SHOWN.fetch_add(1, Ordering::Relaxed);
    *LAST_NUDGE.lock().unwrap() = Some(Instant::now());
    debug!("Typing nudge shown");
    crate::overlay::show_bar_state(app, "nudge");

    let handle = app.clone();
    std::thread::spawn(move || {
        let shown_at = crate::overlay::show_generation();
        std::thread::sleep(NUDGE_VISIBLE);
        // Fold back only if nothing else (hover, dictation) took the bar over.
        if crate::overlay::show_generation() == shown_at && bar_should_show(&handle) {
            crate::overlay::show_bar_state(&handle, "idle");
        }
    });
}

/// Start or stop the typing watch to match the nudge setting. The watch
/// thread is started once and then idles while the nudge is switched off.
pub fn apply_typing_watch(app: &AppHandle, enabled: bool) {
    TYPING_WATCH_ENABLED.store(enabled, Ordering::Relaxed);
    if !enabled || TYPING_WATCH_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let listener = match silktone_keys::KeyboardListener::new() {
            Ok(listener) => listener,
            Err(error) => {
                warn!("Typing nudge unavailable: {error}");
                TYPING_WATCH_RUNNING.store(false, Ordering::SeqCst);
                return;
            }
        };
        let mut window = TypingWindow::new();
        loop {
            let Some(event) = listener.recv_timeout(Duration::from_secs(1)).ok() else {
                continue;
            };
            if !TYPING_WATCH_ENABLED.load(Ordering::Relaxed) || !is_typing_key(&event) {
                continue;
            }
            let now = Instant::now();
            if window.record(now) {
                window.clear();
                if nudge_allowed(now) && !is_recording(&app) && !silktone_window_focused(&app) {
                    show_nudge(&app);
                }
            }
        }
    });
}

/// The overlay page finished loading: show the bar if it belongs on screen.
/// (A show sent before the page listens would be lost.)
#[tauri::command]
#[specta::specta]
pub fn silktone_bar_refresh(app: AppHandle) {
    refresh(&app);
}

#[tauri::command]
#[specta::specta]
pub fn silktone_bar_start_dictation(app: AppHandle) {
    crate::signal_handle::send_transcription_input(&app, "transcribe", "silktone_bar");
}

/// The pointer entered or left the bar: grow the window for the hint card, or
/// fold it back to the slim pill. A nudge on screen stays open on hover.
#[tauri::command]
#[specta::specta]
pub fn silktone_bar_hover(app: AppHandle, hovered: bool) {
    if !bar_should_show(&app) {
        return;
    }
    crate::overlay::show_bar_state(&app, if hovered { "hover" } else { "idle" });
}

#[tauri::command]
#[specta::specta]
pub fn change_silktone_bar_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut settings = settings::get_settings(&app);
    settings.silktone_bar_enabled = enabled;
    settings::write_settings(&app, settings);
    refresh(&app);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn change_typing_nudge_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut settings = settings::get_settings(&app);
    settings.typing_nudge_enabled = enabled;
    settings::write_settings(&app, settings);
    apply_typing_watch(&app, enabled);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use silktone_keys::{Key, KeyEvent, Modifiers};

    fn key(key: Key, modifiers: Modifiers) -> KeyEvent {
        KeyEvent {
            modifiers,
            key: Some(key),
            is_key_down: true,
            changed_modifier: None,
        }
    }

    #[test]
    fn letters_space_and_shifted_keys_count_as_typing() {
        assert!(is_typing_key(&key(Key::A, Modifiers::empty())));
        assert!(is_typing_key(&key(Key::Space, Modifiers::empty())));
        assert!(is_typing_key(&key(Key::Num0, Modifiers::SHIFT)));
    }

    #[test]
    fn shortcuts_releases_and_mouse_do_not_count() {
        assert!(!is_typing_key(&key(Key::C, Modifiers::CTRL)));
        assert!(!is_typing_key(&key(Key::Tab, Modifiers::OPT)));
        assert!(!is_typing_key(&key(Key::MouseLeft, Modifiers::empty())));
        let mut release = key(Key::A, Modifiers::empty());
        release.is_key_down = false;
        assert!(!is_typing_key(&release));
    }

    #[test]
    fn a_long_stretch_inside_the_window_triggers() {
        let mut window = TypingWindow::new();
        let start = Instant::now();
        for i in 0..TYPING_BURST_KEYS - 1 {
            assert!(!window.record(start + Duration::from_millis(i as u64 * 200)));
        }
        assert!(window.record(start + Duration::from_secs(40)));
    }

    #[test]
    fn slow_typing_spread_out_never_triggers() {
        let mut window = TypingWindow::new();
        let start = Instant::now();
        // One key every second: never more than ~90 inside the window.
        for i in 0..1000u64 {
            assert!(!window.record(start + Duration::from_secs(i)));
        }
    }
}

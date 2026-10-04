//! Resting two fingers on the touchpad dictates: hold to start, lift to stop.
//!
//! Windows Precision Touchpads expose raw finger contacts over HID. We read
//! them through Raw Input (no mouse hook), so ordinary clicks, taps and
//! two-finger scrolls never trigger this. Other platforms have no listener;
//! the setting is stored but inert there.
//!
//! The gesture used to be a two-finger double-tap, which some touchpads
//! cannot produce reliably, so it is now a two-finger hold. The setting key
//! (`trackpad_double_tap_enabled`) keeps its old name so stored settings and
//! the frontend bindings stay valid.
//!
//! [`HoldDetector`] is the pure gesture logic (finger-down/up samples in,
//! "started" / "released" out) so it can be unit tested without hardware.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

/// How long two fingers must rest on the pad to trigger, unless changed.
pub const DEFAULT_HOLD_MS: u32 = 1500;
const MIN_HOLD_MS: u32 = 500;
const MAX_HOLD_MS: u32 = 3000;
/// No reports for this long means we missed a lift; drop all state.
const STALE_AFTER: Duration = Duration::from_secs(5);

static HOLD_MS: AtomicU32 = AtomicU32::new(DEFAULT_HOLD_MS);

/// Keep a requested hold time within the range the gesture works well in.
pub fn clamp_hold_ms(milliseconds: u32) -> u32 {
    milliseconds.clamp(MIN_HOLD_MS, MAX_HOLD_MS)
}

/// Apply the saved hold time (call at startup and whenever it changes).
pub fn set_hold_ms(milliseconds: u32) {
    HOLD_MS.store(clamp_hold_ms(milliseconds), Ordering::Relaxed);
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn hold_for() -> Duration {
    Duration::from_millis(u64::from(HOLD_MS.load(Ordering::Relaxed)))
}

/// One finger's state from a touchpad report.
#[derive(Debug, Clone, Copy)]
pub struct Sample {
    pub id: u32,
    pub x: i32,
    pub y: i32,
    /// Finger is touching the surface.
    pub tip: bool,
}

/// What a sample means for dictation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Gesture {
    None,
    /// Two fingers have rested long enough: start dictating.
    Started,
    /// A finger lifted after a started hold: stop and paste.
    Released,
}

struct Contact {
    start: (i32, i32),
}

#[derive(Default)]
pub struct HoldDetector {
    contacts: HashMap<u32, Contact>,
    /// When exactly two still fingers came to rest, if they are still there.
    hold_started: Option<Instant>,
    /// This touch already fired or was ruled out; wait for every finger to lift.
    spent: bool,
    /// The hold fired and the fingers have not lifted yet.
    active: bool,
    last_event: Option<Instant>,
}

impl HoldDetector {
    pub fn new() -> Self {
        Self::default()
    }

    /// When the current two-finger hold began. Callers arm a timer off this,
    /// because a pad may send no further reports while fingers rest still.
    pub fn hold_started(&self) -> Option<Instant> {
        self.hold_started
    }

    /// Feed one finger sample. `move_limit` is how far (in touchpad units) a
    /// finger may drift and still count as resting; `hold` is how long the
    /// fingers must rest.
    pub fn on_sample(
        &mut self,
        s: Sample,
        now: Instant,
        move_limit: i32,
        hold: Duration,
    ) -> Gesture {
        if self
            .last_event
            .is_some_and(|t| now.duration_since(t) > STALE_AFTER)
            && !self.active
        {
            self.contacts.clear();
            self.hold_started = None;
            self.spent = false;
        }
        self.last_event = Some(now);

        if !s.tip {
            if self.contacts.remove(&s.id).is_none() {
                return Gesture::None;
            }
            self.hold_started = None;
            // A new hold needs a fresh touch: every finger off the pad first.
            self.spent = !self.contacts.is_empty();
            if self.active {
                self.active = false;
                return Gesture::Released;
            }
            return Gesture::None;
        }

        let contact = self.contacts.entry(s.id).or_insert(Contact {
            start: (s.x, s.y),
        });
        let moved = (s.x - contact.start.0).abs() > move_limit
            || (s.y - contact.start.1).abs() > move_limit;
        let count = self.contacts.len();

        // Once dictation has started, only lifting a finger ends it; fingers
        // may drift while the user speaks.
        if self.active {
            return Gesture::None;
        }
        // Scrolling (movement) or a three-finger gesture rules this touch out.
        if moved || count > 2 {
            self.spent = true;
            self.hold_started = None;
            return Gesture::None;
        }
        if self.spent || count < 2 {
            return Gesture::None;
        }
        if self.hold_started.is_none() {
            self.hold_started = Some(now);
            return Gesture::None;
        }
        if self.poll(now, hold) {
            Gesture::Started
        } else {
            Gesture::None
        }
    }

    /// Check the hold without a new sample (called from a timer). Returns
    /// true once per touch, when two fingers have rested for `hold`.
    pub fn poll(&mut self, now: Instant, hold: Duration) -> bool {
        let due = !self.spent
            && self.contacts.len() == 2
            && self
                .hold_started
                .is_some_and(|t| now.duration_since(t) >= hold);
        if due {
            self.spent = true;
            self.active = true;
            self.hold_started = None;
        }
        due
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIMIT: i32 = 100;
    const HOLD: Duration = Duration::from_millis(1500);

    fn down(id: u32, x: i32, y: i32) -> Sample {
        Sample { id, x, y, tip: true }
    }
    fn up(id: u32, x: i32, y: i32) -> Sample {
        Sample { id, x, y, tip: false }
    }
    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }
    fn feed(d: &mut HoldDetector, s: Sample, t: Instant) -> Gesture {
        d.on_sample(s, t, LIMIT, HOLD)
    }

    /// Two fingers land at `t`.
    fn land_two(d: &mut HoldDetector, t: Instant) {
        assert_eq!(feed(d, down(1, 0, 0), t), Gesture::None);
        assert_eq!(feed(d, down(2, 500, 0), t), Gesture::None);
    }

    #[test]
    fn resting_two_fingers_starts_once() {
        let mut d = HoldDetector::new();
        let t0 = Instant::now();
        land_two(&mut d, t0);
        assert_eq!(feed(&mut d, down(1, 0, 0), t0 + ms(800)), Gesture::None);
        assert_eq!(feed(&mut d, down(1, 0, 0), t0 + ms(1600)), Gesture::Started);
        // Still resting: no second start from the same touch.
        assert_eq!(feed(&mut d, down(2, 500, 0), t0 + ms(3200)), Gesture::None);
        assert!(!d.poll(t0 + ms(3300), HOLD));
    }

    #[test]
    fn lifting_after_a_start_releases_once() {
        let mut d = HoldDetector::new();
        let t0 = Instant::now();
        land_two(&mut d, t0);
        assert!(d.poll(t0 + ms(1600), HOLD));
        // Drifting while speaking does not end it.
        assert_eq!(feed(&mut d, down(1, 0, 5000), t0 + ms(4000)), Gesture::None);
        assert_eq!(feed(&mut d, up(1, 0, 5000), t0 + ms(9000)), Gesture::Released);
        assert_eq!(feed(&mut d, up(2, 500, 0), t0 + ms(9010)), Gesture::None);
    }

    #[test]
    fn timer_starts_when_the_pad_sends_no_reports() {
        let mut d = HoldDetector::new();
        let t0 = Instant::now();
        land_two(&mut d, t0);
        assert!(d.hold_started().is_some());
        assert!(!d.poll(t0 + ms(1000), HOLD));
        assert!(d.poll(t0 + ms(1530), HOLD));
        assert!(!d.poll(t0 + ms(1600), HOLD));
    }

    #[test]
    fn a_shorter_hold_time_starts_sooner() {
        let mut d = HoldDetector::new();
        let t0 = Instant::now();
        land_two(&mut d, t0);
        assert!(d.poll(t0 + ms(600), ms(500)));
    }

    #[test]
    fn lifting_early_does_nothing() {
        let mut d = HoldDetector::new();
        let t0 = Instant::now();
        land_two(&mut d, t0);
        assert_eq!(feed(&mut d, up(1, 0, 0), t0 + ms(900)), Gesture::None);
        assert_eq!(feed(&mut d, up(2, 500, 0), t0 + ms(900)), Gesture::None);
        assert!(!d.poll(t0 + ms(1600), HOLD));
    }

    #[test]
    fn two_finger_scroll_does_not_start() {
        let mut d = HoldDetector::new();
        let t0 = Instant::now();
        land_two(&mut d, t0);
        assert_eq!(feed(&mut d, down(1, 0, 5000), t0 + ms(400)), Gesture::None);
        assert_eq!(feed(&mut d, down(1, 0, 5000), t0 + ms(1700)), Gesture::None);
        assert!(!d.poll(t0 + ms(1800), HOLD));
    }

    #[test]
    fn one_finger_resting_does_not_start() {
        let mut d = HoldDetector::new();
        let t0 = Instant::now();
        assert_eq!(feed(&mut d, down(1, 0, 0), t0), Gesture::None);
        assert_eq!(feed(&mut d, down(1, 0, 0), t0 + ms(2000)), Gesture::None);
        assert!(!d.poll(t0 + ms(2100), HOLD));
    }

    #[test]
    fn three_fingers_do_not_start() {
        let mut d = HoldDetector::new();
        let t0 = Instant::now();
        for id in 1..=3 {
            feed(&mut d, down(id, 0, 0), t0);
        }
        assert_eq!(feed(&mut d, down(1, 0, 0), t0 + ms(1700)), Gesture::None);
        assert!(!d.poll(t0 + ms(1800), HOLD));
    }

    #[test]
    fn a_fresh_touch_can_start_again() {
        let mut d = HoldDetector::new();
        let t0 = Instant::now();
        land_two(&mut d, t0);
        assert!(d.poll(t0 + ms(1600), HOLD));
        feed(&mut d, up(1, 0, 0), t0 + ms(1700));
        feed(&mut d, up(2, 500, 0), t0 + ms(1700));
        land_two(&mut d, t0 + ms(2000));
        assert!(d.poll(t0 + ms(3600), HOLD));
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{hold_for, Gesture, HoldDetector, Sample};
    use crate::managers::audio::AudioRecordingManager;
    use log::{debug, error, info};
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex, OnceLock};
    use std::time::{Duration, Instant};
    use tauri::{AppHandle, Manager};
    use windows::core::w;
    use windows::Win32::Devices::HumanInterfaceDevice::{
        HidP_GetCaps, HidP_GetUsageValue, HidP_GetUsages, HidP_GetValueCaps, HidP_Input, HIDP_CAPS,
        HIDP_VALUE_CAPS, PHIDP_PREPARSED_DATA,
    };
    use windows::Win32::Foundation::{HANDLE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::Input::{
        GetRawInputData, GetRawInputDeviceInfoW, RegisterRawInputDevices, HRAWINPUT, RAWINPUT,
        RAWINPUTDEVICE, RAWINPUTHEADER, RIDEV_INPUTSINK, RID_INPUT, RIDI_PREPARSEDDATA, RIM_TYPEHID,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW,
        TranslateMessage, HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WM_INPUT, WNDCLASSW,
    };

    // HID usages for Windows Precision Touchpads.
    const PAGE_DIGITIZER: u16 = 0x0D;
    const PAGE_GENERIC_DESKTOP: u16 = 0x01;
    const USAGE_TOUCHPAD: u16 = 0x05;
    const USAGE_TIP_SWITCH: u16 = 0x42;
    const USAGE_CONTACT_ID: u16 = 0x51;
    const USAGE_CONTACT_COUNT: u16 = 0x54;
    const USAGE_X: u16 = 0x30;
    const USAGE_Y: u16 = 0x31;
    const HIDP_SUCCESS: i32 = 0x0011_0000;

    static ENABLED: AtomicBool = AtomicBool::new(false);
    static STARTED: OnceLock<()> = OnceLock::new();
    static APP: OnceLock<AppHandle> = OnceLock::new();
    static STATE: Mutex<Option<ListenerState>> = Mutex::new(None);

    /// Per-touchpad layout parsed once from its HID descriptor.
    struct PadInfo {
        preparsed: Vec<u8>,
        /// Link collections that carry one finger's id/x/y/tip.
        slots: Vec<u16>,
        count_link: u16,
        move_limit: i32,
    }

    struct ListenerState {
        pads: HashMap<isize, Option<PadInfo>>,
        detector: HoldDetector,
    }

    /// Turn the gesture on or off. The listener thread starts lazily the first
    /// time it is enabled and then stays registered; `ENABLED` gates delivery.
    pub fn set_enabled(app: &AppHandle, enabled: bool) {
        ENABLED.store(enabled, Ordering::SeqCst);
        if !enabled {
            return;
        }
        let _ = APP.set(app.clone());
        if STARTED.set(()).is_ok() {
            std::thread::spawn(run_message_loop);
        }
    }

    fn run_message_loop() {
        unsafe {
            let hinstance = match GetModuleHandleW(None) {
                Ok(h) => h,
                Err(e) => return error!("trackpad: GetModuleHandleW failed: {e}"),
            };
            let class_name = w!("SilktoneTrackpadSink");
            let wc = WNDCLASSW {
                lpfnWndProc: Some(wnd_proc),
                hInstance: hinstance.into(),
                lpszClassName: class_name,
                ..Default::default()
            };
            RegisterClassW(&wc);
            let hwnd = match CreateWindowExW(
                WINDOW_EX_STYLE(0),
                class_name,
                w!(""),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                Some(hinstance.into()),
                None,
            ) {
                Ok(h) => h,
                Err(e) => return error!("trackpad: CreateWindowExW failed: {e}"),
            };

            let device = RAWINPUTDEVICE {
                usUsagePage: PAGE_DIGITIZER,
                usUsage: USAGE_TOUCHPAD,
                dwFlags: RIDEV_INPUTSINK,
                hwndTarget: hwnd,
            };
            if let Err(e) = RegisterRawInputDevices(&[device], size_of::<RAWINPUTDEVICE>() as u32) {
                return error!("trackpad: RegisterRawInputDevices failed: {e}");
            }
            info!("trackpad: Precision Touchpad listener started");

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }

    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_INPUT && ENABLED.load(Ordering::Relaxed) {
            handle_raw_input(HRAWINPUT(lparam.0 as _));
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    unsafe fn handle_raw_input(handle: HRAWINPUT) {
        let header_size = size_of::<RAWINPUTHEADER>() as u32;
        let mut size = 0u32;
        if GetRawInputData(handle, RID_INPUT, None, &mut size, header_size) != 0 || size == 0 {
            return;
        }
        // u64 backing keeps the RAWINPUT cast aligned.
        let mut buf = vec![0u64; (size as usize).div_ceil(8)];
        let read = GetRawInputData(
            handle,
            RID_INPUT,
            Some(buf.as_mut_ptr().cast()),
            &mut size,
            header_size,
        );
        if read == u32::MAX {
            return;
        }
        let raw = &*(buf.as_ptr() as *const RAWINPUT);
        if raw.header.dwType != RIM_TYPEHID.0 {
            return;
        }
        let hid = &raw.data.hid;
        let report_len = hid.dwSizeHid as usize;
        if report_len == 0 {
            return;
        }
        let data = std::slice::from_raw_parts(
            hid.bRawData.as_ptr(),
            report_len * hid.dwCount as usize,
        );

        let Ok(mut guard) = STATE.lock() else { return };
        let state = guard.get_or_insert_with(|| ListenerState {
            pads: HashMap::new(),
            detector: HoldDetector::new(),
        });
        let device_key = raw.header.hDevice.0 as isize;
        let pad = state
            .pads
            .entry(device_key)
            .or_insert_with(|| load_pad_info(raw.header.hDevice));
        let Some(pad) = pad.as_ref() else { return };

        let hold = hold_for();
        let hold_before = state.detector.hold_started();
        let mut started = false;
        let mut released = false;
        for report in data.chunks_exact(report_len) {
            for sample in parse_report(pad, report) {
                match state
                    .detector
                    .on_sample(sample, Instant::now(), pad.move_limit, hold)
                {
                    Gesture::Started => started = true,
                    Gesture::Released => released = true,
                    Gesture::None => {}
                }
            }
        }
        let hold_after = state.detector.hold_started();
        drop(guard);

        // A pad may stop reporting while fingers rest still, so a new hold
        // also gets a timer that checks it once the hold time has passed.
        if hold_after.is_some() && hold_after != hold_before {
            std::thread::spawn(move || {
                std::thread::sleep(hold + Duration::from_millis(30));
                if !ENABLED.load(Ordering::Relaxed) {
                    return;
                }
                let due = match STATE.lock() {
                    Ok(mut guard) => guard
                        .as_mut()
                        .is_some_and(|state| state.detector.poll(Instant::now(), hold)),
                    Err(_) => false,
                };
                if due {
                    start_dictation();
                }
            });
        }

        if started {
            start_dictation();
        }
        if released {
            stop_dictation();
        }
    }

    fn is_recording(app: &AppHandle) -> bool {
        app.try_state::<Arc<AudioRecordingManager>>()
            .is_some_and(|manager| manager.is_recording())
    }

    /// The coordinator only offers a toggle, so each side checks the current
    /// state first: a hold never stops a recording, and a lift never starts one
    /// (for example after the silence auto-stop already ended it).
    fn start_dictation() {
        if let Some(app) = APP.get() {
            if !is_recording(app) {
                debug!("trackpad: two-finger hold, starting");
                crate::signal_handle::send_transcription_input(app, "transcribe", "trackpad hold");
            }
        }
    }

    fn stop_dictation() {
        if let Some(app) = APP.get() {
            if is_recording(app) {
                debug!("trackpad: fingers lifted, stopping");
                crate::signal_handle::send_transcription_input(
                    app,
                    "transcribe",
                    "trackpad release",
                );
            }
        }
    }

    unsafe fn load_pad_info(device: HANDLE) -> Option<PadInfo> {
        let mut size = 0u32;
        GetRawInputDeviceInfoW(Some(device), RIDI_PREPARSEDDATA, None, &mut size);
        if size == 0 {
            return None;
        }
        let mut preparsed = vec![0u8; size as usize];
        let got = GetRawInputDeviceInfoW(
            Some(device),
            RIDI_PREPARSEDDATA,
            Some(preparsed.as_mut_ptr().cast()),
            &mut size,
        );
        if got == u32::MAX {
            return None;
        }
        let ppd = PHIDP_PREPARSED_DATA(preparsed.as_ptr() as isize);

        let mut caps = HIDP_CAPS::default();
        if HidP_GetCaps(ppd, &mut caps).0 != HIDP_SUCCESS {
            return None;
        }
        let mut n = caps.NumberInputValueCaps;
        let mut value_caps = vec![HIDP_VALUE_CAPS::default(); n as usize];
        if HidP_GetValueCaps(HidP_Input, value_caps.as_mut_ptr(), &mut n, ppd).0 != HIDP_SUCCESS {
            return None;
        }
        value_caps.truncate(n as usize);

        let mut slots = Vec::new();
        let mut count_link = 0u16;
        let mut x_range = 0i32;
        for cap in &value_caps {
            if cap.IsRange {
                continue;
            }
            let usage = cap.Anonymous.NotRange.Usage;
            match (cap.UsagePage, usage) {
                (PAGE_DIGITIZER, USAGE_CONTACT_ID) => slots.push(cap.LinkCollection),
                (PAGE_DIGITIZER, USAGE_CONTACT_COUNT) => count_link = cap.LinkCollection,
                (PAGE_GENERIC_DESKTOP, USAGE_X) => {
                    x_range = x_range.max(cap.LogicalMax - cap.LogicalMin)
                }
                _ => {}
            }
        }
        if slots.is_empty() {
            return None;
        }
        slots.sort_unstable();
        slots.dedup();
        debug!(
            "trackpad: touchpad with {} contact slot(s), x range {}",
            slots.len(),
            x_range
        );
        Some(PadInfo {
            preparsed,
            slots,
            count_link,
            // A resting finger may drift ~4% of the pad width.
            move_limit: (x_range / 25).max(1),
        })
    }

    fn get_value(
        ppd: PHIDP_PREPARSED_DATA,
        report: &mut [u8],
        page: u16,
        link: u16,
        usage: u16,
    ) -> Option<u32> {
        let mut v = 0u32;
        let status =
            unsafe { HidP_GetUsageValue(HidP_Input, page, Some(link), usage, &mut v, ppd, report) };
        (status.0 == HIDP_SUCCESS).then_some(v)
    }

    fn parse_report(pad: &PadInfo, report: &[u8]) -> Vec<Sample> {
        let ppd = PHIDP_PREPARSED_DATA(pad.preparsed.as_ptr() as isize);
        let mut report = report.to_vec();

        // Hybrid pads send one finger per report (count only on the first of
        // a frame); parallel pads send `count` fingers in the first slots.
        let live_slots = if pad.slots.len() == 1 {
            1
        } else {
            get_value(ppd, &mut report, PAGE_DIGITIZER, pad.count_link, USAGE_CONTACT_COUNT).unwrap_or(0) as usize
        };

        let mut out = Vec::new();
        for &link in pad.slots.iter().take(live_slots) {
            let Some(id) = get_value(ppd, &mut report, PAGE_DIGITIZER, link, USAGE_CONTACT_ID) else {
                continue;
            };
            let x = get_value(ppd, &mut report, PAGE_GENERIC_DESKTOP, link, USAGE_X).unwrap_or(0) as i32;
            let y = get_value(ppd, &mut report, PAGE_GENERIC_DESKTOP, link, USAGE_Y).unwrap_or(0) as i32;

            let mut usages = [0u16; 16];
            let mut len = usages.len() as u32;
            let status = unsafe {
                HidP_GetUsages(
                    HidP_Input,
                    PAGE_DIGITIZER,
                    Some(link),
                    usages.as_mut_ptr(),
                    &mut len,
                    ppd,
                    &mut report,
                )
            };
            let tip = status.0 == HIDP_SUCCESS
                && usages[..len as usize].contains(&USAGE_TIP_SWITCH);
            out.push(Sample { id, x, y, tip });
        }
        out
    }
}

/// Apply the saved setting (call at startup and whenever it changes).
#[cfg(target_os = "windows")]
pub fn apply(app: &tauri::AppHandle, enabled: bool) {
    platform::set_enabled(app, enabled);
}

#[cfg(not(target_os = "windows"))]
pub fn apply(_app: &tauri::AppHandle, _enabled: bool) {}

//! Two-finger double-tap on the touchpad toggles transcription.
//!
//! Windows Precision Touchpads expose raw finger contacts over HID. We read
//! them through Raw Input (no mouse hook), so ordinary clicks and mouse
//! double-clicks never trigger this. Other platforms have no listener; the
//! setting is stored but inert there.
//!
//! [`TapDetector`] is the pure gesture logic (finger-down/up samples in,
//! "double tap" out) so it can be unit tested without hardware.

use std::collections::HashMap;
use std::time::{Duration, Instant};

/// A two-finger touch shorter than this counts as a tap, not a scroll/hold.
const TAP_MAX: Duration = Duration::from_millis(220);
/// Max gap between the end of the first tap and the end of the second.
const DOUBLE_TAP_MAX: Duration = Duration::from_millis(450);
/// No reports for this long means we missed a lift; drop all state.
const STALE_AFTER: Duration = Duration::from_millis(600);

/// One finger's state from a touchpad report.
#[derive(Debug, Clone, Copy)]
pub struct Sample {
    pub id: u32,
    pub x: i32,
    pub y: i32,
    /// Finger is touching the surface.
    pub tip: bool,
}

struct Contact {
    start: (i32, i32),
}

struct Session {
    started: Instant,
    two_finger: bool,
    valid: bool,
}

#[derive(Default)]
pub struct TapDetector {
    contacts: HashMap<u32, Contact>,
    session: Option<Session>,
    last_tap: Option<Instant>,
    last_event: Option<Instant>,
}

impl TapDetector {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feed one finger sample. `move_limit` is how far (in touchpad units) a
    /// finger may drift and still count as a tap. Returns true when this
    /// sample completes a two-finger double-tap.
    pub fn on_sample(&mut self, s: Sample, now: Instant, move_limit: i32) -> bool {
        if self
            .last_event
            .is_some_and(|t| now.duration_since(t) > STALE_AFTER)
        {
            self.contacts.clear();
            self.session = None;
            self.last_tap = None;
        }
        self.last_event = Some(now);

        if s.tip {
            let contact = self.contacts.entry(s.id).or_insert(Contact {
                start: (s.x, s.y),
            });
            let moved = (s.x - contact.start.0).abs() > move_limit
                || (s.y - contact.start.1).abs() > move_limit;

            let count = self.contacts.len();
            let session = self.session.get_or_insert(Session {
                started: now,
                two_finger: false,
                valid: true,
            });
            if count >= 2 {
                session.two_finger = true;
            }
            if count >= 3 || moved {
                session.valid = false;
            }
            return false;
        }

        if self.contacts.remove(&s.id).is_none() || !self.contacts.is_empty() {
            return false;
        }

        // Last finger lifted: evaluate the touch session.
        let Some(session) = self.session.take() else {
            return false;
        };
        let is_tap =
            session.valid && session.two_finger && now.duration_since(session.started) <= TAP_MAX;
        if !is_tap {
            // Any other touch activity breaks a pending double-tap.
            self.last_tap = None;
            return false;
        }
        match self.last_tap.take() {
            Some(prev) if now.duration_since(prev) <= DOUBLE_TAP_MAX => true,
            _ => {
                self.last_tap = Some(now);
                false
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIMIT: i32 = 100;

    fn down(id: u32, x: i32, y: i32) -> Sample {
        Sample { id, x, y, tip: true }
    }
    fn up(id: u32, x: i32, y: i32) -> Sample {
        Sample { id, x, y, tip: false }
    }

    /// Two fingers down at `t`, both up `dur_ms` later. Returns whether the
    /// final lift completed a double-tap.
    fn two_finger_touch(d: &mut TapDetector, t: Instant, dur_ms: u64, drift: i32) -> bool {
        assert!(!d.on_sample(down(1, 0, 0), t, LIMIT));
        assert!(!d.on_sample(down(2, 500, 0), t, LIMIT));
        let end = t + Duration::from_millis(dur_ms);
        assert!(!d.on_sample(down(1, drift, 0), end, LIMIT));
        assert!(!d.on_sample(up(1, drift, 0), end, LIMIT));
        d.on_sample(up(2, 500, 0), end, LIMIT)
    }

    #[test]
    fn two_quick_two_finger_taps_fire() {
        let mut d = TapDetector::new();
        let t0 = Instant::now();
        assert!(!two_finger_touch(&mut d, t0, 80, 0));
        assert!(two_finger_touch(&mut d, t0 + Duration::from_millis(200), 80, 0));
    }

    #[test]
    fn single_tap_does_not_fire() {
        let mut d = TapDetector::new();
        assert!(!two_finger_touch(&mut d, Instant::now(), 80, 0));
    }

    #[test]
    fn slow_second_tap_does_not_fire() {
        let mut d = TapDetector::new();
        let t0 = Instant::now();
        assert!(!two_finger_touch(&mut d, t0, 80, 0));
        assert!(!two_finger_touch(&mut d, t0 + Duration::from_millis(900), 80, 0));
    }

    #[test]
    fn scroll_swipe_is_not_a_tap() {
        let mut d = TapDetector::new();
        let t0 = Instant::now();
        assert!(!two_finger_touch(&mut d, t0, 80, 5000));
        assert!(!two_finger_touch(&mut d, t0 + Duration::from_millis(200), 80, 5000));
    }

    #[test]
    fn long_press_is_not_a_tap() {
        let mut d = TapDetector::new();
        let t0 = Instant::now();
        assert!(!two_finger_touch(&mut d, t0, 500, 0));
    }

    #[test]
    fn one_finger_taps_are_ignored() {
        let mut d = TapDetector::new();
        let t0 = Instant::now();
        for i in 0..2u64 {
            let t = t0 + Duration::from_millis(i * 150);
            assert!(!d.on_sample(down(1, 0, 0), t, LIMIT));
            assert!(!d.on_sample(up(1, 0, 0), t + Duration::from_millis(50), LIMIT));
        }
    }

    #[test]
    fn three_fingers_are_not_a_tap() {
        let mut d = TapDetector::new();
        let t = Instant::now();
        for id in 1..=3 {
            d.on_sample(down(id, 0, 0), t, LIMIT);
        }
        let end = t + Duration::from_millis(60);
        d.on_sample(up(1, 0, 0), end, LIMIT);
        d.on_sample(up(2, 0, 0), end, LIMIT);
        assert!(!d.on_sample(up(3, 0, 0), end, LIMIT));
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{Sample, TapDetector};
    use log::{debug, error, info};
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Mutex, OnceLock};
    use std::time::Instant;
    use tauri::AppHandle;
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
        detector: TapDetector,
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
            detector: TapDetector::new(),
        });
        let device_key = raw.header.hDevice.0 as isize;
        let pad = state
            .pads
            .entry(device_key)
            .or_insert_with(|| load_pad_info(raw.header.hDevice));
        let Some(pad) = pad.as_ref() else { return };

        let mut fired = false;
        for report in data.chunks_exact(report_len) {
            for sample in parse_report(pad, report) {
                fired |= state
                    .detector
                    .on_sample(sample, Instant::now(), pad.move_limit);
            }
        }
        drop(guard);

        if fired {
            if let Some(app) = APP.get() {
                debug!("trackpad: two-finger double-tap");
                crate::signal_handle::send_transcription_input(
                    app,
                    "transcribe",
                    "trackpad double-tap",
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
            // A finger may drift ~4% of the pad width and still be a tap.
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

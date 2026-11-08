use crate::audio_feedback;
use crate::audio_toolkit::audio::{list_input_devices, list_output_devices, AudioRecorder};
use crate::managers::audio::{AudioRecordingManager, MicrophoneMode};
use crate::settings::{get_settings, write_settings};
use log::warn;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use winreg::{
    enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
    RegKey, HKEY,
};

#[derive(Serialize, Type)]
pub struct CustomSounds {
    start: bool,
    stop: bool,
}

fn custom_sound_exists(app: &AppHandle, sound_type: &str) -> bool {
    crate::portable::resolve_app_data(app, &format!("custom_{}.wav", sound_type))
        .is_ok_and(|path| path.exists())
}

#[tauri::command]
#[specta::specta]
pub fn check_custom_sounds(app: AppHandle) -> CustomSounds {
    CustomSounds {
        start: custom_sound_exists(&app, "start"),
        stop: custom_sound_exists(&app, "stop"),
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct AudioDevice {
    pub index: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum PermissionAccess {
    Allowed,
    Denied,
    Unknown,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct WindowsMicrophonePermissionStatus {
    pub supported: bool,
    pub overall_access: PermissionAccess,
    pub device_access: PermissionAccess,
    pub app_access: PermissionAccess,
    pub desktop_app_access: PermissionAccess,
}

#[cfg(target_os = "windows")]
fn read_registry_permission_access(root_hkey: HKEY, path: &str) -> PermissionAccess {
    let root = RegKey::predef(root_hkey);
    let Ok(key) = root.open_subkey(path) else {
        return PermissionAccess::Unknown;
    };

    let Ok(value) = key.get_value::<String, _>("Value") else {
        return PermissionAccess::Unknown;
    };

    match value.to_ascii_lowercase().as_str() {
        "allow" => PermissionAccess::Allowed,
        "deny" => PermissionAccess::Denied,
        _ => PermissionAccess::Unknown,
    }
}

#[cfg(target_os = "windows")]
fn get_windows_microphone_permission_status_impl() -> WindowsMicrophonePermissionStatus {
    const MICROPHONE_PATH: &str =
        "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone";
    const DESKTOP_APPS_PATH: &str =
        "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged";

    let device_access = read_registry_permission_access(HKEY_LOCAL_MACHINE, MICROPHONE_PATH);
    let app_access = read_registry_permission_access(HKEY_CURRENT_USER, MICROPHONE_PATH);
    let desktop_app_access = read_registry_permission_access(HKEY_CURRENT_USER, DESKTOP_APPS_PATH);

    // Silktone is a desktop app, so the NonPackaged key (desktop_app_access) is
    // the relevant permission scope. The UWP master key (app_access) can be
    // "deny" on systems with debloaters (e.g. O&O ShutUp10) without actually
    // blocking desktop app microphone access.
    let overall_access = if device_access == PermissionAccess::Denied {
        PermissionAccess::Denied
    } else if desktop_app_access == PermissionAccess::Denied {
        PermissionAccess::Denied
    } else if desktop_app_access == PermissionAccess::Allowed {
        PermissionAccess::Allowed
    } else if app_access == PermissionAccess::Denied {
        PermissionAccess::Denied
    } else if device_access == PermissionAccess::Allowed && app_access == PermissionAccess::Allowed
    {
        PermissionAccess::Allowed
    } else {
        PermissionAccess::Unknown
    };

    WindowsMicrophonePermissionStatus {
        supported: true,
        overall_access,
        device_access,
        app_access,
        desktop_app_access,
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_windows_microphone_permission_status() -> WindowsMicrophonePermissionStatus {
    #[cfg(target_os = "windows")]
    {
        get_windows_microphone_permission_status_impl()
    }

    #[cfg(not(target_os = "windows"))]
    {
        WindowsMicrophonePermissionStatus {
            supported: false,
            overall_access: PermissionAccess::Unknown,
            device_access: PermissionAccess::Unknown,
            app_access: PermissionAccess::Unknown,
            desktop_app_access: PermissionAccess::Unknown,
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn open_microphone_privacy_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:privacy-microphone"])
            .spawn()
            .map_err(|e| format!("Failed to open Windows microphone privacy settings: {}", e))?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Opening microphone privacy settings is only supported on Windows".to_string())
    }
}

#[tauri::command]
#[specta::specta]
pub async fn update_microphone_mode(app: AppHandle, always_on: bool) -> Result<(), String> {
    // Update settings (fast, stays inline)
    let mut settings = get_settings(&app);
    settings.always_on_microphone = always_on;
    write_settings(&app, settings);

    // Update the audio manager mode. update_mode can stop/start the cpal stream
    // (blocking CoreAudio) and takes the manager std mutexes — run it on a
    // blocking thread, NOT inline on the webview/main run loop (a slow device
    // open/close would freeze the UI).
    let rm = app.state::<Arc<AudioRecordingManager>>().inner().clone();
    let new_mode = if always_on {
        MicrophoneMode::AlwaysOn
    } else {
        MicrophoneMode::OnDemand
    };

    tokio::task::spawn_blocking(move || rm.update_mode(new_mode))
        .await
        .map_err(|e| format!("audio task join failed: {}", e))?
        .map_err(|e| format!("Failed to update microphone mode: {}", e))
}

#[tauri::command]
#[specta::specta]
pub fn get_microphone_mode(app: AppHandle) -> Result<bool, String> {
    let settings = get_settings(&app);
    Ok(settings.always_on_microphone)
}

#[tauri::command]
#[specta::specta]
pub async fn get_available_microphones() -> Result<Vec<AudioDevice>, String> {
    // cpal device enumeration can stall — run it off the webview/main run loop.
    tokio::task::spawn_blocking(|| {
        let devices =
            list_input_devices().map_err(|e| format!("Failed to list audio devices: {}", e))?;

        let mut result = vec![AudioDevice {
            index: "default".to_string(),
            name: "Default".to_string(),
            is_default: true,
        }];

        result.extend(devices.into_iter().map(|d| AudioDevice {
            index: d.index,
            name: d.name,
            is_default: false, // The explicit default is handled separately
        }));

        Ok::<_, String>(result)
    })
    .await
    .map_err(|e| format!("audio task join failed: {}", e))?
}

#[tauri::command]
#[specta::specta]
pub async fn set_selected_microphone(app: AppHandle, device_name: String) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.selected_microphone = if device_name == "default" {
        None
    } else {
        Some(device_name)
    };
    write_settings(&app, settings);

    // Update the audio manager to use the new device. update_selected_device
    // can restart the cpal stream (blocking CoreAudio) — run it on a blocking
    // thread, not inline on the webview/main run loop.
    let rm = app.state::<Arc<AudioRecordingManager>>().inner().clone();
    tokio::task::spawn_blocking(move || rm.update_selected_device())
        .await
        .map_err(|e| format!("audio task join failed: {}", e))?
        .map_err(|e| format!("Failed to update selected device: {}", e))
}

#[tauri::command]
#[specta::specta]
pub fn get_selected_microphone(app: AppHandle) -> Result<String, String> {
    let settings = get_settings(&app);
    Ok(settings
        .selected_microphone
        .unwrap_or_else(|| "default".to_string()))
}

#[tauri::command]
#[specta::specta]
pub async fn get_available_output_devices() -> Result<Vec<AudioDevice>, String> {
    // cpal device enumeration can stall — run it off the webview/main run loop.
    tokio::task::spawn_blocking(|| {
        let devices =
            list_output_devices().map_err(|e| format!("Failed to list output devices: {}", e))?;

        let mut result = vec![AudioDevice {
            index: "default".to_string(),
            name: "Default".to_string(),
            is_default: true,
        }];

        result.extend(devices.into_iter().map(|d| AudioDevice {
            index: d.index,
            name: d.name,
            is_default: false, // The explicit default is handled separately
        }));

        Ok::<_, String>(result)
    })
    .await
    .map_err(|e| format!("audio task join failed: {}", e))?
}

#[tauri::command]
#[specta::specta]
pub fn set_selected_output_device(app: AppHandle, device_name: String) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.selected_output_device = if device_name == "default" {
        None
    } else {
        Some(device_name)
    };
    write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_selected_output_device(app: AppHandle) -> Result<String, String> {
    let settings = get_settings(&app);
    Ok(settings
        .selected_output_device
        .unwrap_or_else(|| "default".to_string()))
}

#[tauri::command]
#[specta::specta]
pub async fn play_test_sound(app: AppHandle, sound_type: String) {
    let sound = match sound_type.as_str() {
        "start" => audio_feedback::SoundType::Start,
        "stop" => audio_feedback::SoundType::Stop,
        _ => {
            warn!("Unknown sound type: {}", sound_type);
            return;
        }
    };
    audio_feedback::play_test_sound(&app, sound);
}

#[tauri::command]
#[specta::specta]
pub fn set_clamshell_microphone(app: AppHandle, device_name: String) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.clamshell_microphone = if device_name == "default" {
        None
    } else {
        Some(device_name)
    };
    write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_clamshell_microphone(app: AppHandle) -> Result<String, String> {
    let settings = get_settings(&app);
    Ok(settings
        .clamshell_microphone
        .unwrap_or_else(|| "default".to_string()))
}

#[tauri::command]
#[specta::specta]
pub fn is_recording(app: AppHandle) -> bool {
    let audio_manager = app.state::<Arc<AudioRecordingManager>>();
    audio_manager.is_recording()
}

#[tauri::command]
#[specta::specta]
pub async fn get_microphone_channels(device_name: String) -> Result<u16, String> {
    // cpal device enumeration and config queries can stall, so keep them off
    // the webview/main run loop.
    tokio::task::spawn_blocking(move || {
        use cpal::traits::HostTrait;

        let device = if device_name.eq_ignore_ascii_case("default") {
            crate::audio_toolkit::get_cpal_host().default_input_device()
        } else {
            list_input_devices()
                .map_err(|e| format!("Failed to list audio devices: {e}"))?
                .into_iter()
                .find(|device| device.name == device_name)
                .map(|device| device.device)
        };

        match device {
            Some(device) => AudioRecorder::preferred_input_channel_count(&device)
                .map_err(|e| format!("Failed to get microphone config: {e}")),
            None => Ok(1),
        }
    })
    .await
    .map_err(|e| format!("audio task join failed: {e}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn set_selected_channel(app: AppHandle, channel: Option<u16>) -> Result<(), String> {
    // Restarting cpal can block, so keep it off the webview/main run loop. Apply
    // the runtime change before persisting it so a rejected active-recording
    // change does not become effective on the next launch.
    let manager = app.state::<Arc<AudioRecordingManager>>().inner().clone();
    tokio::task::spawn_blocking(move || manager.update_selected_channel(channel))
        .await
        .map_err(|e| format!("audio task join failed: {e}"))?
        .map_err(|e| format!("Failed to update channel selection: {e}"))?;

    let mut settings = get_settings(&app);
    settings.selected_channel = channel;
    write_settings(&app, settings);
    Ok(())
}

/// What the microphone check concluded, in the order the setup screen checks.
#[derive(Serialize, Type, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MicCheckVerdict {
    /// Clear voice well above the background.
    Good,
    /// Nothing at all came through: muted, wrong or blocked microphone.
    Silent,
    /// Sound came through but no voice stood out from it.
    NoSpeech,
    /// Loud background noise close to the voice level.
    Noisy,
    /// The voice is faint even at the strongest boost.
    Quiet,
}

#[derive(Serialize, Type, Debug, Clone, Copy, PartialEq)]
pub struct MicCheckResult {
    pub verdict: MicCheckVerdict,
    /// The boost that brings this voice to a comfortable level (percent).
    pub suggested_gain_percent: u32,
    /// Raw voice and background levels, 0.0–1.0, for the meter.
    pub speech_level: f32,
    pub noise_floor: f32,
}

/// Voice level (RMS, full scale) the boost aims for: about -20 dBFS, loud
/// enough for the speech model, with headroom so peaks are not clipped.
const MIC_TARGET_SPEECH_LEVEL: f32 = 0.1;
/// Below this nothing usable came through (about -48 dBFS).
const MIC_SILENT_LEVEL: f32 = 0.004;
/// Background above this (about -34 dBFS) is a noisy room.
const MIC_NOISY_FLOOR: f32 = 0.02;

/// Turn measured levels into a verdict and a boost. Pure, so it is unit tested.
pub fn assess_microphone(stats: crate::audio_toolkit::audio::LevelStats) -> MicCheckResult {
    let speech = stats.speech_level;
    let noise = stats.noise_floor;
    let suggested = if speech > 0.0 {
        let percent = (MIC_TARGET_SPEECH_LEVEL / speech * 100.0).round() as u32;
        // Round to tens so the slider shows a tidy number.
        crate::audio_toolkit::audio::clamp_mic_gain_percent((percent + 5) / 10 * 10)
    } else {
        crate::audio_toolkit::audio::DEFAULT_MIC_GAIN_PERCENT
    };
    let boosted = speech * suggested as f32 / 100.0;
    let verdict = if stats.windows == 0 || speech < MIC_SILENT_LEVEL {
        MicCheckVerdict::Silent
    } else if noise >= MIC_NOISY_FLOOR && speech < noise * 4.0 {
        MicCheckVerdict::Noisy
    } else if speech < noise * 2.5 {
        MicCheckVerdict::NoSpeech
    } else if boosted < MIC_TARGET_SPEECH_LEVEL * 0.5 {
        MicCheckVerdict::Quiet
    } else {
        MicCheckVerdict::Good
    };
    MicCheckResult {
        verdict,
        suggested_gain_percent: suggested,
        speech_level: speech,
        noise_floor: noise,
    }
}

/// Listen for `duration_ms` while the user reads a sentence aloud and judge the
/// microphone. Opens the microphone for the check when it is not already open
/// and closes it again afterwards. Nothing is recorded or saved.
#[tauri::command]
#[specta::specta]
pub async fn check_microphone(app: AppHandle, duration_ms: u32) -> Result<MicCheckResult, String> {
    let rm = app.state::<Arc<AudioRecordingManager>>().inner().clone();
    if rm.is_recording() {
        return Err("Microphone is busy recording".to_string());
    }
    let duration = std::time::Duration::from_millis(u64::from(duration_ms.clamp(1000, 10_000)));

    let opener = Arc::clone(&rm);
    let opened_here = tokio::task::spawn_blocking(move || {
        let was_open = opener.is_stream_open();
        opener.start_microphone_stream().map(|_| !was_open)
    })
    .await
    .map_err(|e| format!("audio task join failed: {}", e))?
    .map_err(|e| format!("Failed to open microphone: {}", e))?;

    crate::audio_toolkit::audio::start_level_probe();
    tokio::time::sleep(duration).await;
    let stats = crate::audio_toolkit::audio::finish_level_probe();

    if opened_here && !rm.is_recording() {
        tokio::task::spawn_blocking(move || rm.stop_microphone_stream())
            .await
            .map_err(|e| format!("audio task join failed: {}", e))?;
    }

    let result = assess_microphone(stats);
    log::info!("Microphone check: {:?}", result);
    Ok(result)
}

#[cfg(test)]
mod mic_check_tests {
    use super::*;
    use crate::audio_toolkit::audio::LevelStats;

    fn stats(noise_floor: f32, speech_level: f32) -> LevelStats {
        LevelStats {
            noise_floor,
            speech_level,
            peak: speech_level * 3.0,
            windows: 200,
        }
    }

    #[test]
    fn clear_voice_is_good_and_boosted_to_target() {
        let result = assess_microphone(stats(0.002, 0.05));
        assert_eq!(result.verdict, MicCheckVerdict::Good);
        assert_eq!(result.suggested_gain_percent, 200);
    }

    #[test]
    fn loud_voice_is_turned_down() {
        let result = assess_microphone(stats(0.001, 0.25));
        assert_eq!(result.verdict, MicCheckVerdict::Good);
        assert_eq!(result.suggested_gain_percent, 50);
    }

    #[test]
    fn nothing_heard_is_silent() {
        assert_eq!(
            assess_microphone(stats(0.0, 0.001)).verdict,
            MicCheckVerdict::Silent
        );
        let empty = LevelStats {
            noise_floor: 0.0,
            speech_level: 0.0,
            peak: 0.0,
            windows: 0,
        };
        let result = assess_microphone(empty);
        assert_eq!(result.verdict, MicCheckVerdict::Silent);
        assert_eq!(
            result.suggested_gain_percent,
            crate::audio_toolkit::audio::DEFAULT_MIC_GAIN_PERCENT
        );
    }

    #[test]
    fn loud_background_is_noisy() {
        assert_eq!(
            assess_microphone(stats(0.03, 0.06)).verdict,
            MicCheckVerdict::Noisy
        );
    }

    #[test]
    fn steady_hum_without_voice_is_no_speech() {
        assert_eq!(
            assess_microphone(stats(0.006, 0.008)).verdict,
            MicCheckVerdict::NoSpeech
        );
    }

    #[test]
    fn faint_voice_even_at_max_boost_is_quiet() {
        let result = assess_microphone(stats(0.0005, 0.01));
        assert_eq!(result.verdict, MicCheckVerdict::Quiet);
        assert_eq!(result.suggested_gain_percent, 400);
    }
}

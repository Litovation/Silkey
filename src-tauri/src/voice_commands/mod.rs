//! Voice Commands (beta): hold the command shortcut, say what you want
//! ("open Chrome", "search for flights to Goa", "pause the music"), and
//! Silktone does it.
//!
//! Speech is transcribed by the normal pipeline (see `actions.rs`); this module
//! classifies the text with the Laya decision model and runs one of a fixed set
//! of harmless actions (`intents.rs`). The Laya model is downloaded on demand
//! from the release published by `.github/workflows/laya-onnx.yml`.

pub mod intents;
pub mod laya;

use std::collections::VecDeque;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use specta::Type;
use tauri::{AppHandle, Emitter, Manager};

use crate::settings;
use intents::{Action, Decision, KeyAction};
use laya::{Laya, LayaConfig, CONFIG_FILE, TOKENIZER_FILE};

/// Where the converted model is published. Change this when moving the project
/// to another GitHub account (see REPLICATE.md).
pub const MODEL_RELEASE_URL: &str =
    "https://github.com/Litovation/Silkey/releases/download/laya-onnx-v1";

/// Shortcut binding id for voice commands.
pub const BINDING_ID: &str = "voice_command";

const RECENT_LIMIT: usize = 20;

#[derive(Debug, Clone, Serialize, Type)]
pub struct VoiceCommandLogEntry {
    pub timestamp: i64,
    pub heard: String,
    pub result: String,
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct VoiceCommandStatus {
    pub enabled: bool,
    pub model_downloaded: bool,
    pub downloading: bool,
}

#[derive(Debug, Clone, Serialize)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
}

#[derive(Default)]
pub struct VoiceCommands {
    engine: Mutex<Option<Laya>>,
    downloading: AtomicBool,
    recent: Mutex<VecDeque<VoiceCommandLogEntry>>,
}

fn model_dir(app: &AppHandle) -> Result<PathBuf> {
    Ok(crate::portable::app_data_dir(app)
        .map_err(|e| anyhow!("app data dir: {e}"))?
        .join("models")
        .join("laya"))
}

fn installed_config(app: &AppHandle) -> Option<LayaConfig> {
    let dir = model_dir(app).ok()?;
    let cfg: LayaConfig = serde_json::from_slice(&std::fs::read(dir.join(CONFIG_FILE)).ok()?).ok()?;
    let complete = [cfg.recommended_model.as_str(), TOKENIZER_FILE]
        .iter()
        .all(|f| dir.join(f).is_file());
    complete.then_some(cfg)
}

fn sha256_file(path: &std::path::Path) -> Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)?;
    Ok(format!("{:x}", hasher.finalize()))
}

async fn download_model(app: &AppHandle) -> Result<()> {
    let dir = model_dir(app)?;
    std::fs::create_dir_all(&dir)?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .build()?;

    let cfg_bytes = client
        .get(format!("{MODEL_RELEASE_URL}/{CONFIG_FILE}"))
        .send()
        .await?
        .error_for_status()
        .context("the voice command model is not published yet")?
        .bytes()
        .await?;
    let cfg: LayaConfig = serde_json::from_slice(&cfg_bytes).context("parsing model manifest")?;

    let wanted = [cfg.recommended_model.clone(), TOKENIZER_FILE.to_string()];
    let mut infos = Vec::new();
    for name in &wanted {
        let info = cfg
            .files
            .get(name)
            .ok_or_else(|| anyhow!("manifest is missing {name}"))?;
        infos.push((name.clone(), info.clone()));
    }
    let total: u64 = infos.iter().map(|(_, i)| i.size_bytes).sum();
    let mut done: u64 = 0;
    let emit = |downloaded: u64| {
        let _ = app.emit(
            "voice-command-download-progress",
            DownloadProgress { downloaded, total },
        );
    };

    for (name, info) in infos {
        let dest = dir.join(&name);
        if dest.is_file() && sha256_file(&dest).map(|h| h == info.sha256).unwrap_or(false) {
            done += info.size_bytes;
            emit(done);
            continue;
        }
        let partial = dir.join(format!("{name}.partial"));
        let response = client
            .get(format!("{MODEL_RELEASE_URL}/{name}"))
            .send()
            .await?
            .error_for_status()?;
        let mut file = std::fs::File::create(&partial)?;
        let mut hasher = Sha256::new();
        let mut stream = response.bytes_stream();
        let mut written: u64 = 0;
        let mut last_emit = Instant::now();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            written += chunk.len() as u64;
            if written > info.size_bytes {
                drop(file);
                let _ = std::fs::remove_file(&partial);
                return Err(anyhow!("{name}: server sent more data than expected"));
            }
            hasher.update(&chunk);
            file.write_all(&chunk)?;
            if last_emit.elapsed() >= Duration::from_millis(150) {
                emit(done + written);
                last_emit = Instant::now();
            }
        }
        file.flush()?;
        drop(file);
        let hash = format!("{:x}", hasher.finalize());
        if hash != info.sha256 {
            let _ = std::fs::remove_file(&partial);
            return Err(anyhow!("{name}: download was corrupted, please try again"));
        }
        std::fs::rename(&partial, &dest)?;
        done += info.size_bytes;
        emit(done);
    }

    // Written last: its presence marks the download as complete.
    std::fs::write(dir.join(CONFIG_FILE), &cfg_bytes)?;
    Ok(())
}

impl VoiceCommands {
    fn log(&self, heard: &str, result: &str, ok: bool) {
        let mut recent = self.recent.lock().unwrap_or_else(|e| e.into_inner());
        recent.push_front(VoiceCommandLogEntry {
            timestamp: chrono::Utc::now().timestamp(),
            heard: heard.to_string(),
            result: result.to_string(),
            ok,
        });
        recent.truncate(RECENT_LIMIT);
    }

    fn decide(&self, app: &AppHandle, heard: &str) -> Result<Decision> {
        let mut engine = self.engine.lock().unwrap_or_else(|e| e.into_inner());
        if engine.is_none() {
            let started = Instant::now();
            *engine = Some(Laya::load(&model_dir(app)?)?);
            log::info!("Laya loaded in {:?}", started.elapsed());
        }
        let laya = engine.as_mut().expect("engine loaded above");
        let started = Instant::now();
        let decision = intents::decide(laya, heard);
        log::debug!("voice command decided in {:?}: {:?}", started.elapsed(), decision);
        decision
    }

    fn unload(&self) {
        *self.engine.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}

/// Handle a transcribed command. Runs on a blocking thread; the overlay shows
/// the result.
pub fn run(app: &AppHandle, heard: String) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<VoiceCommands>();
        if installed_config(&app).is_none() {
            let msg = "Download the command model in Commands first";
            state.log(&heard, msg, false);
            crate::overlay::show_command_feedback(&app, msg);
            return;
        }
        let (label, ok) = match state.decide(&app, &heard) {
            Ok(Decision::Run { action, label }) => match execute(&app, &action) {
                Ok(()) => (label, true),
                Err(e) => {
                    log::error!("voice command '{label}' failed: {e:#}");
                    (format!("Couldn't do that: {label}"), false)
                }
            },
            Ok(Decision::Unsupported(msg)) => (msg, false),
            Ok(Decision::NotUnderstood) => ("Didn't catch a command".to_string(), false),
            Err(e) => {
                log::error!("voice command failed: {e:#}");
                ("Voice command failed".to_string(), false)
            }
        };
        state.log(&heard, &label, ok);
        crate::overlay::show_command_feedback(&app, &label);
        let _ = app.emit("voice-command-history-updated", ());
    });
}

fn execute(app: &AppHandle, action: &Action) -> Result<()> {
    match action {
        Action::OpenUrl { url } => {
            use tauri_plugin_opener::OpenerExt;
            app.opener()
                .open_url(url.clone(), None::<String>)
                .map_err(|e| anyhow!("{e}"))
        }
        Action::LaunchApp { target } => launch(target),
        Action::LockComputer => lock_computer(),
        Action::Keys(keys) => press(app, *keys),
    }
}

#[cfg(target_os = "windows")]
fn launch(target: &str) -> Result<()> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // `target` always comes from the fixed table in intents.rs.
    std::process::Command::new("cmd")
        .args(["/C", "start", "", target])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn launch(_target: &str) -> Result<()> {
    Err(anyhow!("opening apps is Windows-only in the beta"))
}

#[cfg(target_os = "windows")]
fn lock_computer() -> Result<()> {
    std::process::Command::new("rundll32.exe")
        .args(["user32.dll,LockWorkStation"])
        .spawn()?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn lock_computer() -> Result<()> {
    Err(anyhow!("locking is Windows-only in the beta"))
}

fn press(app: &AppHandle, action: KeyAction) -> Result<()> {
    use enigo::{Direction, Keyboard};
    let (modifiers, key, repeat) = action.keys();
    let enigo_state = app
        .try_state::<crate::input::EnigoState>()
        .ok_or_else(|| anyhow!("keyboard control is unavailable"))?;
    let mut enigo = enigo_state.0.lock().unwrap_or_else(|e| e.into_inner());
    let result = (|| -> Result<()> {
        for m in modifiers {
            enigo.key(*m, Direction::Press).map_err(|e| anyhow!("{e:?}"))?;
        }
        for _ in 0..repeat {
            enigo.key(key, Direction::Click).map_err(|e| anyhow!("{e:?}"))?;
            std::thread::sleep(Duration::from_millis(15));
        }
        Ok(())
    })();
    // Always release modifiers, even if a key press failed.
    for m in modifiers.iter().rev() {
        let _ = enigo.key(*m, Direction::Release);
    }
    result
}

// ---------------------------------------------------------------- commands

#[tauri::command]
#[specta::specta]
pub fn get_voice_command_status(app: AppHandle) -> VoiceCommandStatus {
    let state = app.state::<VoiceCommands>();
    VoiceCommandStatus {
        enabled: settings::get_settings(&app).voice_commands_enabled,
        model_downloaded: installed_config(&app).is_some(),
        downloading: state.downloading.load(Ordering::SeqCst),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn download_voice_command_model(app: AppHandle) -> Result<(), String> {
    let state = app.state::<VoiceCommands>();
    if state.downloading.swap(true, Ordering::SeqCst) {
        return Err("A download is already running".into());
    }
    let result = download_model(&app).await;
    state.downloading.store(false, Ordering::SeqCst);
    result.map_err(|e| format!("{e:#}"))
}

#[tauri::command]
#[specta::specta]
pub fn delete_voice_command_model(app: AppHandle) -> Result<(), String> {
    app.state::<VoiceCommands>().unload();
    let dir = model_dir(&app).map_err(|e| e.to_string())?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_recent_voice_commands(app: AppHandle) -> Vec<VoiceCommandLogEntry> {
    let state = app.state::<VoiceCommands>();
    let recent = state.recent.lock().unwrap_or_else(|e| e.into_inner());
    recent.iter().cloned().collect()
}

#[tauri::command]
#[specta::specta]
pub fn change_voice_commands_enabled_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut s = settings::get_settings(&app);
    s.voice_commands_enabled = enabled;
    settings::write_settings(&app, s.clone());

    if let Some(binding) = s.bindings.get(BINDING_ID).cloned() {
        if enabled {
            let _ = crate::shortcut::register_shortcut(&app, binding);
        } else {
            let _ = crate::shortcut::unregister_shortcut(&app, binding);
        }
    }
    if !enabled {
        app.state::<VoiceCommands>().unload();
    }
    Ok(())
}

//! What Voice Commands (beta) understands and how each command is carried out.
//!
//! Laya only classifies: it picks the intent, then the specific app / site /
//! action from a fixed list. Free-text parts (a search query, an unknown
//! domain) come from simple phrase rules. Every action is a fixed, harmless
//! operation — nothing is deleted, sent, typed or closed.

use anyhow::Result;
use enigo::Key;
use once_cell::sync::Lazy;
use regex::Regex;

use super::laya::{ChoiceQuestion, Laya};

/// Below this calibrated probability Silktone says it didn't understand
/// instead of acting.
pub const MIN_PROBABILITY: f32 = 0.45;

/// Keep in sync with INTENT_QUESTION in scripts/laya/export_onnx.py (the
/// parity check there exercises exactly this question).
const INTENT_INSTRUCTIONS: &str = "What does the user want the computer to do?";
const INTENT_OPTIONS: &[(&str, &str)] = &[
    ("open_app", "open or launch an application"),
    ("open_website", "go to a website"),
    ("web_search", "search the web for something"),
    ("media", "play, pause, skip or go back in music or video"),
    ("volume", "turn the sound volume up or down, or mute it"),
    ("window", "minimize windows, show the desktop or switch windows"),
    ("screenshot", "take a screenshot"),
    ("lock", "lock the computer"),
    ("none", "not a request to control the computer"),
];

/// `(key, description, display name, Windows launch target)`. Targets are
/// resolved by `start` through App Paths or a registered URI scheme.
const APPS: &[(&str, &str, &str, &str)] = &[
    ("chrome", "Google Chrome web browser", "Chrome", "chrome"),
    ("edge", "Microsoft Edge web browser", "Edge", "msedge"),
    ("firefox", "Mozilla Firefox web browser", "Firefox", "firefox"),
    ("notepad", "Notepad text editor", "Notepad", "notepad"),
    ("calculator", "Calculator", "Calculator", "calc"),
    ("file_explorer", "File Explorer, files and folders", "File Explorer", "explorer"),
    ("settings", "Windows Settings", "Settings", "ms-settings:"),
    ("task_manager", "Task Manager", "Task Manager", "taskmgr"),
    ("paint", "Paint", "Paint", "mspaint"),
    ("terminal", "Command Prompt or terminal", "Command Prompt", "cmd"),
    ("word", "Microsoft Word documents", "Word", "winword"),
    ("excel", "Microsoft Excel spreadsheets", "Excel", "excel"),
    ("powerpoint", "Microsoft PowerPoint slides", "PowerPoint", "powerpnt"),
    ("vscode", "Visual Studio Code editor", "VS Code", "vscode:"),
    ("spotify", "Spotify music", "Spotify", "spotify:"),
    ("whatsapp", "WhatsApp", "WhatsApp", "whatsapp:"),
    ("other", "some other app", "", ""),
];

/// `(key, description, display name, URL)`.
const SITES: &[(&str, &str, &str, &str)] = &[
    ("youtube", "YouTube videos", "YouTube", "https://www.youtube.com"),
    ("gmail", "Gmail email", "Gmail", "https://mail.google.com"),
    ("google", "Google search home page", "Google", "https://www.google.com"),
    ("maps", "Google Maps", "Google Maps", "https://maps.google.com"),
    ("drive", "Google Drive files", "Google Drive", "https://drive.google.com"),
    ("calendar", "Google Calendar", "Google Calendar", "https://calendar.google.com"),
    ("github", "GitHub code", "GitHub", "https://github.com"),
    ("linkedin", "LinkedIn", "LinkedIn", "https://www.linkedin.com"),
    ("instagram", "Instagram", "Instagram", "https://www.instagram.com"),
    ("facebook", "Facebook", "Facebook", "https://www.facebook.com"),
    ("x", "X, formerly Twitter", "X", "https://x.com"),
    ("whatsapp_web", "WhatsApp Web", "WhatsApp Web", "https://web.whatsapp.com"),
    ("chatgpt", "ChatGPT", "ChatGPT", "https://chatgpt.com"),
    ("claude", "Claude AI assistant", "Claude", "https://claude.ai"),
    ("netflix", "Netflix", "Netflix", "https://www.netflix.com"),
    ("amazon", "Amazon shopping", "Amazon", "https://www.amazon.in"),
    ("flipkart", "Flipkart shopping", "Flipkart", "https://www.flipkart.com"),
    ("other", "some other website", "", ""),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyAction {
    PlayPause,
    NextTrack,
    PreviousTrack,
    VolumeUp,
    VolumeDown,
    Mute,
    ShowDesktop,
    MinimizeWindow,
    MaximizeWindow,
    SwitchWindow,
    Screenshot,
}

impl KeyAction {
    /// `(held modifiers, key, repeat)`.
    pub fn keys(self) -> (&'static [Key], Key, usize) {
        match self {
            KeyAction::PlayPause => (&[], Key::MediaPlayPause, 1),
            KeyAction::NextTrack => (&[], Key::MediaNextTrack, 1),
            KeyAction::PreviousTrack => (&[], Key::MediaPrevTrack, 1),
            // Each press moves Windows' volume by 2%.
            KeyAction::VolumeUp => (&[], Key::VolumeUp, 5),
            KeyAction::VolumeDown => (&[], Key::VolumeDown, 5),
            KeyAction::Mute => (&[], Key::VolumeMute, 1),
            KeyAction::ShowDesktop => (&[Key::Meta], Key::Unicode('d'), 1),
            KeyAction::MinimizeWindow => (&[Key::Meta], Key::DownArrow, 1),
            KeyAction::MaximizeWindow => (&[Key::Meta], Key::UpArrow, 1),
            KeyAction::SwitchWindow => (&[Key::Alt], Key::Tab, 1),
            KeyAction::Screenshot => (&[Key::Meta, Key::Shift], Key::Unicode('s'), 1),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    LaunchApp { target: &'static str },
    OpenUrl { url: String },
    Keys(KeyAction),
    LockComputer,
}

/// What Silktone decided to do with a spoken command.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    Run { action: Action, label: String },
    /// Understood, but not something the beta can do yet.
    Unsupported(String),
    NotUnderstood,
}

fn ask(laya: &mut Laya, text: &str, instructions: &str, options: &[(&str, &str)]) -> Result<(usize, f32)> {
    let a = laya.choose(
        text,
        &ChoiceQuestion {
            instructions,
            options,
        },
    )?;
    Ok((a.index, a.probability))
}

fn pairs(rows: &[(&'static str, &'static str, &'static str, &'static str)]) -> Vec<(&'static str, &'static str)> {
    rows.iter().map(|r| (r.0, r.1)).collect()
}

/// Decide what to do with the transcribed command.
pub fn decide(laya: &mut Laya, heard: &str) -> Result<Decision> {
    let text = heard.trim().trim_end_matches(['.', '!', '?']).trim();
    if text.is_empty() {
        return Ok(Decision::NotUnderstood);
    }

    // Prefer the question the model conversion measured (laya-config.json).
    let cfg = laya.config();
    let min_p = cfg.min_probability.unwrap_or(MIN_PROBABILITY);
    let (instructions, owned_options) = match &cfg.intent {
        Some(q) => (q.instructions.clone(), q.options.clone()),
        None => (
            INTENT_INSTRUCTIONS.to_string(),
            INTENT_OPTIONS
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        ),
    };
    let options: Vec<(&str, &str)> = owned_options
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();

    let (intent, p) = ask(laya, text, &instructions, &options)?;
    let intent = options[intent].0;
    log::debug!("voice command intent: {intent} ({p:.2})");
    if p < min_p {
        return Ok(Decision::NotUnderstood);
    }

    let run = |action, label: String| Ok(Decision::Run { action, label });
    match intent {
        "open_app" => {
            let options = pairs(APPS);
            let (i, p) = ask(laya, text, "Which app should be opened?", &options)?;
            let (key, _, name, target) = APPS[i];
            if key == "other" || p < min_p {
                return Ok(Decision::Unsupported(format!(
                    "Can't open \"{}\" yet",
                    strip_lead(text, &LEAD_OPEN)
                )));
            }
            run(Action::LaunchApp { target }, format!("Opening {name}"))
        }
        "open_website" => {
            let options = pairs(SITES);
            let (i, p) = ask(laya, text, "Which website should be opened?", &options)?;
            let (key, _, name, url) = SITES[i];
            if key != "other" && p >= min_p {
                return run(Action::OpenUrl { url: url.to_string() }, format!("Opening {name}"));
            }
            if let Some(domain) = find_domain(text) {
                return run(
                    Action::OpenUrl {
                        url: format!("https://{domain}"),
                    },
                    format!("Opening {domain}"),
                );
            }
            let query = strip_lead(text, &LEAD_OPEN);
            run(
                Action::OpenUrl {
                    url: google_search_url(&query),
                },
                format!("Searching \"{query}\""),
            )
        }
        "web_search" => {
            let query = search_query(text);
            if query.is_empty() {
                return run(
                    Action::OpenUrl {
                        url: "https://www.google.com".into(),
                    },
                    "Opening Google".into(),
                );
            }
            let url = if YOUTUBE.is_match(text) {
                format!(
                    "https://www.youtube.com/results?search_query={}",
                    encode(&query)
                )
            } else {
                google_search_url(&query)
            };
            run(Action::OpenUrl { url }, format!("Searching \"{query}\""))
        }
        "media" => {
            let (i, _) = ask(
                laya,
                text,
                "What should happen to the music or video?",
                &[
                    ("play_pause", "play, pause, stop or resume"),
                    ("next", "skip to the next track"),
                    ("previous", "go back to the previous track"),
                ],
            )?;
            let (action, label) = [
                (KeyAction::PlayPause, "Play / pause"),
                (KeyAction::NextTrack, "Next track"),
                (KeyAction::PreviousTrack, "Previous track"),
            ][i];
            run(Action::Keys(action), label.into())
        }
        "volume" => {
            let (i, _) = ask(
                laya,
                text,
                "How should the volume change?",
                &[
                    ("up", "louder, turn it up, increase"),
                    ("down", "quieter, turn it down, decrease"),
                    ("mute", "mute, unmute or silence"),
                ],
            )?;
            let (action, label) = [
                (KeyAction::VolumeUp, "Volume up"),
                (KeyAction::VolumeDown, "Volume down"),
                (KeyAction::Mute, "Mute / unmute"),
            ][i];
            run(Action::Keys(action), label.into())
        }
        "window" => {
            let (i, _) = ask(
                laya,
                text,
                "What should happen to the windows?",
                &[
                    ("show_desktop", "show the desktop or minimize everything"),
                    ("minimize", "minimize the current window"),
                    ("maximize", "maximize or enlarge the current window"),
                    ("switch", "switch to another window or app"),
                ],
            )?;
            let (action, label) = [
                (KeyAction::ShowDesktop, "Showing desktop"),
                (KeyAction::MinimizeWindow, "Minimizing window"),
                (KeyAction::MaximizeWindow, "Maximizing window"),
                (KeyAction::SwitchWindow, "Switching window"),
            ][i];
            run(Action::Keys(action), label.into())
        }
        "screenshot" => run(Action::Keys(KeyAction::Screenshot), "Screenshot".into()),
        "lock" => run(Action::LockComputer, "Locking".into()),
        _ => Ok(Decision::NotUnderstood),
    }
}

static LEAD_OPEN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^\s*(?:(?:hey|ok|okay)\s+silktone\s*,?\s*)?(?:please\s+|can you\s+|could you\s+)?(?:open(?:\s+up)?|launch|start|run|go to|take me to|navigate to|visit|show me)\s+(?:the\s+)?")
        .expect("valid regex")
});

static LEAD_SEARCH: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^\s*(?:please\s+|can you\s+|could you\s+)?(?:search(?:\s+(?:the\s+web|online|google|youtube))?(?:\s+for)?|google|look\s+up|find(?:\s+me)?|show\s+me)\s+")
        .expect("valid regex")
});

static TRAIL_SEARCH: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\s+(?:on|in|using)\s+(?:google|youtube|the\s+web|the\s+internet)\s*$").expect("valid regex")
});

static YOUTUBE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\byou\s?tube\b").expect("valid regex"));

static DOMAIN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|in|org|net|io|ai|dev|app|co|edu|gov|me|tv))\b")
        .expect("valid regex")
});

fn strip_lead(text: &str, lead: &Regex) -> String {
    lead.replace(text, "").trim().to_string()
}

fn search_query(text: &str) -> String {
    let q = strip_lead(text, &LEAD_SEARCH);
    TRAIL_SEARCH.replace(&q, "").trim().to_string()
}

/// "go to example dot com" → "example.com".
fn find_domain(text: &str) -> Option<String> {
    let spoken = Regex::new(r"(?i)\s+dot\s+").expect("valid regex").replace_all(text, ".");
    DOMAIN
        .captures(&spoken)
        .map(|c| c[1].to_lowercase())
}

fn encode(q: &str) -> String {
    let mut out = String::with_capacity(q.len() * 3);
    for b in q.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn google_search_url(q: &str) -> String {
    format!("https://www.google.com/search?q={}", encode(q))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_queries_drop_the_command_words() {
        assert_eq!(search_query("search for flights to Goa"), "flights to Goa");
        assert_eq!(search_query("Google the weather in Hyderabad"), "the weather in Hyderabad");
        assert_eq!(search_query("look up cricket scores on Google"), "cricket scores");
        assert_eq!(search_query("search YouTube for lofi music"), "lofi music");
    }

    #[test]
    fn spoken_domains_are_recognised() {
        assert_eq!(find_domain("go to litovation dot com").as_deref(), Some("litovation.com"));
        assert_eq!(find_domain("open example.in please").as_deref(), Some("example.in"));
        assert_eq!(find_domain("open the budget sheet"), None);
    }

    #[test]
    fn open_lead_is_stripped() {
        assert_eq!(strip_lead("Please open up Blender", &LEAD_OPEN), "Blender");
        assert_eq!(strip_lead("launch the VLC player", &LEAD_OPEN), "VLC player");
    }

    #[test]
    fn queries_are_url_encoded() {
        assert_eq!(encode("c++ & rust"), "c%2B%2B+%26+rust");
    }

    #[test]
    fn question_tables_have_no_duplicate_keys() {
        for keys in [
            INTENT_OPTIONS.iter().map(|o| o.0).collect::<Vec<_>>(),
            APPS.iter().map(|o| o.0).collect(),
            SITES.iter().map(|o| o.0).collect(),
        ] {
            let mut sorted = keys.clone();
            sorted.sort_unstable();
            sorted.dedup();
            assert_eq!(sorted.len(), keys.len());
        }
    }
}

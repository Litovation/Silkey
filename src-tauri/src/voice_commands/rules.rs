//! Phrase rules for voice commands.
//!
//! Rules are tried before the Laya model: they are instant, need no download,
//! and are precise enough to run *while the user is still speaking* (see
//! `live_scan`). Laya only handles wording the rules do not recognise.
//!
//! A command must start at the beginning of the (remaining) text, so words
//! inside a longer request never fire on their own: "search for flights next
//! friday" is a search, not "next song".

use once_cell::sync::Lazy;
use regex::Regex;

use super::intents::{self, Action, KeyAction};

/// `(spoken name, key in intents::APPS)`.
const APP_ALIASES: &[(&str, &str)] = &[
    ("google chrome", "chrome"),
    ("chrome", "chrome"),
    ("microsoft edge", "edge"),
    ("edge", "edge"),
    ("firefox", "firefox"),
    ("notepad", "notepad"),
    ("calculator", "calculator"),
    ("calc", "calculator"),
    ("file explorer", "file_explorer"),
    ("explorer", "file_explorer"),
    ("my files", "file_explorer"),
    ("files", "file_explorer"),
    ("settings", "settings"),
    ("task manager", "task_manager"),
    ("paint", "paint"),
    ("command prompt", "terminal"),
    ("terminal", "terminal"),
    ("cmd", "terminal"),
    ("microsoft word", "word"),
    ("word", "word"),
    ("microsoft excel", "excel"),
    ("excel", "excel"),
    ("powerpoint", "powerpoint"),
    ("power point", "powerpoint"),
    ("visual studio code", "vscode"),
    ("vs code", "vscode"),
    ("vscode", "vscode"),
    ("spotify", "spotify"),
    ("whatsapp", "whatsapp"),
];

/// `(spoken name, key in intents::SITES)`.
const SITE_ALIASES: &[(&str, &str)] = &[
    ("youtube", "youtube"),
    ("you tube", "youtube"),
    ("gmail", "gmail"),
    ("g mail", "gmail"),
    ("my email", "gmail"),
    ("my mail", "gmail"),
    ("google maps", "maps"),
    ("maps", "maps"),
    ("google drive", "drive"),
    ("drive", "drive"),
    ("google calendar", "calendar"),
    ("calendar", "calendar"),
    ("google", "google"),
    ("github", "github"),
    ("git hub", "github"),
    ("linkedin", "linkedin"),
    ("linked in", "linkedin"),
    ("instagram", "instagram"),
    ("insta", "instagram"),
    ("facebook", "facebook"),
    ("twitter", "x"),
    ("whatsapp web", "whatsapp_web"),
    ("chatgpt", "chatgpt"),
    ("chat gpt", "chatgpt"),
    ("claude", "claude"),
    ("netflix", "netflix"),
    ("amazon", "amazon"),
    ("flipkart", "flipkart"),
];

/// One-word names that also start a longer name ("google" → "google maps").
/// These are never acted on mid-speech; they wait for the sentence to end.
const AMBIGUOUS_LIVE: &[&str] = &[
    "google",
    "whatsapp",
    "microsoft",
    "visual",
    "explorer",
    "files",
    "word",
    "drive",
    "maps",
    "calendar",
];

const FILLER: &str =
    r"^(?:[\s,.;!?]+|(?:and|then|also|please|now|ok|okay|hey|sreeni|silktone)\b)+";
const OPEN_VERB: &str = r"(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:open(?:\s+up)?|launch|start|run|go\s+to|take\s+me\s+to|navigate\s+to|visit|show\s+me)\s+(?:the\s+|my\s+)?";

#[derive(Clone, Copy)]
enum Kind {
    Keys(KeyAction),
    Lock,
}

/// Order matters: the first matching rule wins.
const KEY_RULES: &[(Kind, &str)] = &[
    (
        Kind::Keys(KeyAction::ShowDesktop),
        r"^(?:show(?:\s+me)?\s+(?:the\s+|my\s+)?desktop|minimi[sz]e\s+(?:everything|all(?:\s+(?:the\s+)?windows)?))\b",
    ),
    (
        Kind::Keys(KeyAction::MinimizeWindow),
        r"^minimi[sz]e(?:\s+(?:this|the|that)(?:\s+window)?|\s+window)?\b",
    ),
    (
        Kind::Keys(KeyAction::MaximizeWindow),
        r"^maximi[sz]e(?:\s+(?:this|the|that)(?:\s+window)?|\s+window)?\b",
    ),
    (
        Kind::Keys(KeyAction::SwitchWindow),
        r"^switch\s+(?:the\s+)?(?:windows?|apps?|to\s+the\s+(?:other|next|previous|last)\s+(?:window|app))\b",
    ),
    (
        Kind::Keys(KeyAction::Screenshot),
        r"^(?:take\s+(?:a\s+)?screen\s?shot|screen\s?shot|capture\s+(?:my\s+|the\s+)?screen)\b",
    ),
    (
        Kind::Lock,
        r"^lock\s+(?:my\s+|the\s+|this\s+)?(?:computer|pc|screen|laptop|system)\b",
    ),
    (
        Kind::Keys(KeyAction::Mute),
        r"^(?:mute|unmute|silence)(?:\s+(?:the\s+)?(?:sound|volume|audio|music|it))?\b",
    ),
    (
        Kind::Keys(KeyAction::VolumeUp),
        r"^(?:(?:turn|make|put)\s+(?:the\s+|it\s+)?(?:volume\s+|sound\s+|music\s+)?(?:up|louder)|turn\s+up\s+(?:the\s+)?(?:volume|sound|music)|volume\s+up|louder|(?:increase|raise)\s+(?:the\s+)?(?:volume|sound))\b",
    ),
    (
        Kind::Keys(KeyAction::VolumeDown),
        r"^(?:(?:turn|make|put)\s+(?:the\s+|it\s+)?(?:volume\s+|sound\s+|music\s+)?(?:down|quieter|lower|softer)|turn\s+down\s+(?:the\s+)?(?:volume|sound|music)|volume\s+down|quieter|(?:decrease|reduce|lower)\s+(?:the\s+)?(?:volume|sound))\b",
    ),
    (
        Kind::Keys(KeyAction::NextTrack),
        r"^(?:(?:play\s+)?(?:the\s+)?next\s+(?:song|track|video|one)|(?:next|skip)(?:\s+(?:this\s+|the\s+)?(?:song|track|video|one))?)\b",
    ),
    (
        Kind::Keys(KeyAction::PreviousTrack),
        r"^(?:(?:play\s+)?(?:the\s+)?previous(?:\s+(?:song|track|video|one))?|go\s+back(?:\s+(?:a|one)\s+(?:song|track))?|last\s+(?:song|track))\b",
    ),
    (
        Kind::Keys(KeyAction::PlayPause),
        r"^(?:(?:pause|resume)(?:\s+(?:the\s+|this\s+|my\s+)?(?:music|song|video|track|playback))?|(?:stop|play)\s+(?:the\s+|this\s+|my\s+)?(?:music|song|video|track|playback))\b",
    ),
];

#[derive(Clone, Copy)]
enum Named {
    App(&'static str),
    Site(&'static str),
}

struct Compiled {
    filler: Regex,
    key_rules: Vec<(Kind, Regex)>,
    /// Names longest-first so "google maps" wins over "google".
    names: Vec<(&'static str, Named)>,
    open_named: Regex,
    open_domain: Regex,
    search: Regex,
    search_trail: Regex,
    youtube: Regex,
    spoken_dot: Regex,
}

fn ci(pattern: &str) -> Regex {
    Regex::new(&format!("(?i){pattern}")).expect("valid voice command pattern")
}

static COMPILED: Lazy<Compiled> = Lazy::new(|| {
    let mut names: Vec<(&'static str, Named)> = APP_ALIASES
        .iter()
        .map(|(alias, key)| (*alias, Named::App(*key)))
        .chain(SITE_ALIASES.iter().map(|(alias, key)| (*alias, Named::Site(*key))))
        .collect();
    names.sort_by(|a, b| b.0.len().cmp(&a.0.len()));
    let alternatives = names
        .iter()
        .map(|(alias, _)| alias.replace(' ', r"\s+"))
        .collect::<Vec<_>>()
        .join("|");
    Compiled {
        filler: ci(FILLER),
        key_rules: KEY_RULES.iter().map(|(kind, p)| (*kind, ci(p))).collect(),
        open_named: ci(&format!(r"^{OPEN_VERB}({alternatives})\b")),
        names,
        open_domain: ci(&format!(
            r"^{OPEN_VERB}([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|in|org|net|io|ai|dev|app|co|edu|gov|me|tv))\b"
        )),
        search: ci(
            r"^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:search(?:\s+(?:the\s+web|online|google|youtube|you\s+tube))?(?:\s+for)?|google|look\s+up|find(?:\s+me)?)\s+(.+)$",
        ),
        search_trail: ci(r"\s+(?:on|in|using)\s+(?:google|youtube|you\s+tube|the\s+web|the\s+internet)\s*$"),
        youtube: ci(r"\byou\s?tube\b"),
        spoken_dot: ci(r"\s+dot\s+"),
    }
});

/// A command found at the start of some text.
pub struct Found {
    pub action: Action,
    pub label: String,
    /// Bytes of the text this command used up (including leading filler).
    pub end: usize,
    /// True when the name may still grow ("google" → "google maps").
    pub ambiguous: bool,
}

fn skip_filler(text: &str) -> usize {
    COMPILED.filler.find(text).map(|m| m.end()).unwrap_or(0)
}

/// The command at the start of `text`, if a rule recognises one.
pub fn next_command(text: &str) -> Option<Found> {
    let c = &*COMPILED;
    let skip = skip_filler(text);
    let rest = &text[skip..];

    for (kind, re) in &c.key_rules {
        if let Some(m) = re.find(rest) {
            let (action, label) = match kind {
                Kind::Keys(keys) => (Action::Keys(*keys), intents::key_label(*keys).to_string()),
                Kind::Lock => (Action::LockComputer, "Locking".to_string()),
            };
            return Some(Found {
                action,
                label,
                end: skip + m.end(),
                ambiguous: false,
            });
        }
    }

    let caps = c.open_named.captures(rest)?;
    let (whole, name) = (caps.get(0)?, caps.get(1)?);
    let spoken = name
        .as_str()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let (_, named) = c.names.iter().find(|(alias, _)| *alias == spoken)?;
    let (action, label) = match named {
        Named::App(key) => {
            let (display, target) = intents::app(key)?;
            (Action::LaunchApp { target }, format!("Opening {display}"))
        }
        Named::Site(key) => {
            let (display, url) = intents::site(key)?;
            (
                Action::OpenUrl {
                    url: url.to_string(),
                },
                format!("Opening {display}"),
            )
        }
    };
    Some(Found {
        action,
        label,
        end: skip + whole.end(),
        ambiguous: !spoken.contains(' ') && AMBIGUOUS_LIVE.contains(&spoken.as_str()),
    })
}

/// Commands that need the whole sentence: a search or a spoken web address.
fn tail_command(text: &str) -> Option<(Action, String)> {
    let c = &*COMPILED;
    let rest = text[skip_filler(text)..]
        .trim()
        .trim_end_matches(['.', '!', '?']);

    let spoken = c.spoken_dot.replace_all(rest, ".");
    if let Some(caps) = c.open_domain.captures(&spoken) {
        let domain = caps[1].to_lowercase();
        return Some((
            Action::OpenUrl {
                url: format!("https://{domain}"),
            },
            format!("Opening {domain}"),
        ));
    }

    let caps = c.search.captures(rest)?;
    let query = c.search_trail.replace(&caps[1], "").trim().to_string();
    if query.is_empty() {
        return None;
    }
    let url = if c.youtube.is_match(rest) {
        intents::youtube_search_url(&query)
    } else {
        intents::google_search_url(&query)
    };
    Some((Action::OpenUrl { url }, format!("Searching \"{query}\"")))
}

/// Everything the rules recognise in a finished sentence.
pub struct Plan {
    pub runs: Vec<(Action, String)>,
    /// Text no rule recognised (candidate for Laya); empty when fully handled.
    pub leftover: String,
}

/// Chained commands ("volume up and pause"), then a trailing search/address.
pub fn plan_all(text: &str) -> Plan {
    let mut runs = Vec::new();
    let mut consumed = 0;
    while let Some(found) = next_command(&text[consumed..]) {
        consumed += found.end;
        runs.push((found.action, found.label));
    }
    let rest = &text[consumed..];
    let rest = rest[skip_filler(rest)..]
        .trim()
        .trim_end_matches(['.', '!', '?'])
        .trim();
    if !rest.is_empty() {
        if let Some(run) = tail_command(rest) {
            runs.push(run);
            return Plan {
                runs,
                leftover: String::new(),
            };
        }
    }
    Plan {
        runs,
        leftover: rest.to_string(),
    }
}

/// Commands that are safe to run before the sentence ends, found at the start
/// of `committed` (the stable part of the live transcript). Returns the runs
/// and how many bytes of `committed` they used.
///
/// `tentative` is the still-changing tail: a match that touches the end of
/// `committed` waits if the tentative text continues the same word.
pub fn live_scan(committed: &str, tentative: &str) -> (Vec<(Action, String)>, usize) {
    let mut runs = Vec::new();
    let mut consumed = 0;
    loop {
        let rest = &committed[consumed..];
        let Some(found) = next_command(rest) else {
            break;
        };
        if found.ambiguous {
            break;
        }
        let word_still_growing = found.end == rest.len()
            && tentative.chars().next().is_some_and(|ch| !ch.is_whitespace());
        if word_still_growing {
            break;
        }
        consumed += found.end;
        runs.push((found.action, found.label));
    }
    (runs, consumed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labels(text: &str) -> (Vec<String>, String) {
        let plan = plan_all(text);
        (plan.runs.into_iter().map(|r| r.1).collect(), plan.leftover)
    }

    #[test]
    fn recognises_the_benchmark_commands() {
        for (text, want) in [
            ("open chrome", "Opening Chrome"),
            ("launch notepad please", "Opening Notepad"),
            ("can you open spotify", "Opening Spotify"),
            ("go to youtube", "Opening YouTube"),
            ("open gmail", "Opening Gmail"),
            ("take me to github", "Opening GitHub"),
            ("open litovation dot com", "Opening litovation.com"),
            ("search for flights to goa", "Searching \"flights to goa\""),
            ("search youtube for lofi music", "Searching \"lofi music\""),
            ("pause the music", "Play / pause"),
            ("next song", "Next track"),
            ("play the previous track", "Previous track"),
            ("turn the volume up", "Volume up"),
            ("make it quieter", "Volume down"),
            ("mute", "Mute / unmute"),
            ("show me the desktop", "Showing desktop"),
            ("switch to the other window", "Switching window"),
            ("capture my screen", "Screenshot"),
            ("lock the screen", "Locking"),
            ("Open Google Maps.", "Opening Google Maps"),
            ("Hey Sreeni, lock my PC", "Locking"),
        ] {
            let (got, leftover) = labels(text);
            assert_eq!(got, vec![want.to_string()], "{text}");
            assert!(leftover.is_empty(), "{text}: leftover {leftover:?}");
        }
    }

    #[test]
    fn leaves_ordinary_speech_and_unknown_requests_for_laya() {
        for text in [
            "i think we should meet tomorrow at five",
            "the quarterly numbers look good",
            "play despacito",
            "open the budget sheet",
        ] {
            let (got, leftover) = labels(text);
            assert!(got.is_empty(), "{text}: {got:?}");
            assert!(!leftover.is_empty(), "{text}");
        }
    }

    #[test]
    fn chains_commands() {
        let (got, _) = labels("Volume up, volume up and pause");
        assert_eq!(got, ["Volume up", "Volume up", "Play / pause"]);
    }

    #[test]
    fn command_words_inside_a_request_do_not_fire() {
        let (got, _) = labels("search for flights next friday");
        assert_eq!(got, ["Searching \"flights next friday\""]);
    }

    #[test]
    fn live_scan_only_fires_finished_safe_commands() {
        let fired = |c: &str, t: &str| -> Vec<String> {
            live_scan(c, t).0.into_iter().map(|r| r.1).collect()
        };
        assert_eq!(fired("volume up", ""), ["Volume up"]);
        assert_eq!(fired("louder louder louder", "").len(), 3);
        assert_eq!(fired("pause the music then next song", ""), ["Play / pause", "Next track"]);
        assert_eq!(fired("open chrome", " and"), ["Opening Chrome"]);
        // The word may still be growing ("chromecast").
        assert!(fired("open chrome", "cast").is_empty());
        // "google" could become "google maps": wait for the end.
        assert!(fired("open google", "").is_empty());
        assert_eq!(fired("open google maps", ""), ["Opening Google Maps"]);
        // Searches need the whole sentence, and "next" inside one must not fire.
        assert!(fired("search for flights next", " friday").is_empty());
        assert!(fired("open", " chrome").is_empty());
    }

    #[test]
    fn every_alias_points_at_a_known_app_or_site() {
        for (alias, key) in APP_ALIASES {
            assert!(intents::app(key).is_some(), "{alias} -> {key}");
        }
        for (alias, key) in SITE_ALIASES {
            assert!(intents::site(key).is_some(), "{alias} -> {key}");
        }
    }
}

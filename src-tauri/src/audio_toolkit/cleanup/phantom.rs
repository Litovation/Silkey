//! Block made-up text on silence (build spec feature 6).
//!
//! Speech models sometimes "hear" stock phrases in silence or noise, most
//! famously "Thank you for watching!". A recording with almost no speech
//! pastes nothing, a known phantom phrase on a short recording is dropped, and
//! a phrase that loops more than three times is cut to one copy.

/// Less voice than this in a recording (milliseconds) means nothing was said.
pub const MIN_SPEECH_MS: u64 = 300;
/// A known phantom phrase is only dropped from recordings shorter than this,
/// so real speech that happens to say it is never cut.
pub const PHANTOM_MAX_SPEECH_MS: u64 = 1_500;

/// Stock phrases speech models produce from silence, lowercased, without
/// punctuation.
const PHANTOM_PHRASES: &[&str] = &[
    "thank you for watching",
    "thanks for watching",
    "thank you so much for watching",
    "thank you very much for watching",
    "please subscribe",
    "like and subscribe",
    "subtitles by the amaraorg community",
    "subtitles by the amara org community",
    "subtitles by",
    "transcribed by",
    "you",
];

fn normalized(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// Whether the whole text is a known phantom phrase (or only punctuation).
pub fn is_phantom_phrase(text: &str) -> bool {
    let normalized = normalized(text);
    normalized.is_empty() || PHANTOM_PHRASES.contains(&normalized.as_str())
}

/// Whether a finished transcription should be thrown away instead of pasted.
/// `speech_ms` is how much voice the recording held; `None` when unknown
/// (voice detection off), in which case only empty text is dropped.
pub fn should_discard(text: &str, speech_ms: Option<u64>) -> bool {
    let Some(speech_ms) = speech_ms else {
        return normalized(text).is_empty();
    };
    speech_ms < MIN_SPEECH_MS || (speech_ms < PHANTOM_MAX_SPEECH_MS && is_phantom_phrase(text))
}

/// Cut a phrase of one to eight words repeated more than three times in a
/// row down to a single copy ("thank you thank you thank you thank you").
pub fn collapse_loops(text: &str) -> String {
    let words: Vec<&str> = text.split(' ').collect();
    if words.len() < 4 {
        return text.to_string();
    }
    let keys: Vec<String> = words.iter().map(|w| normalized(w)).collect();
    let mut out: Vec<&str> = Vec::with_capacity(words.len());
    let mut i = 0;
    'outer: while i < words.len() {
        for size in 1..=8 {
            if i + size * 4 > words.len() {
                break;
            }
            let pattern = &keys[i..i + size];
            if pattern.iter().all(|k| k.is_empty()) {
                continue;
            }
            let mut repeats = 1;
            while i + size * (repeats + 1) <= words.len()
                && keys[i + size * repeats..i + size * (repeats + 1)] == *pattern
            {
                repeats += 1;
            }
            if repeats > 3 {
                // Keep the last copy so its trailing punctuation survives.
                let last = i + size * (repeats - 1);
                out.extend_from_slice(&words[last..last + size]);
                i += size * repeats;
                continue 'outer;
            }
        }
        out.push(words[i]);
        i += 1;
    }
    out.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_and_phantoms_are_discarded() {
        assert!(should_discard("Thank you for watching!", Some(800)));
        assert!(should_discard("Anything at all", Some(120)));
        assert!(should_discard(".", Some(900)));
        assert!(should_discard("you", Some(1_000)));
    }

    #[test]
    fn real_speech_is_kept() {
        assert!(!should_discard("Thank you for watching!", Some(4_000)));
        assert!(!should_discard("Send the deck today", Some(900)));
        assert!(!should_discard("Thank you for watching", None));
    }

    #[test]
    fn loops_are_cut() {
        assert_eq!(
            collapse_loops("thank you thank you thank you thank you thank you."),
            "thank you."
        );
        assert_eq!(collapse_loops("no no no"), "no no no");
        assert_eq!(collapse_loops("very very good"), "very very good");
    }
}

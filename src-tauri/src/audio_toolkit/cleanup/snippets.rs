//! Snippets (build spec feature 11) and learned corrections (feature 8,
//! step 1).
//!
//! Saying only a snippet's trigger ("my address") pastes its full text;
//! "insert my address" inside a longer sentence is replaced in place. Small
//! mishearings still match. Placeholders {date} and {time} are filled here;
//! {clipboard} is filled at paste time, where the clipboard can be read.

use chrono::Local;
use strsim::normalized_levenshtein;

/// How close a heard phrase must be to a trigger to count (1.0 = identical).
const TRIGGER_SIMILARITY: f64 = 0.85;

fn normalize(text: &str) -> String {
    text.chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn similar(heard: &str, trigger: &str) -> bool {
    if heard.is_empty() || trigger.is_empty() {
        return false;
    }
    heard == trigger || normalized_levenshtein(heard, trigger) >= TRIGGER_SIMILARITY
}

/// Fill {date} and {time}.
pub fn expand_placeholders(text: &str) -> String {
    let now = Local::now();
    text.replace("{date}", &now.format("%B %-d, %Y").to_string())
        .replace("{time}", &now.format("%-I:%M %p").to_string())
}

/// The snippet text when the whole dictation is one trigger.
pub fn whole_match<'a>(text: &str, snippets: &'a [(String, String)]) -> Option<&'a str> {
    let heard = normalize(text);
    snippets
        .iter()
        .find(|(trigger, _)| similar(&heard, &normalize(trigger)))
        .map(|(_, body)| body.as_str())
}

/// Replace "insert <trigger>" inside a longer dictation.
pub fn replace_inserts(text: &str, snippets: &[(String, String)]) -> String {
    if snippets.is_empty() {
        return text.to_string();
    }
    let words: Vec<&str> = text.split(' ').collect();
    let mut out: Vec<String> = Vec::with_capacity(words.len());
    let mut i = 0;
    'outer: while i < words.len() {
        if normalize(words[i]) == "insert" {
            for (trigger, body) in snippets {
                let size = normalize(trigger).split(' ').count();
                if size == 0 || i + 1 + size > words.len() {
                    continue;
                }
                let heard = normalize(&words[i + 1..i + 1 + size].join(" "));
                if similar(&heard, &normalize(trigger)) {
                    let last = words[i + size];
                    let trail: String = last
                        .chars()
                        .rev()
                        .take_while(|c| !c.is_alphanumeric())
                        .collect::<Vec<_>>()
                        .into_iter()
                        .rev()
                        .collect();
                    out.push(format!("{body}{trail}"));
                    i += 1 + size;
                    continue 'outer;
                }
            }
        }
        out.push(words[i].to_string());
        i += 1;
    }
    out.join(" ")
}

/// Apply corrections the user taught Silktone (wrong -> right), as whole
/// words, ignoring case.
pub fn apply_learned_corrections(text: &str, corrections: &[(String, String)]) -> String {
    let mut current = text.to_string();
    for (wrong, right) in corrections {
        let wrong = wrong.trim();
        if wrong.is_empty() || right.trim().is_empty() {
            continue;
        }
        let pattern = format!(r"(?i)\b{}\b", regex::escape(wrong));
        if let Ok(re) = regex::Regex::new(&pattern) {
            current = re.replace_all(&current, right.trim()).to_string();
        }
    }
    current
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snippets() -> Vec<(String, String)> {
        vec![
            (
                "my address".to_string(),
                "12 MG Road, Pune 411001".to_string(),
            ),
            ("sign off".to_string(), "Best,\nBharat".to_string()),
        ]
    }

    #[test]
    fn whole_dictation_trigger() {
        assert_eq!(
            whole_match("My address.", &snippets()),
            Some("12 MG Road, Pune 411001")
        );
        assert_eq!(
            whole_match("my adress", &snippets()),
            Some("12 MG Road, Pune 411001")
        );
        assert_eq!(whole_match("my address is on the form", &snippets()), None);
    }

    #[test]
    fn insert_inside_a_sentence() {
        assert_eq!(
            replace_inserts("Please deliver to insert my address.", &snippets()),
            "Please deliver to 12 MG Road, Pune 411001."
        );
        assert_eq!(
            replace_inserts("I updated my address yesterday", &snippets()),
            "I updated my address yesterday"
        );
    }

    #[test]
    fn learned_corrections_replace_whole_words() {
        let corrections = vec![("silk tone".to_string(), "Silktone".to_string())];
        assert_eq!(
            apply_learned_corrections("I love Silk Tone a lot", &corrections),
            "I love Silktone a lot"
        );
        assert_eq!(apply_learned_corrections("silken", &corrections), "silken");
    }

    #[test]
    fn date_placeholder_is_filled() {
        let filled = expand_placeholders("Today is {date}");
        assert!(!filled.contains("{date}"));
    }
}

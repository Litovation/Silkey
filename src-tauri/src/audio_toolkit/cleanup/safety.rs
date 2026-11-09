//! Safety check for AI cleanup output (build spec feature 1, layers 2 and 3).
//!
//! An AI rewrite is only pasted when it kept the substance of what was said:
//! at least 70% of the input's content words survive, it adds no names or
//! numbers that were not said, and it is not much longer than the input.
//! Otherwise the rule-cleaned text is pasted instead.

use std::collections::HashSet;

/// Share of the input's content words the output must keep.
const MIN_KEPT_CONTENT: f64 = 0.7;
/// The output may be at most this much longer than the input (plus a little
/// slack for short texts, where list markers and punctuation weigh more).
const MAX_LENGTH_RATIO: f64 = 1.2;
const LENGTH_SLACK_CHARS: usize = 24;

const STOPWORDS: &[&str] = &[
    "about",
    "after",
    "again",
    "also",
    "been",
    "before",
    "being",
    "could",
    "does",
    "doing",
    "each",
    "from",
    "have",
    "having",
    "here",
    "into",
    "just",
    "like",
    "more",
    "most",
    "much",
    "only",
    "other",
    "over",
    "really",
    "same",
    "should",
    "some",
    "such",
    "than",
    "that",
    "their",
    "them",
    "then",
    "there",
    "these",
    "they",
    "this",
    "those",
    "through",
    "very",
    "want",
    "were",
    "what",
    "when",
    "where",
    "which",
    "while",
    "will",
    "with",
    "would",
    "your",
    "actually",
    "sorry",
    "mean",
    "rather",
    "scratch",
    "comma",
    "period",
    "point",
    "first",
    "second",
    "third",
    "number",
    "line",
    "paragraph",
    "question",
    "mark",
];

fn words(text: &str) -> impl Iterator<Item = &str> {
    text.split(|c: char| !c.is_alphanumeric() && c != '\'')
        .filter(|w| !w.is_empty())
}

fn content_words(text: &str) -> HashSet<String> {
    words(text)
        .map(str::to_lowercase)
        .filter(|w| w.chars().count() >= 4 && !STOPWORDS.contains(&w.as_str()))
        .collect()
}

/// Numbers in the text, as digit strings ("25", "2026").
fn numbers(text: &str) -> HashSet<String> {
    words(text)
        .filter(|w| w.chars().all(|c| c.is_ascii_digit()))
        .map(str::to_string)
        .collect()
}

/// Capitalised words that are not the first word of a sentence or line.
fn names(text: &str) -> HashSet<String> {
    let mut out = HashSet::new();
    let mut sentence_start = true;
    for raw in text.split_whitespace() {
        let core = raw.trim_matches(|c: char| !c.is_alphanumeric());
        let is_name = core.chars().next().is_some_and(char::is_uppercase)
            && core.chars().count() > 1
            && core != "I";
        if is_name && !sentence_start {
            out.insert(core.to_lowercase());
        }
        // Digits followed by "." start a list item, which starts a sentence.
        sentence_start =
            raw.ends_with(['.', '!', '?', ':']) || core.chars().all(|c| c.is_ascii_digit());
    }
    out
}

/// The same word, allowing a grammar fix or a joined spelling ("goes" / "go",
/// "silk" / "silktone").
fn same_word(input_word: &str, output_word: &str) -> bool {
    if input_word == output_word {
        return true;
    }
    let min_len = input_word.chars().count().saturating_sub(2).max(2);
    output_word.chars().count() >= min_len
        && (input_word.starts_with(output_word) || output_word.starts_with(input_word))
}

/// Whether an AI rewrite of `input` is safe to paste. `known_words` (custom
/// and learned words) may appear even if they were not heard exactly.
pub fn ai_output_is_safe(input: &str, output: &str, known_words: &[String]) -> bool {
    let output = output.trim();
    if output.is_empty() {
        return input.trim().is_empty();
    }
    let input_chars = input.chars().count();
    let output_chars = output.chars().count();
    let limit = (input_chars as f64 * MAX_LENGTH_RATIO) as usize + LENGTH_SLACK_CHARS;
    if output_chars > limit {
        return false;
    }

    let known: HashSet<String> = known_words
        .iter()
        .flat_map(|w| words(w).map(str::to_lowercase).collect::<Vec<_>>())
        .collect();
    let input_lower = input.to_lowercase();

    let kept_needed = content_words(input);
    if !kept_needed.is_empty() {
        let output_words: Vec<String> = words(output).map(str::to_lowercase).collect();
        let kept = kept_needed
            .iter()
            .filter(|w| output_words.iter().any(|o| same_word(w, o)))
            .count();
        if (kept as f64) < MIN_KEPT_CONTENT * kept_needed.len() as f64 {
            return false;
        }
    }

    // New numbers: digits the input did not contain as digits or as words.
    let input_numbers = numbers(input);
    let invented_number = numbers(output)
        .iter()
        .any(|n| !input_numbers.contains(n) && n.len() > 1 && !input_lower.contains(n.as_str()));
    if invented_number {
        return false;
    }

    // New names: capitalised words the input never said.
    let invented_name = names(output)
        .iter()
        .any(|name| !input_lower.contains(name.as_str()) && !known.contains(name));
    !invented_name
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn faithful_cleanup_passes() {
        assert!(ai_output_is_safe(
            "so um the plan is first call raj second send the deck by friday actually thursday",
            "The plan is:\n1. Call Raj\n2. Send the deck by Thursday",
            &[],
        ));
        assert!(ai_output_is_safe(
            "me and him goes there every day",
            "He and I go there every day.",
            &[],
        ));
    }

    #[test]
    fn invented_names_and_numbers_fail() {
        assert!(!ai_output_is_safe(
            "send the report to the team",
            "Send the report to Priya and the team.",
            &[],
        ));
        assert!(!ai_output_is_safe(
            "the budget is small this year",
            "The budget is 5000 this year.",
            &[],
        ));
    }

    #[test]
    fn known_words_may_appear() {
        assert!(ai_output_is_safe(
            "i love using silk tone every day",
            "I love using Silktone every day.",
            &["Silktone".to_string()],
        ));
    }

    #[test]
    fn dropped_content_or_long_answers_fail() {
        assert!(!ai_output_is_safe(
            "please book the meeting room for friday afternoon with marketing",
            "Okay.",
            &[],
        ));
        assert!(!ai_output_is_safe(
            "what is the capital of france",
            "What is the capital of France? The capital of France is Paris, a city known for the Eiffel Tower and its museums.",
            &[],
        ));
    }
}

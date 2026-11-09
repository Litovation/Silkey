//! Spoken punctuation and editing words (build spec feature 7).
//!
//! "Hi Raj comma new line thanks for the update period" becomes
//! "Hi Raj,\nThanks for the update." without any AI. Words that are also
//! ordinary English ("period", "colon", "dash", "dot") only count as
//! punctuation where they cannot be ordinary words: at the end, before a new
//! line, or before a word the model already started a new sentence with.

use once_cell::sync::Lazy;
use regex::Regex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mark {
    /// Attaches to the word before it: . , ? ! : ;
    Trailing(&'static str),
    Dash,
    OpenQuote,
    CloseQuote,
    OpenBracket,
    CloseBracket,
    At,
    NewLine,
    NewParagraph,
}

impl Mark {
    /// Marks after which the next word starts a sentence.
    fn ends_sentence(self) -> bool {
        matches!(
            self,
            Mark::Trailing(".") | Mark::Trailing("?") | Mark::Trailing("!")
        ) || matches!(self, Mark::NewLine | Mark::NewParagraph)
    }
}

/// Spoken forms, longest first so "question mark" wins over a lone "mark".
/// The flag marks words that are also ordinary English and need context.
const COMMANDS: &[(&[&str], Mark, bool)] = &[
    (&["new", "paragraph"], Mark::NewParagraph, false),
    (&["next", "paragraph"], Mark::NewParagraph, false),
    (&["new", "line"], Mark::NewLine, false),
    (&["next", "line"], Mark::NewLine, false),
    (&["press", "enter"], Mark::NewLine, false),
    (&["hit", "enter"], Mark::NewLine, false),
    (&["line", "break"], Mark::NewLine, false),
    (&["question", "mark"], Mark::Trailing("?"), false),
    (&["exclamation", "mark"], Mark::Trailing("!"), false),
    (&["exclamation", "point"], Mark::Trailing("!"), false),
    (&["full", "stop"], Mark::Trailing("."), false),
    (&["semi", "colon"], Mark::Trailing(";"), false),
    (&["open", "quote"], Mark::OpenQuote, false),
    (&["close", "quote"], Mark::CloseQuote, false),
    (&["end", "quote"], Mark::CloseQuote, false),
    (&["open", "bracket"], Mark::OpenBracket, false),
    (&["close", "bracket"], Mark::CloseBracket, false),
    (&["open", "parenthesis"], Mark::OpenBracket, false),
    (&["close", "parenthesis"], Mark::CloseBracket, false),
    (&["at", "the", "rate"], Mark::At, false),
    (&["at", "sign"], Mark::At, false),
    (&["comma"], Mark::Trailing(","), false),
    (&["semicolon"], Mark::Trailing(";"), false),
    (&["period"], Mark::Trailing("."), true),
    (&["colon"], Mark::Trailing(":"), true),
    (&["dash"], Mark::Dash, true),
    // "Enter" alone is a line break only where it cannot be the verb.
    (&["enter"], Mark::NewLine, true),
];

enum Piece {
    Word(String),
    Mark(Mark),
}

/// Lowercase with surrounding punctuation removed, for matching spoken forms.
fn bare(token: &str) -> String {
    token
        .trim_matches(|c: char| !c.is_alphanumeric())
        .to_lowercase()
}

fn strip_trailing_punct(word: &mut String) {
    while word.ends_with(['.', ',', ';', ':', '!', '?']) {
        word.pop();
    }
}

/// Whether an ambiguous word at `next` may be read as punctuation: nothing
/// follows, a line break follows, or the model capitalised the next word.
fn ambiguous_allowed(tokens: &[&str], next: usize) -> bool {
    let Some(following) = tokens.get(next) else {
        return true;
    };
    let lower = bare(following);
    if lower == "new" || lower == "next" {
        return true;
    }
    following
        .chars()
        .find(|c| c.is_alphabetic())
        .is_some_and(|c| c.is_uppercase())
        && lower != "i"
}

fn match_command(tokens: &[&str], at: usize) -> Option<(Mark, usize)> {
    for (words, mark, ambiguous) in COMMANDS {
        let end = at + words.len();
        if end > tokens.len() {
            continue;
        }
        let matches = words
            .iter()
            .enumerate()
            .all(|(offset, word)| bare(tokens[at + offset]) == *word);
        if !matches {
            continue;
        }
        // A token that carries a letter or digit beyond the spoken word
        // ("comma-separated") is not a command.
        if tokens[at..end]
            .iter()
            .zip(words.iter())
            .any(|(token, word)| bare(token).len() != word.len())
        {
            continue;
        }
        if *ambiguous && !ambiguous_allowed(tokens, end) {
            continue;
        }
        return Some((*mark, words.len()));
    }
    None
}

fn capitalize_first(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

static EMAIL_DOT: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)(\S+@[\w.-]+?)\s+dot\s+([a-z0-9-]+)").unwrap());

/// Join "raj@gmail dot com" into "raj@gmail.com".
fn join_email_dots(text: &str) -> String {
    let mut current = text.to_string();
    loop {
        let next = EMAIL_DOT.replace(&current, "$1.$2").to_string();
        if next == current {
            return current;
        }
        current = next;
    }
}

/// Replace spoken punctuation and line-break words with the marks they name.
/// "literal comma" keeps the word itself.
pub fn apply_dictation_commands(text: &str) -> String {
    let tokens: Vec<&str> = text.split_whitespace().collect();
    if tokens.is_empty() {
        return text.to_string();
    }

    let mut pieces: Vec<Piece> = Vec::with_capacity(tokens.len());
    let mut changed = false;
    let mut i = 0;
    while i < tokens.len() {
        if bare(tokens[i]) == "literal" {
            if let Some((_, len)) = match_command(&tokens, i + 1) {
                for token in &tokens[i + 1..i + 1 + len] {
                    pieces.push(Piece::Word(bare(token)));
                }
                changed = true;
                i += 1 + len;
                continue;
            }
        }
        if let Some((mark, len)) = match_command(&tokens, i) {
            // Our mark replaces whatever punctuation the model put there.
            if let Some(Piece::Word(previous)) = pieces.last_mut() {
                if !matches!(mark, Mark::OpenQuote | Mark::OpenBracket) {
                    strip_trailing_punct(previous);
                }
            }
            pieces.push(Piece::Mark(mark));
            changed = true;
            i += len;
            continue;
        }
        pieces.push(Piece::Word(tokens[i].to_string()));
        i += 1;
    }

    if !changed {
        return text.to_string();
    }

    render(&pieces)
}

fn render(pieces: &[Piece]) -> String {
    let mut out = String::new();
    // Whether the next word starts a sentence (after . ? ! or a line break).
    let mut capitalize_next = false;
    // Whether the next word attaches without a space (after an opener or @).
    let mut glue_next = true;
    for piece in pieces {
        match piece {
            Piece::Word(word) => {
                let word = word.trim_start_matches([',', '.', ';', ':']);
                if word.is_empty() {
                    continue;
                }
                if !glue_next {
                    out.push(' ');
                }
                if capitalize_next {
                    out.push_str(&capitalize_first(word));
                } else {
                    out.push_str(word);
                }
                capitalize_next = false;
                glue_next = false;
            }
            Piece::Mark(mark) => {
                match mark {
                    Mark::Trailing(symbol) => {
                        trim_end_spaces(&mut out);
                        out.push_str(symbol);
                        glue_next = false;
                    }
                    Mark::Dash => {
                        trim_end_spaces(&mut out);
                        out.push_str(" -");
                        glue_next = false;
                    }
                    Mark::OpenQuote => {
                        if !glue_next {
                            out.push(' ');
                        }
                        out.push('"');
                        glue_next = true;
                    }
                    Mark::CloseQuote => {
                        trim_end_spaces(&mut out);
                        out.push('"');
                        glue_next = false;
                    }
                    Mark::OpenBracket => {
                        if !glue_next {
                            out.push(' ');
                        }
                        out.push('(');
                        glue_next = true;
                    }
                    Mark::CloseBracket => {
                        trim_end_spaces(&mut out);
                        out.push(')');
                        glue_next = false;
                    }
                    Mark::At => {
                        trim_end_spaces(&mut out);
                        out.push('@');
                        glue_next = true;
                    }
                    Mark::NewLine => {
                        trim_end_spaces(&mut out);
                        out.push('\n');
                        glue_next = true;
                    }
                    Mark::NewParagraph => {
                        trim_end_spaces(&mut out);
                        out.push_str("\n\n");
                        glue_next = true;
                    }
                }
                if mark.ends_sentence() {
                    capitalize_next = true;
                }
            }
        }
    }
    join_email_dots(out.trim_start_matches(' '))
        .trim_end_matches(' ')
        .to_string()
}

fn trim_end_spaces(out: &mut String) {
    while out.ends_with(' ') {
        out.pop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spec_example() {
        assert_eq!(
            apply_dictation_commands("Hi Raj comma new line thanks for the update period"),
            "Hi Raj,\nThanks for the update."
        );
    }

    #[test]
    fn model_punctuation_around_commands_is_replaced() {
        assert_eq!(
            apply_dictation_commands("Hi Raj, comma, new line, thanks for the update, period."),
            "Hi Raj,\nThanks for the update."
        );
    }

    #[test]
    fn questions_exclamations_and_paragraphs() {
        assert_eq!(
            apply_dictation_commands(
                "are you coming question mark new paragraph see you exclamation mark"
            ),
            "are you coming?\n\nSee you!"
        );
    }

    #[test]
    fn indian_english_email() {
        assert_eq!(
            apply_dictation_commands("mail raj at the rate gmail dot com today"),
            "mail raj@gmail.com today"
        );
    }

    #[test]
    fn literal_keeps_the_word() {
        assert_eq!(
            apply_dictation_commands("type the word literal comma here"),
            "type the word comma here"
        );
    }

    #[test]
    fn ordinary_period_and_colon_stay_words() {
        let text = "The trial period ends soon and the colon is fine";
        assert_eq!(apply_dictation_commands(text), text);
    }

    #[test]
    fn quotes_and_brackets() {
        assert_eq!(
            apply_dictation_commands(
                "he said open quote hello close quote open bracket twice close bracket"
            ),
            "he said \"hello\" (twice)"
        );
    }

    #[test]
    fn text_without_commands_is_untouched() {
        let text = "Nothing  special here.";
        assert_eq!(apply_dictation_commands(text), text);
    }
}

//! Rule-based text cleanup that runs on every dictation, offline (build spec
//! "The text quality pipeline"). Cheap rules run here; the optional AI step
//! later works on already-tidy text.
//!
//! Order, after custom words, fillers and stutters (text.rs):
//! 1. loop guard (cut a phrase repeated more than three times)
//! 2. snippets: a dictation that is only a trigger becomes the snippet and
//!    skips every other step; "insert <trigger>" is replaced in place
//! 3. self-corrections ("5, actually 6pm")
//! 4. spoken punctuation and line breaks
//! 5. numbers, dates, money and times
//! 6. lists
//!
//! Steps 3 to 6 are English rules and only run when the output is English or
//! its language is unknown. Every step returns its input unchanged when it
//! finds nothing to do, and the caller runs all of it inside
//! `fail_open_text_transform`, so a bug can never lose a dictation.

pub mod commands;
pub mod corrections;
pub mod lists;
pub mod numbers;
pub mod phantom;
pub mod safety;
pub mod snippets;

/// Which rule steps run, from the user's Writing settings.
#[derive(Debug, Clone, Default)]
pub struct RuleCleanup<'a> {
    pub spoken_punctuation: bool,
    pub numbers: bool,
    pub lists: bool,
    pub self_corrections: bool,
    /// Whether the English-only rules apply to this text.
    pub english: bool,
    /// (trigger, text) pairs.
    pub snippets: &'a [(String, String)],
}

/// Run the rule steps in order.
pub fn apply_rule_cleanup(text: &str, options: &RuleCleanup) -> String {
    let mut current = phantom::collapse_loops(text);

    if let Some(body) = snippets::whole_match(&current, options.snippets) {
        return snippets::expand_placeholders(body);
    }
    if !options.snippets.is_empty() {
        let inserted = snippets::replace_inserts(&current, options.snippets);
        if inserted != current {
            current = snippets::expand_placeholders(&inserted);
        }
    }

    if !options.english {
        return current;
    }
    if options.self_corrections {
        current = corrections::apply_self_corrections(&current);
    }
    if options.spoken_punctuation {
        current = commands::apply_dictation_commands(&current);
    }
    if options.numbers {
        current = numbers::format_numbers(&current);
    }
    if options.lists {
        current = lists::format_spoken_lists(&current);
    }
    current
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_on(snippets: &[(String, String)]) -> RuleCleanup<'_> {
        RuleCleanup {
            spoken_punctuation: true,
            numbers: true,
            lists: true,
            self_corrections: true,
            english: true,
            snippets,
        }
    }

    #[test]
    fn steps_compose() {
        assert_eq!(
            apply_rule_cleanup(
                "Hi Raj comma new line the call is at five pm, actually six pm period",
                &all_on(&[])
            ),
            "Hi Raj,\nThe call is at 6 PM."
        );
    }

    #[test]
    fn snippet_skips_everything_else() {
        let snippets = vec![("sign off".to_string(), "Best, Bharat".to_string())];
        assert_eq!(
            apply_rule_cleanup("Sign off.", &all_on(&snippets)),
            "Best, Bharat"
        );
    }

    #[test]
    fn non_english_text_only_gets_language_free_steps() {
        let options = RuleCleanup {
            english: false,
            ..all_on(&[])
        };
        let text = "मैं कल पाँच बजे आऊँगा comma";
        assert_eq!(apply_rule_cleanup(text, &options), text);
    }
}

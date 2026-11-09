//! Spoken self-corrections, rules layer (build spec feature 1, layer 1).
//!
//! "Send it at 5, actually 6pm" becomes "Send it at 6pm"; "Meet Raj, sorry,
//! no, Priya" becomes "Meet Priya". A correction only counts when the trigger
//! follows a comma (the model's mark for a pause) and the words after it are
//! the same kind of thing as the words before: number for number, time for
//! time, day for day, name for name, or a repeated lead word ("to Pune, I
//! mean to Delhi"). Anything else is left exactly as it was, so "I actually
//! liked it" never changes.

const TRIGGERS: &[&[&str]] = &[
    &["scratch", "that"],
    &["no", "wait"],
    &["i", "mean"],
    &["make", "that"],
    &["or", "rather"],
    &["actually"],
    &["sorry"],
];

/// Triggers that also count without a pause before them ("at 5 PM actually at
/// 8 PM"), but only when a number, time or day follows; see `strict_target`.
const LOOSE_TRIGGERS: &[&str] = &["actually", "sorry", "i", "or"];

/// Extra words that often trail a trigger ("sorry, no, Priya").
const TRAILERS: &[&str] = &["no", "wait", "sorry", "actually"];

const DAYS: &[&str] = &[
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "today",
    "tomorrow",
    "tonight",
    "yesterday",
];

const NUMBER_WORDS: &[&str] = &[
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
    "hundred",
    "thousand",
    "noon",
    "midnight",
    "half",
];

const TIME_SUFFIXES: &[&str] = &["am", "pm", "a.m.", "p.m.", "o'clock", "oclock"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Number,
    Day,
    Name,
}

fn bare(token: &str) -> String {
    token
        .trim_matches(|c: char| !c.is_alphanumeric() && c != '\'')
        .to_lowercase()
}

fn kind_of(token: &str) -> Option<Kind> {
    let lower = bare(token);
    if lower.is_empty() {
        return None;
    }
    let digits = lower.trim_end_matches(|c: char| c.is_alphabetic() || c == '.');
    if !digits.is_empty()
        && digits
            .chars()
            .all(|c| c.is_ascii_digit() || c == ':' || c == '.')
    {
        return Some(Kind::Number);
    }
    if NUMBER_WORDS.contains(&lower.as_str()) {
        return Some(Kind::Number);
    }
    if DAYS.contains(&lower.as_str()) {
        return Some(Kind::Day);
    }
    let core = token.trim_matches(|c: char| !c.is_alphanumeric());
    if core.len() > 1
        && core.chars().next().is_some_and(|c| c.is_uppercase())
        && core.chars().skip(1).all(|c| c.is_lowercase())
    {
        return Some(Kind::Name);
    }
    None
}

fn ends_with_pause(token: &str) -> bool {
    token.ends_with(',') || token.ends_with('—') || token.ends_with("...") || token.ends_with('-')
}

fn ends_sentence(token: &str) -> bool {
    token.ends_with(['.', '?', '!'])
}

fn match_trigger(tokens: &[&str], at: usize) -> Option<usize> {
    TRIGGERS.iter().find_map(|words| {
        let end = at + words.len();
        (end <= tokens.len()
            && words
                .iter()
                .enumerate()
                .all(|(offset, word)| bare(tokens[at + offset]) == *word))
        .then_some(words.len())
    })
}

/// Length of the item that starts the correction: a number keeps a following
/// unit ("6 pm"), a name keeps a following surname.
fn item_len(tokens: &[&str], kind: Kind) -> usize {
    let mut len = 1;
    while let Some(next) = tokens.get(len) {
        let lower = bare(next);
        let continues = match kind {
            Kind::Number => {
                TIME_SUFFIXES.contains(&lower.as_str()) || kind_of(next) == Some(Kind::Number)
            }
            Kind::Name => kind_of(next) == Some(Kind::Name),
            Kind::Day => false,
        };
        if !continues || ends_with_pause(tokens[len - 1]) || ends_sentence(tokens[len - 1]) {
            break;
        }
        len += 1;
    }
    len
}

/// Without a pause, a correction must name a number, time or day, directly
/// ("actually 8 PM") or after a repeated lead word ("actually at 8 PM"), so
/// "I actually liked it" or "sorry I'm late" never change.
fn strict_target(after: &[&str]) -> bool {
    let is_target = |token: &&str| matches!(kind_of(token), Some(Kind::Number | Kind::Day));
    match after {
        [first, ..] if is_target(first) => true,
        [first, second, ..] => kind_of(first).is_none() && is_target(second),
        _ => false,
    }
}

/// Where the corrected item starts in `before`, if the correction applies.
/// `across_sentence`: the trigger opened a new sentence ("5 PM. Actually, 8
/// PM."), so the sentence before it is the one being corrected.
fn replacement_start(before: &[String], after: &[&str], across_sentence: bool) -> Option<usize> {
    let first = after.first()?;
    let search = if across_sentence {
        &before[..before.len().saturating_sub(1)]
    } else {
        before
    };
    // Only look back over the current clause, at most six words.
    let clause_start = search
        .iter()
        .rposition(|token| ends_sentence(token))
        .map(|position| position + 1)
        .unwrap_or(0);
    let window_start = clause_start.max(before.len().saturating_sub(6));

    let after_kind = kind_of(first).filter(|kind| {
        // "I" and a sentence-initial capital are not names.
        !(*kind == Kind::Name && bare(first) == "i")
    });
    if let Some(kind) = after_kind {
        // The earliest token of the matching run, so "5 pm" is replaced whole.
        let last = (window_start..before.len()).rev().find(|&index| {
            let is_sentence_start = index == clause_start;
            kind_of(&before[index]) == Some(kind) && !(kind == Kind::Name && is_sentence_start)
        })?;
        let mut start = last;
        while start > window_start
            && kind_of(&before[start - 1]) == Some(kind)
            && !(kind == Kind::Name && start - 1 == clause_start)
        {
            start -= 1;
        }
        return Some(start);
    }

    // A repeated lead word: "to Pune, I mean to Delhi".
    let lead = bare(first);
    if lead.len() < 2 {
        return None;
    }
    (window_start..before.len())
        .rev()
        .find(|&index| bare(&before[index]) == lead)
}

/// Apply spoken self-corrections. Text with no clear correction is returned
/// unchanged.
pub fn apply_self_corrections(text: &str) -> String {
    let tokens: Vec<&str> = text.split_whitespace().collect();
    if tokens.len() < 3 || text.contains('\n') {
        return text.to_string();
    }

    let mut out: Vec<String> = Vec::with_capacity(tokens.len());
    let mut changed = false;
    // After "scratch that" removes a clause, the next word starts a sentence.
    let mut capitalize_next = false;
    let mut i = 0;
    while i < tokens.len() {
        let after_pause = out.last().is_some_and(|previous| ends_with_pause(previous));
        let after_sentence = out.last().is_some_and(|previous| ends_sentence(previous));
        let trigger = if after_pause {
            match_trigger(&tokens, i)
        } else if !out.is_empty() && LOOSE_TRIGGERS.contains(&bare(tokens[i]).as_str()) {
            // No pause: only the plainest triggers, checked further below.
            match_trigger(&tokens, i)
        } else {
            None
        };
        let strict = !after_pause;
        let Some(trigger_len) = trigger else {
            if capitalize_next {
                out.push(capitalize_first(tokens[i]));
                capitalize_next = false;
            } else {
                out.push(tokens[i].to_string());
            }
            i += 1;
            continue;
        };

        let is_scratch = bare(tokens[i]) == "scratch";
        let mut next = i + trigger_len;
        while next < tokens.len()
            && ends_with_pause(tokens[next - 1])
            && TRAILERS.contains(&bare(tokens[next]).as_str())
            && tokens.len() > next + 1
        {
            next += 1;
        }

        if is_scratch {
            // Drop the clause before "scratch that".
            let clause_start = out
                .iter()
                .rposition(|token| ends_sentence(token))
                .map(|position| position + 1)
                .unwrap_or(0);
            out.truncate(clause_start);
            changed = true;
            capitalize_next = true;
            i = next;
            continue;
        }

        let rest = &tokens[next..];
        let start = if strict && !strict_target(rest) {
            None
        } else {
            replacement_start(&out, rest, strict && after_sentence)
        };
        match start {
            Some(start) => {
                let kind = kind_of(rest[0]).unwrap_or(Kind::Name);
                let len = if kind_of(rest[0]).is_some() {
                    item_len(rest, kind)
                } else {
                    // Lead-word repair: the corrected phrase runs to the pause.
                    rest.iter()
                        .position(|token| ends_with_pause(token) || ends_sentence(token))
                        .map(|position| position + 1)
                        .unwrap_or(rest.len())
                };
                // Across a full stop, the new sentence must be only the
                // correction ("Actually, at 8 PM."), not a new thought that
                // happens to start with a number ("Actually, 5 people came").
                let whole_sentence = len == rest.len() || ends_sentence(rest[len - 1]);
                if strict && after_sentence && !whole_sentence {
                    out.push(tokens[i].to_string());
                    i += 1;
                    continue;
                }
                // Keep the punctuation that ended the replaced item.
                out.truncate(start);
                for token in &rest[..len] {
                    out.push(token.to_string());
                }
                // The comma after the correction was the speaker's pause, not
                // part of the sentence ("Ask Kavya, to join").
                if next + len < tokens.len() {
                    if let Some(last) = out.last_mut() {
                        if last.ends_with(',') {
                            last.pop();
                        }
                    }
                }
                changed = true;
                i = next + len;
            }
            None => {
                out.push(tokens[i].to_string());
                i += 1;
            }
        }
    }

    if !changed {
        return text.to_string();
    }
    tidy(out)
}

fn capitalize_first(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// Join tokens, drop a dangling comma before the end, and keep the first
/// letter capitalised if the input started that way.
fn tidy(tokens: Vec<String>) -> String {
    let mut text = tokens.join(" ");
    while text.ends_with(',') {
        text.pop();
    }
    text = text.replace(", .", ".").replace(",.", ".");
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn number_correction() {
        assert_eq!(
            apply_self_corrections("Send it at 5, actually 6pm"),
            "Send it at 6pm"
        );
        assert_eq!(
            apply_self_corrections("Call me at 5 pm, sorry, 6 pm."),
            "Call me at 6 pm."
        );
    }

    #[test]
    fn name_correction_with_trailer() {
        assert_eq!(
            apply_self_corrections("Meet Raj, sorry, no, Priya"),
            "Meet Priya"
        );
    }

    #[test]
    fn day_correction() {
        assert_eq!(
            apply_self_corrections("Let's meet on Monday, no wait, Tuesday."),
            "Let's meet on Tuesday."
        );
    }

    #[test]
    fn lead_word_correction() {
        assert_eq!(
            apply_self_corrections("I'm flying to Pune, I mean to Delhi tomorrow"),
            "I'm flying to Delhi tomorrow"
        );
    }

    #[test]
    fn scratch_that_drops_the_clause() {
        assert_eq!(
            apply_self_corrections(
                "Thanks for the update. This is wrong, scratch that, see you soon."
            ),
            "Thanks for the update. See you soon."
        );
    }

    #[test]
    fn keeps_ordinary_uses() {
        for text in [
            "I actually liked it",
            "Actually, I liked it a lot",
            "It costs 5, sorry for the delay",
            "I met Raj, sorry, I was late",
            "It was good, actually.",
            "Sorry, I can't make it today",
        ] {
            assert_eq!(apply_self_corrections(text), text, "{text}");
        }
    }
}

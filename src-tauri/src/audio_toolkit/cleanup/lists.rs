//! Spoken lists become real lists (build spec feature 3).
//!
//! "Three things: first, call Raj, second, send the deck, third, book the
//! room" becomes an intro line and a numbered list. A list needs at least two
//! markers in order (first/second/third, number one/number two, or one/two/
//! three), each at the start of a clause. "First of all" and "one of them"
//! never start a list. "Bullet point" / "next point" make a bulleted list.

const ORDINALS: &[&str] = &[
    "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
];
const CARDINALS: &[&str] = &[
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Style {
    Ordinal,
    NumberWord,
    Cardinal,
    Bullet,
}

/// A marker found at a clause start: where it begins (byte offset into the
/// line), where the item text after it begins, and its position in the list.
#[derive(Debug, Clone, Copy)]
struct Marker {
    start: usize,
    item_start: usize,
    index: usize,
    style: Style,
}

fn words_with_offsets(line: &str) -> Vec<(usize, &str)> {
    let mut out = Vec::new();
    let mut start = None;
    for (i, c) in line.char_indices() {
        if c.is_whitespace() {
            if let Some(s) = start.take() {
                out.push((s, &line[s..i]));
            }
        } else if start.is_none() {
            start = Some(i);
        }
    }
    if let Some(s) = start {
        out.push((s, &line[s..]));
    }
    out
}

fn bare(word: &str) -> String {
    word.trim_matches(|c: char| !c.is_alphanumeric())
        .to_lowercase()
}

fn ends_clause(word: &str) -> bool {
    word.ends_with([',', '.', ';', ':', '!', '?'])
}

fn find_markers(line: &str) -> Vec<Marker> {
    let words = words_with_offsets(line);
    let mut markers = Vec::new();
    for (k, (offset, word)) in words.iter().enumerate() {
        // "number one" and "bullet point" are explicit anywhere; ordinals and
        // bare numbers only count at the start of a clause.
        let at_clause_start = k == 0 || ends_clause(words[k - 1].1);
        let lower = bare(word);
        let explicit = lower == "number" || lower == "bullet" || lower == "next";
        if !at_clause_start && !explicit {
            continue;
        }
        let next = words.get(k + 1).map(|(_, w)| bare(w));
        let item_after = |len: usize| words.get(k + len).map(|(o, _)| *o).unwrap_or(line.len());
        // "first of all", "one of them", "second hand" are ordinary words.
        if next.as_deref() == Some("of") {
            continue;
        }
        if let Some(index) = ORDINALS.iter().position(|o| *o == lower) {
            markers.push(Marker {
                start: *offset,
                item_start: item_after(1),
                index,
                style: Style::Ordinal,
            });
        } else if lower == "number" {
            if let Some(index) = next
                .as_deref()
                .and_then(|n| CARDINALS.iter().position(|c| *c == n))
            {
                markers.push(Marker {
                    start: *offset,
                    item_start: item_after(2),
                    index,
                    style: Style::NumberWord,
                });
            }
        } else if let Some(index) = CARDINALS.iter().position(|c| *c == lower) {
            // A bare "one", "two" only counts when the model set it off with
            // a comma or full stop ("One, call Raj.").
            if ends_clause(word) {
                markers.push(Marker {
                    start: *offset,
                    item_start: item_after(1),
                    index,
                    style: Style::Cardinal,
                });
            }
        } else if (lower == "bullet" || lower == "next") && next.as_deref() == Some("point") {
            markers.push(Marker {
                start: *offset,
                item_start: item_after(2),
                index: 0,
                style: Style::Bullet,
            });
        }
    }
    markers
}

/// The longest run of markers of one style that counts 1, 2, 3... (or any
/// run of bullets), at least two long.
fn best_run(markers: &[Marker]) -> Option<Vec<Marker>> {
    let mut best: Option<Vec<Marker>> = None;
    for (i, first) in markers.iter().enumerate() {
        if first.style != Style::Bullet && first.index != 0 {
            continue;
        }
        let mut run = vec![*first];
        for marker in &markers[i + 1..] {
            let last = run.last().unwrap();
            let follows = marker.style == first.style
                && (first.style == Style::Bullet || marker.index == last.index + 1);
            if follows {
                run.push(*marker);
            }
        }
        if run.len() >= 2 && best.as_ref().is_none_or(|b| run.len() > b.len()) {
            best = Some(run);
        }
    }
    best
}

fn clean_item(text: &str) -> String {
    let trimmed = text
        .trim()
        .trim_start_matches([',', ':', '-'])
        .trim()
        .trim_end_matches([',', ';', '.'])
        .trim();
    let mut chars = trimmed.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

fn format_line(line: &str) -> String {
    let markers = find_markers(line);
    let Some(run) = best_run(&markers) else {
        return line.to_string();
    };

    let intro = line[..run[0].start].trim_end();
    let mut items: Vec<String> = Vec::with_capacity(run.len());
    let mut tail = "";
    for (k, marker) in run.iter().enumerate() {
        let end = run.get(k + 1).map(|m| m.start).unwrap_or(line.len());
        let mut item = &line[marker.item_start.min(end)..end];
        if k + 1 == run.len() {
            // The last item ends at its sentence end; the rest follows the list.
            if let Some(stop) = item.find(['.', '!', '?']) {
                tail = item[stop + 1..].trim();
                item = &item[..stop];
            }
        }
        let cleaned = clean_item(item);
        if cleaned.is_empty() {
            return line.to_string();
        }
        items.push(cleaned);
    }

    let mut out = String::new();
    if !intro.is_empty() {
        out.push_str(intro.trim_end_matches([',', '.', ';', ':']));
        out.push_str(":\n");
    }
    let bullets = run[0].style == Style::Bullet;
    for (k, item) in items.iter().enumerate() {
        if k > 0 {
            out.push('\n');
        }
        if bullets {
            out.push_str("- ");
        } else {
            out.push_str(&format!("{}. ", k + 1));
        }
        out.push_str(item);
    }
    if !tail.is_empty() {
        out.push_str("\n\n");
        out.push_str(tail);
    }
    out
}

/// Turn spoken lists into numbered or bulleted lists. Lines without a clear
/// list are returned unchanged.
pub fn format_spoken_lists(text: &str) -> String {
    text.split('\n')
        .map(format_line)
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spec_example() {
        assert_eq!(
            format_spoken_lists(
                "Three things: first, call Raj, second, send the deck, third, book the room"
            ),
            "Three things:\n1. Call Raj\n2. Send the deck\n3. Book the room"
        );
    }

    #[test]
    fn model_sentences_and_a_tail() {
        assert_eq!(
            format_spoken_lists(
                "For tomorrow. First, call Raj. Second, send the deck. Thanks a lot"
            ),
            "For tomorrow:\n1. Call Raj\n2. Send the deck\n\nThanks a lot"
        );
    }

    #[test]
    fn number_words_and_bullets() {
        assert_eq!(
            format_spoken_lists("number one milk number two eggs"),
            "1. Milk\n2. Eggs"
        );
        assert_eq!(
            format_spoken_lists("Groceries bullet point milk bullet point eggs"),
            "Groceries:\n- Milk\n- Eggs"
        );
    }

    #[test]
    fn ordinary_sentences_stay() {
        for text in [
            "First of all, thanks for coming.",
            "One of them is mine, two of them are yours.",
            "I came first and she came second.",
            "This is the first time.",
            "Only the second point matters.",
        ] {
            assert_eq!(format_spoken_lists(text), text, "{text}");
        }
    }
}

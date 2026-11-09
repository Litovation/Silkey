//! Numbers, dates, money and times written properly (build spec feature 4).
//!
//! English only. "twenty five dollars" becomes "$25", "march third twenty
//! twenty six" becomes "March 3, 2026", "five thirty pm" becomes "5:30 PM",
//! "fifty percent" becomes "50%". One to nine stay words unless they carry a
//! unit, time, money or percent ("one of them" stays, "five kg" becomes
//! "5 kg"); ten and above become digits. Four or more single digits in a row
//! ("nine eight seven six five") become a digit string, as phone numbers do.

const ONES: &[&str] = &[
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
];
const TENS: &[&str] = &[
    "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];
const SCALES: &[(&str, u64)] = &[
    ("thousand", 1_000),
    ("lakh", 100_000),
    ("lakhs", 100_000),
    ("million", 1_000_000),
    ("crore", 10_000_000),
    ("crores", 10_000_000),
    ("billion", 1_000_000_000),
];
const ORDINALS: &[(&str, u64)] = &[
    ("first", 1),
    ("second", 2),
    ("third", 3),
    ("fourth", 4),
    ("fifth", 5),
    ("sixth", 6),
    ("seventh", 7),
    ("eighth", 8),
    ("ninth", 9),
    ("tenth", 10),
    ("eleventh", 11),
    ("twelfth", 12),
    ("thirteenth", 13),
    ("fourteenth", 14),
    ("fifteenth", 15),
    ("sixteenth", 16),
    ("seventeenth", 17),
    ("eighteenth", 18),
    ("nineteenth", 19),
    ("twentieth", 20),
    ("thirtieth", 30),
];
const MONTHS: &[&str] = &[
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
];
const UNITS: &[&str] = &[
    "kg",
    "kgs",
    "kilogram",
    "kilograms",
    "kilo",
    "kilos",
    "gram",
    "grams",
    "g",
    "km",
    "kms",
    "kilometer",
    "kilometers",
    "kilometre",
    "kilometres",
    "meter",
    "meters",
    "metre",
    "metres",
    "cm",
    "mm",
    "mile",
    "miles",
    "mb",
    "gb",
    "tb",
    "kb",
    "liter",
    "liters",
    "litre",
    "litres",
    "ml",
    "inch",
    "inches",
    "feet",
    "foot",
    "lbs",
];

/// A whitespace token split into leading punctuation, the word, and trailing
/// punctuation, so a rewrite can keep "(twenty," as "(20,".
#[derive(Debug, Clone)]
struct Token {
    lead: String,
    word: String,
    trail: String,
}

impl Token {
    fn parse(raw: &str) -> Self {
        let start = raw.find(|c: char| c.is_alphanumeric()).unwrap_or(raw.len());
        let end = raw
            .rfind(|c: char| c.is_alphanumeric())
            .map(|i| i + raw[i..].chars().next().map_or(1, char::len_utf8))
            .unwrap_or(start);
        let (lead, rest) = raw.split_at(start);
        let (word, trail) = rest.split_at(end.saturating_sub(start).min(rest.len()));
        Token {
            lead: lead.to_string(),
            word: word.to_string(),
            trail: trail.to_string(),
        }
    }

    fn lower(&self) -> String {
        self.word.to_lowercase()
    }

    /// A comma or full stop after this token ends any number running through it.
    fn breaks(&self) -> bool {
        !self.trail.is_empty()
    }

    fn render(&self) -> String {
        format!("{}{}{}", self.lead, self.word, self.trail)
    }
}

fn ones_value(word: &str) -> Option<u64> {
    ONES.iter().position(|w| *w == word).map(|v| v as u64)
}

fn tens_value(word: &str) -> Option<u64> {
    TENS.iter()
        .position(|w| !w.is_empty() && *w == word)
        .map(|v| v as u64 * 10)
}

fn ordinal_value(word: &str) -> Option<u64> {
    if let Some((_, v)) = ORDINALS.iter().find(|(w, _)| *w == word) {
        return Some(*v);
    }
    // "3rd", "21st"
    let digits: String = word.chars().take_while(|c| c.is_ascii_digit()).collect();
    let suffix = &word[digits.len()..];
    if !digits.is_empty() && matches!(suffix, "st" | "nd" | "rd" | "th") {
        return digits.parse().ok();
    }
    None
}

fn plain_digits(word: &str) -> Option<u64> {
    (!word.is_empty() && word.len() <= 12 && word.chars().all(|c| c.is_ascii_digit()))
        .then(|| word.parse().ok())
        .flatten()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Last {
    None,
    Ones,
    Tens,
    Hundred,
    Scale,
    And,
}

/// Parse spelled-out number words starting at `at`. Returns the value, the
/// number of tokens used, and whether it started with "a" ("a hundred").
fn parse_words(tokens: &[Token], at: usize) -> Option<(u64, usize, bool)> {
    let mut total = 0u64;
    let mut current = 0u64;
    let mut last = Last::None;
    let mut used = 0;
    let mut starts_with_a = false;
    let mut i = at;
    while i < tokens.len() {
        let word = tokens[i].lower();
        let next_is =
            |pred: &dyn Fn(&str) -> bool| tokens.get(i + 1).is_some_and(|t| pred(&t.lower()));
        if word == "a" && last == Last::None {
            if next_is(&|w| w == "hundred" || SCALES.iter().any(|(s, _)| *s == w)) {
                current = 1;
                last = Last::Ones;
                starts_with_a = true;
            } else {
                break;
            }
        } else if let Some(v) = ones_value(&word) {
            if !matches!(
                last,
                Last::None | Last::Tens | Last::Hundred | Last::Scale | Last::And
            ) || (last == Last::Tens && v >= 10)
            {
                break;
            }
            current += v;
            last = Last::Ones;
        } else if let Some(v) = tens_value(&word) {
            if !matches!(last, Last::None | Last::Hundred | Last::Scale | Last::And) {
                break;
            }
            current += v;
            last = Last::Tens;
        } else if word == "hundred" {
            if !matches!(last, Last::Ones | Last::Tens) {
                break;
            }
            current *= 100;
            last = Last::Hundred;
        } else if let Some((_, scale)) = SCALES.iter().find(|(s, _)| *s == word) {
            if !matches!(last, Last::Ones | Last::Tens | Last::Hundred) {
                break;
            }
            total += current * scale;
            current = 0;
            last = Last::Scale;
        } else if word == "and" {
            if !matches!(last, Last::Hundred | Last::Scale)
                || !next_is(&|w| ones_value(w).is_some() || tens_value(w).is_some())
            {
                break;
            }
            last = Last::And;
        } else {
            break;
        }
        used = i - at + 1;
        i += 1;
        if tokens[i - 1].breaks() {
            break;
        }
    }
    if used == 0 || last == Last::And {
        return None;
    }
    Some((total + current, used, starts_with_a))
}

/// A number written either way: digits ("25") or words ("twenty five").
fn parse_number(tokens: &[Token], at: usize) -> Option<(u64, usize, bool)> {
    if let Some(v) = plain_digits(&tokens.get(at)?.word) {
        return Some((v, 1, false));
    }
    parse_words(tokens, at)
}

/// "twenty twenty six" or "nineteen ninety nine" as a year.
fn parse_year(tokens: &[Token], at: usize) -> Option<(u64, usize)> {
    if let Some(v) = plain_digits(&tokens.get(at)?.word) {
        return (1000..=2999).contains(&v).then_some((v, 1));
    }
    let first = tokens.get(at)?;
    let century = match first.lower().as_str() {
        "nineteen" => 19,
        "twenty" => 20,
        _ => {
            // "two thousand twenty six"
            let (v, len, _) = parse_words(tokens, at)?;
            return (1000..=2999).contains(&v).then_some((v, len));
        }
    };
    if first.breaks() {
        return None;
    }
    let (rest, len, _) = parse_words(tokens, at + 1)?;
    (10..=99)
        .contains(&rest)
        .then_some((century * 100 + rest, len + 1))
}

fn group_thousands(value: u64) -> String {
    let digits = value.to_string();
    if value < 10_000 {
        return digits;
    }
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out
}

fn capitalize(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// One rewrite: replaces `len` tokens with `text`, keeping the first token's
/// leading punctuation and the last token's trailing punctuation.
struct Rewrite {
    len: usize,
    text: String,
}

fn month_index(word: &str) -> Option<usize> {
    MONTHS.iter().position(|m| *m == word)
}

/// "March third (twenty twenty six)" / "March 3rd".
fn try_month_first(tokens: &[Token], at: usize) -> Option<Rewrite> {
    let month_token = &tokens[at];
    let month = month_index(&month_token.lower())?;
    // "may" is also a verb: only a capitalised "May" counts.
    if month == 4 && !month_token.word.starts_with('M') {
        return None;
    }
    if month_token.breaks() {
        return None;
    }
    let day_at = at + 1;
    let (day, day_len) = parse_day(tokens, day_at)?;
    let mut len = 1 + day_len;
    let mut text = format!("{} {}", capitalize(MONTHS[month]), day);
    if !tokens[day_at + day_len - 1].breaks() {
        if let Some((year, year_len)) = parse_year(tokens, day_at + day_len) {
            text = format!("{text}, {year}");
            len += year_len;
        }
    }
    Some(Rewrite { len, text })
}

/// "the twenty first of june (twenty twenty six)".
fn try_day_first(tokens: &[Token], at: usize) -> Option<Rewrite> {
    if tokens[at].lower() != "the" {
        return None;
    }
    let (day, day_len) = parse_day(tokens, at + 1)?;
    let of_at = at + 1 + day_len;
    if tokens.get(of_at)?.lower() != "of" {
        return None;
    }
    let month = month_index(&tokens.get(of_at + 1)?.lower())?;
    let mut len = day_len + 3;
    let mut text = format!("{} {}", capitalize(MONTHS[month]), day);
    if !tokens[of_at + 1].breaks() {
        if let Some((year, year_len)) = parse_year(tokens, of_at + 2) {
            text = format!("{text}, {year}");
            len += year_len;
        }
    }
    Some(Rewrite { len, text })
}

/// A day of the month: "third", "twenty first", "3rd", "3".
fn parse_day(tokens: &[Token], at: usize) -> Option<(u64, usize)> {
    let first = tokens.get(at)?;
    let lower = first.lower();
    if let Some(v) = ordinal_value(&lower) {
        return (1..=31).contains(&v).then_some((v, 1));
    }
    if let Some(v) = plain_digits(&lower) {
        return (1..=31).contains(&v).then_some((v, 1));
    }
    // "twenty first", "thirty first"
    let tens = tens_value(&lower)?;
    if first.breaks() {
        return None;
    }
    let ones = ordinal_value(&tokens.get(at + 1)?.lower())?;
    let v = tens + ones;
    (ones < 10 && (1..=31).contains(&v)).then_some((v, 2))
}

fn meridiem(word: &str, next: Option<&str>) -> Option<(&'static str, usize)> {
    match word {
        "am" | "a.m" => Some(("AM", 1)),
        "pm" | "p.m" => Some(("PM", 1)),
        "a" if next == Some("m") => Some(("AM", 2)),
        "p" if next == Some("m") => Some(("PM", 2)),
        _ => None,
    }
}

/// "five thirty pm", "5:30 p.m.", "seven pm", "seven o'clock".
fn try_time(tokens: &[Token], at: usize) -> Option<Rewrite> {
    let first = &tokens[at];
    let (hour, minutes, used) = if let Some((h, m)) = first.word.split_once(':') {
        let h: u64 = plain_digits(h)?;
        let m: u64 = plain_digits(m)?;
        (h, m, 1)
    } else {
        let (hour, hour_len, a) = parse_number(tokens, at)?;
        if a || hour_len != 1 {
            return None;
        }
        if first.breaks() {
            return None;
        }
        // Optional minutes: "thirty", "fifteen", "oh five".
        let after = at + 1;
        let mut minutes = 0;
        let mut minute_len = 0;
        if let Some(next) = tokens.get(after) {
            if next.lower() == "oh" {
                if let Some((m, l, _)) = parse_words(tokens, after + 1) {
                    if m < 10 && !next.breaks() {
                        minutes = m;
                        minute_len = l + 1;
                    }
                }
            } else if meridiem(
                &next.lower(),
                tokens.get(after + 1).map(|t| t.lower()).as_deref(),
            )
            .is_none()
                && next.lower() != "o'clock"
            {
                if let Some((m, l, _)) = parse_number(tokens, after) {
                    if (10..60).contains(&m) {
                        minutes = m;
                        minute_len = l;
                    }
                }
            }
        }
        (hour, minutes, 1 + minute_len)
    };
    if !(1..=12).contains(&hour) || minutes > 59 {
        return None;
    }
    let suffix_at = at + used;
    if tokens[suffix_at - 1].breaks() && first.word.contains(':') {
        return None;
    }
    let suffix_token = tokens.get(suffix_at)?;
    let suffix_lower = suffix_token.lower();
    if suffix_lower == "o'clock" && minutes == 0 {
        return Some(Rewrite {
            len: used + 1,
            text: format!("{hour} o'clock"),
        });
    }
    let next = tokens.get(suffix_at + 1).map(|t| t.lower());
    let (period, period_len) = meridiem(&suffix_lower, next.as_deref())?;
    let text = if minutes == 0 {
        format!("{hour} {period}")
    } else {
        format!("{hour}:{minutes:02} {period}")
    };
    Some(Rewrite {
        len: used + period_len,
        text,
    })
}

/// A number followed by money, percent or a unit.
fn try_quantity(tokens: &[Token], at: usize) -> Option<Rewrite> {
    let (value, len, _) = parse_number(tokens, at)?;
    if tokens[at + len - 1].breaks() {
        return None;
    }
    let unit_token = tokens.get(at + len)?;
    let unit = unit_token.lower();
    let amount = group_thousands(value);
    let (text, unit_len) = match unit.as_str() {
        "dollars" | "dollar" | "bucks" => (format!("${amount}"), 1),
        "rupees" | "rupee" => (format!("₹{amount}"), 1),
        "euros" | "euro" => (format!("€{amount}"), 1),
        "percent" => (format!("{amount}%"), 1),
        "per"
            if tokens
                .get(at + len + 1)
                .is_some_and(|t| t.lower() == "cent") =>
        {
            (format!("{amount}%"), 2)
        }
        u if UNITS.contains(&u) => (format!("{amount} {}", unit_token.word), 1),
        _ => return None,
    };
    Some(Rewrite {
        len: len + unit_len,
        text,
    })
}

/// Four or more single digits in a row: a phone or account number.
fn try_digit_string(tokens: &[Token], at: usize) -> Option<Rewrite> {
    let mut digits = String::new();
    let mut len = 0;
    while let Some(token) = tokens.get(at + len) {
        match ones_value(&token.lower()).filter(|v| *v < 10) {
            Some(v) => digits.push_str(&v.to_string()),
            None => break,
        }
        len += 1;
        if token.breaks() {
            break;
        }
    }
    (len >= 4).then_some(Rewrite { len, text: digits })
}

/// A year on its own after "in" / "since" / "by": "in twenty twenty six".
fn try_year_after_preposition(tokens: &[Token], at: usize) -> Option<Rewrite> {
    let previous = tokens.get(at.checked_sub(1)?)?;
    if !matches!(
        previous.lower().as_str(),
        "in" | "since" | "by" | "of" | "year"
    ) {
        return None;
    }
    // Only the "twenty twenty six" shape; plain numbers are handled below.
    if !matches!(tokens[at].lower().as_str(), "nineteen" | "twenty") {
        return None;
    }
    let (year, len) = parse_year(tokens, at)?;
    (len >= 2).then_some(Rewrite {
        len,
        text: year.to_string(),
    })
}

/// Ten and above, spelled out, become digits. "a hundred" stays an idiom.
fn try_plain(tokens: &[Token], at: usize) -> Option<Rewrite> {
    if plain_digits(&tokens[at].word).is_some() {
        return None;
    }
    let (value, len, starts_with_a) = parse_words(tokens, at)?;
    if starts_with_a || value < 10 {
        return None;
    }
    Some(Rewrite {
        len,
        text: group_thousands(value),
    })
}

fn rewrite_line(line: &str) -> String {
    let tokens: Vec<Token> = line
        .split(' ')
        .filter(|t| !t.is_empty())
        .map(Token::parse)
        .collect();
    if tokens.is_empty() {
        return line.to_string();
    }
    let mut out: Vec<String> = Vec::with_capacity(tokens.len());
    let mut i = 0;
    while i < tokens.len() {
        let rewrite = try_month_first(&tokens, i)
            .or_else(|| try_day_first(&tokens, i))
            .or_else(|| try_time(&tokens, i))
            .or_else(|| try_quantity(&tokens, i))
            .or_else(|| try_digit_string(&tokens, i))
            .or_else(|| try_year_after_preposition(&tokens, i))
            .or_else(|| try_plain(&tokens, i));
        match rewrite {
            Some(Rewrite { len, text }) => {
                let lead = &tokens[i].lead;
                let trail = &tokens[i + len - 1].trail;
                out.push(format!("{lead}{text}{trail}"));
                i += len;
            }
            None => {
                out.push(tokens[i].render());
                i += 1;
            }
        }
    }
    out.join(" ")
}

/// Write spoken numbers, dates, money and times in their usual written form.
pub fn format_numbers(text: &str) -> String {
    text.split('\n')
        .map(rewrite_line)
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(input: &str, expected: &str) {
        assert_eq!(format_numbers(input), expected, "input: {input}");
    }

    #[test]
    fn spec_examples() {
        check("twenty five dollars", "$25");
        check("march third twenty twenty six", "March 3, 2026");
        check("five thirty pm", "5:30 PM");
        check("fifty percent", "50%");
        check("five kg", "5 kg");
    }

    #[test]
    fn small_numbers_stay_words() {
        check("one of them is here", "one of them is here");
        check("I have two kids", "I have two kids");
        check(
            "I've told you a hundred times",
            "I've told you a hundred times",
        );
    }

    #[test]
    fn larger_numbers_become_digits() {
        check("we invited twenty five people", "we invited 25 people");
        check("I paid three hundred and fifty rupees.", "I paid ₹350.");
        check(
            "about twelve thousand five hundred users",
            "about 12,500 users",
        );
    }

    #[test]
    fn times() {
        check("send it at six pm tomorrow", "send it at 6 PM tomorrow");
        check("meet at 5:30 p.m.", "meet at 5:30 PM.");
        check("wake me at seven o'clock", "wake me at 7 o'clock");
        check("at nine oh five am", "at 9:05 AM");
    }

    #[test]
    fn dates() {
        check(
            "the meeting is on the twenty first of june",
            "the meeting is on June 21",
        );
        check("due on March 3rd, please", "due on March 3, please");
        check("it may rain", "it may rain");
        check("we started in twenty twenty two", "we started in 2022");
    }

    #[test]
    fn phone_numbers() {
        check(
            "my number is nine eight seven six five",
            "my number is 98765",
        );
    }

    #[test]
    fn punctuation_is_kept() {
        check("It costs twenty dollars, right?", "It costs $20, right?");
        check("Twenty five people came.", "25 people came.");
    }

    #[test]
    fn commas_stop_numbers() {
        check("one, two, three", "one, two, three");
    }
}

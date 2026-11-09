//! Text quality tests (build spec "Quality testing"): pairs of raw model
//! text and the text Silktone should paste, run through the rule-based
//! cleanup with every Writing switch on. Each set has the pass mark the spec
//! sets for it; a set below its mark fails and lists the misses.
//!
//! Sets live in tests/text_quality/*.tsv: one `input<TAB>expected` per line,
//! `\n` for a line break, `#` for comments. Grow them with real dictations.

use std::path::PathBuf;

use silktone_app_lib::audio_toolkit::cleanup::{apply_rule_cleanup, RuleCleanup};
use silktone_app_lib::audio_toolkit::normalize_transcription_output;

fn clean(input: &str) -> String {
    let normalized = normalize_transcription_output(input);
    apply_rule_cleanup(
        &normalized,
        &RuleCleanup {
            spoken_punctuation: true,
            numbers: true,
            lists: true,
            self_corrections: true,
            english: true,
            snippets: &[],
        },
    )
}

fn load(name: &str) -> Vec<(String, String)> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/text_quality")
        .join(name);
    let content = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    content
        .lines()
        .filter(|line| !line.trim().is_empty() && !line.starts_with('#'))
        .map(|line| {
            let (input, expected) = line
                .split_once('\t')
                .unwrap_or_else(|| panic!("{name}: missing tab in {line:?}"));
            (input.replace("\\n", "\n"), expected.replace("\\n", "\n"))
        })
        .collect()
}

fn check_set(name: &str, pass_mark: f64) {
    let cases = load(name);
    assert!(!cases.is_empty(), "{name} has no cases");
    let misses: Vec<String> = cases
        .iter()
        .filter_map(|(input, expected)| {
            let got = clean(input);
            (got != *expected)
                .then(|| format!("  {input:?}\n    expected {expected:?}\n    got      {got:?}"))
        })
        .collect();
    let score = 1.0 - misses.len() as f64 / cases.len() as f64;
    println!("{name}: {:.0}% of {} cases", score * 100.0, cases.len());
    for miss in &misses {
        println!("{miss}");
    }
    assert!(
        score >= pass_mark,
        "{name} scored {:.0}%, below its {:.0}% pass mark:\n{}",
        score * 100.0,
        pass_mark * 100.0,
        misses.join("\n")
    );
}

#[test]
fn self_corrections_rules() {
    check_set("self_corrections.tsv", 0.70);
}

#[test]
fn keep_as_is_has_no_false_edits() {
    check_set("keep_as_is.tsv", 1.0);
}

#[test]
fn stutters_and_restarts() {
    check_set("stutters.tsv", 0.95);
}

#[test]
fn lists() {
    check_set("lists.tsv", 0.90);
}

#[test]
fn numbers_dates_money() {
    check_set("numbers.tsv", 0.95);
}

#[test]
fn spoken_punctuation() {
    check_set("punctuation.tsv", 0.95);
}

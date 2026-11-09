//! Commands behind the Writing settings page, snippets and learned words
//! (build spec "New settings and screens").

use tauri::AppHandle;

use crate::settings::{self, LearnedCorrection, SmartCleanup, Snippet};

/// Turn one Writing switch on or off.
#[tauri::command]
#[specta::specta]
pub fn change_writing_setting(
    app: AppHandle,
    setting: String,
    enabled: bool,
) -> Result<(), String> {
    let mut settings = settings::get_settings(&app);
    match setting.as_str() {
        "spoken_punctuation_enabled" => settings.spoken_punctuation_enabled = enabled,
        "numbers_as_digits_enabled" => settings.numbers_as_digits_enabled = enabled,
        "format_lists_enabled" => settings.format_lists_enabled = enabled,
        "self_corrections_enabled" => settings.self_corrections_enabled = enabled,
        other => return Err(format!("Unknown writing setting '{other}'")),
    }
    settings::write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn change_smart_cleanup_setting(app: AppHandle, mode: SmartCleanup) -> Result<(), String> {
    let mut settings = settings::get_settings(&app);
    settings.smart_cleanup = mode;
    settings::write_settings(&app, settings);
    Ok(())
}

/// Replace the snippet list. Rows without a trigger or text are dropped.
#[tauri::command]
#[specta::specta]
pub fn update_snippets(app: AppHandle, snippets: Vec<Snippet>) -> Result<(), String> {
    let mut settings = settings::get_settings(&app);
    settings.snippets = snippets
        .into_iter()
        .filter(|s| !s.trigger.trim().is_empty() && !s.text.trim().is_empty())
        .map(|s| Snippet {
            trigger: s.trigger.trim().to_string(),
            text: s.text,
        })
        .collect();
    settings::write_settings(&app, settings);
    Ok(())
}

/// Remember that `wrong` should be written `right` from now on, and add
/// `right` to the custom words so the speech model is told about it too.
#[tauri::command]
#[specta::specta]
pub fn learn_correction(app: AppHandle, wrong: String, right: String) -> Result<(), String> {
    let wrong = wrong.trim().to_string();
    let right = right.trim().to_string();
    if wrong.is_empty() || right.is_empty() || wrong == right {
        return Err("Both words are needed and must differ".to_string());
    }
    let mut settings = settings::get_settings(&app);
    learn_into(&mut settings, wrong, right);
    settings::write_settings(&app, settings);
    Ok(())
}

fn learn_into(settings: &mut settings::AppSettings, wrong: String, right: String) {
    settings
        .learned_corrections
        .retain(|c| !c.wrong.eq_ignore_ascii_case(&wrong));
    if !settings
        .custom_words
        .iter()
        .any(|w| w.eq_ignore_ascii_case(&right))
    {
        settings.custom_words.push(right.clone());
    }
    settings
        .learned_corrections
        .push(LearnedCorrection { wrong, right });
}

/// Forget a learned correction (Undo, or delete from the list). Its word
/// stays in custom words, where the user can remove it separately.
#[tauri::command]
#[specta::specta]
pub fn forget_correction(app: AppHandle, wrong: String) -> Result<(), String> {
    let mut settings = settings::get_settings(&app);
    settings
        .learned_corrections
        .retain(|c| !c.wrong.eq_ignore_ascii_case(wrong.trim()));
    settings::write_settings(&app, settings);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn learning_replaces_an_older_fix_and_adds_the_custom_word() {
        let mut settings = settings::get_default_settings();
        learn_into(&mut settings, "silk tone".into(), "Silk-tone".into());
        learn_into(&mut settings, "Silk Tone".into(), "Silktone".into());
        assert_eq!(settings.learned_corrections.len(), 1);
        assert_eq!(settings.learned_corrections[0].right, "Silktone");
        assert!(settings.custom_words.contains(&"Silktone".to_string()));
    }
}

//! Laya decision model (convaiinnovations/laya, Apache-2.0) on ONNX Runtime.
//!
//! The ONNX file is produced by `scripts/laya/export_onnx.py`. Input building
//! and temperature scaling are ports of `build_sequence` (rl_common.py) and
//! `RLAgent.system_one` (rl_agent_api.py), restricted to `choice` questions,
//! which is all voice commands need.

use std::collections::HashMap;
use std::path::Path;

use anyhow::{anyhow, Context, Result};
use ort::session::builder::GraphOptimizationLevel;
use ort::session::Session;
use ort::value::Tensor;
use serde::Deserialize;
use tokenizers::Tokenizer;

pub const CONFIG_FILE: &str = "laya-config.json";
pub const TOKENIZER_FILE: &str = "tokenizer.json";

/// `QTYPES["choice"]` in rl_common.py.
const QTYPE_CHOICE: i64 = 0;
/// Option texts are cut to this many tokens (after the marker) upstream.
const MAX_OPTION_TOKENS: usize = 48;

#[derive(Debug, Clone, Deserialize)]
pub struct LayaConfig {
    /// The ONNX graph has fixed input shapes (the head bakes traced sizes into
    /// its reshapes), so every input is padded to these.
    pub seq_len: usize,
    pub max_options: usize,
    pub max_len: usize,
    pub head_max_len: usize,
    pub temperature: Vec<f32>,
    #[serde(default)]
    pub temperature_by_options: HashMap<String, f32>,
    pub special_tokens: SpecialTokens,
    /// The intent question the conversion measured as most accurate. The app
    /// asks exactly this, so what ships is what was tested.
    #[serde(default)]
    pub intent: Option<IntentQuestion>,
    #[serde(default)]
    pub min_probability: Option<f32>,
    pub recommended_model: String,
    pub files: HashMap<String, FileInfo>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SpecialTokens {
    pub cls: i64,
    pub sep: i64,
    pub mask: i64,
    pub pad: i64,
    pub mask_text: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct IntentQuestion {
    pub instructions: String,
    /// `(intent key, description)` pairs.
    pub options: Vec<(String, String)>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileInfo {
    pub sha256: String,
    pub size_bytes: u64,
}

/// A `choice` question: options are `(key, description)` pairs.
pub struct ChoiceQuestion<'a> {
    pub instructions: &'a str,
    pub options: &'a [(&'a str, &'a str)],
}

#[derive(Debug, Clone)]
pub struct ChoiceAnswer {
    pub index: usize,
    pub probabilities: Vec<f32>,
    /// Top-option probability (calibrated by Laya's temperature scaling).
    pub probability: f32,
}

pub struct Laya {
    session: Session,
    tokenizer: Tokenizer,
    cfg: LayaConfig,
}

impl Laya {
    pub fn load(dir: &Path) -> Result<Self> {
        let cfg: LayaConfig = serde_json::from_slice(
            &std::fs::read(dir.join(CONFIG_FILE)).context("reading Laya config")?,
        )
        .context("parsing Laya config")?;
        let tokenizer = Tokenizer::from_file(dir.join(TOKENIZER_FILE))
            .map_err(|e| anyhow!("loading Laya tokenizer: {e}"))?;
        let threads = std::thread::available_parallelism()
            .map(|n| n.get().clamp(1, 4))
            .unwrap_or(2);
        let mut builder = Session::builder()
            .map_err(|e| anyhow!("{e}"))?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|e| anyhow!("{e}"))?
            .with_intra_threads(threads)
            .map_err(|e| anyhow!("{e}"))?;
        let session = builder
            .commit_from_file(dir.join(&cfg.recommended_model))
            .map_err(|e| anyhow!("loading Laya model: {e}"))?;
        Ok(Self {
            session,
            tokenizer,
            cfg,
        })
    }

    pub fn config(&self) -> &LayaConfig {
        &self.cfg
    }

    fn encode(&self, text: &str) -> Result<Vec<i64>> {
        let encoding = self
            .tokenizer
            .encode(text, false)
            .map_err(|e| anyhow!("tokenizing: {e}"))?;
        Ok(encoding.get_ids().iter().map(|&id| id as i64).collect())
    }

    /// `[CLS] choice question: <instructions> [SEP] [MASK] opt0 [MASK] opt1 … [SEP] <state> [SEP]`,
    /// returning the ids and the position of each option's `[MASK]` marker.
    fn build_sequence(&self, state: &str, q: &ChoiceQuestion) -> Result<(Vec<i64>, Vec<i64>)> {
        let st = &self.cfg.special_tokens;
        let max_len = self.cfg.max_len.min(self.cfg.seq_len);
        let head_max_len = self.cfg.head_max_len;
        let clean = |s: &str| s.replace(&st.mask_text, " ");

        let mut head_ids = self.encode(&format!("choice question: {}", clean(q.instructions)))?;
        let mut opt_ids = Vec::with_capacity(q.options.len());
        for (key, desc) in q.options {
            let text = if desc.is_empty() {
                key.to_string()
            } else {
                format!("{key}: {desc}")
            };
            let mut ids = vec![st.mask];
            let mut toks = self.encode(&format!(" {}", clean(&text)))?;
            toks.truncate(MAX_OPTION_TOKENS);
            ids.extend(toks);
            opt_ids.push(ids);
        }

        let used = |opts: &Vec<Vec<i64>>| opts.iter().map(Vec::len).sum::<usize>();
        let mut opt_budget = head_max_len as i64 - used(&opt_ids) as i64;
        if opt_budget < 16 {
            // Too many / too long options: shrink every option evenly.
            let per = ((head_max_len.saturating_sub(16)) / opt_ids.len().max(1)).max(4);
            for o in &mut opt_ids {
                o.truncate(per);
            }
            opt_budget = head_max_len as i64 - used(&opt_ids) as i64;
        }
        head_ids.truncate(opt_budget.max(8) as usize);

        let mut ids = Vec::with_capacity(max_len);
        ids.push(st.cls);
        ids.extend(head_ids);
        ids.push(st.sep);
        let mut markers = Vec::with_capacity(opt_ids.len());
        for o in opt_ids {
            markers.push(ids.len() as i64);
            ids.extend(o);
        }
        ids.push(st.sep);

        let room = max_len.saturating_sub(ids.len() + 1);
        let mut state_ids = self.encode(&clean(state))?;
        state_ids.truncate(room);
        ids.extend(state_ids);
        ids.push(st.sep);
        ids.truncate(max_len);
        markers.retain(|&m| (m as usize) < max_len);
        Ok((ids, markers))
    }

    fn temperature(&self, k: usize) -> f32 {
        let size = match k {
            0..=2 => "2",
            3..=5 => "3-5",
            6..=10 => "6-10",
            _ => "11+",
        };
        self.cfg
            .temperature_by_options
            .get(&format!("choice:{size}"))
            .copied()
            .or_else(|| self.cfg.temperature.first().copied())
            .unwrap_or(1.0)
    }

    /// Answer one choice question about `state` (the transcribed command).
    pub fn choose(&mut self, state: &str, q: &ChoiceQuestion) -> Result<ChoiceAnswer> {
        let (mut ids, mut markers) = self.build_sequence(state, q)?;
        let k = q.options.len();
        let (seq, kmax) = (self.cfg.seq_len, self.cfg.max_options);
        if markers.len() != k || k > kmax {
            return Err(anyhow!("question options do not fit the model's input"));
        }
        let mut attention = vec![1i64; ids.len()];
        attention.resize(seq, 0);
        ids.resize(seq, self.cfg.special_tokens.pad);
        let mut marker_mask = vec![true; k];
        marker_mask.resize(kmax, false);
        markers.resize(kmax, 0);

        let input_ids = Tensor::from_array(([1usize, seq], ids)).map_err(|e| anyhow!("{e}"))?;
        let attention = Tensor::from_array(([1usize, seq], attention)).map_err(|e| anyhow!("{e}"))?;
        let marker_pos = Tensor::from_array(([1usize, kmax], markers)).map_err(|e| anyhow!("{e}"))?;
        let marker_mask = Tensor::from_array(([1usize, kmax], marker_mask)).map_err(|e| anyhow!("{e}"))?;
        let qtype = Tensor::from_array(([1usize], vec![QTYPE_CHOICE])).map_err(|e| anyhow!("{e}"))?;

        let outputs = self
            .session
            .run(ort::inputs![
                "input_ids" => input_ids,
                "attention_mask" => attention,
                "marker_pos" => marker_pos,
                "marker_mask" => marker_mask,
                "qtype" => qtype,
            ])
            .map_err(|e| anyhow!("running Laya: {e}"))?;
        let (_, logits) = outputs["logits"]
            .try_extract_tensor::<f32>()
            .map_err(|e| anyhow!("reading Laya output: {e}"))?;

        let t = self.temperature(k);
        let z: Vec<f32> = logits.iter().take(k).map(|l| l / t).collect();
        let max = z.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        let exp: Vec<f32> = z.iter().map(|v| (v - max).exp()).collect();
        let sum: f32 = exp.iter().sum();
        let probabilities: Vec<f32> = exp.iter().map(|v| v / sum).collect();
        let (index, probability) = probabilities
            .iter()
            .copied()
            .enumerate()
            .fold((0, f32::MIN), |best, (i, p)| if p > best.1 { (i, p) } else { best });
        Ok(ChoiceAnswer {
            index,
            probabilities,
            probability,
        })
    }
}

"""Convert the Laya decision model to ONNX for Silktone Voice Commands (beta).

Runs in CI (.github/workflows/laya-onnx.yml). Produces, in --out:
  laya.onnx           fp32 export
  laya-int8.onnx      dynamically quantized (what the app downloads by default)
  tokenizer.json      the model's tokenizer
  laya-config.json    temperatures + special-token ids + sha256 of every file
  parity.json         torch vs ONNX agreement on the Silktone command questions

The app reproduces `build_sequence` / temperature scaling from rl_common.py in
Rust (src-tauri/src/voice_commands/laya.rs), so the model's inputs and outputs
here are exactly the tensors DecisionModel.forward takes and returns.
"""
import argparse
import hashlib
import json
import os
import shutil
import sys

import numpy as np
import torch

REPO = "convaiinnovations/laya"
# Pinned so the exported model can't change underneath a release.
REVISION = "55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851"

# Mirrors the intent question in voice_commands/intents.rs.
INTENT_QUESTION = {
    "type": "choice",
    "instructions": "What does the user want the computer to do?",
    "criteria": {
        "open_app": "open or launch an application",
        "open_website": "go to a website",
        "web_search": "search the web for something",
        "media": "play, pause, skip or go back in music or video",
        "volume": "turn the sound volume up or down, or mute it",
        "window": "minimize windows, show the desktop or switch windows",
        "screenshot": "take a screenshot",
        "lock": "lock the computer",
        "none": "not a request to control the computer",
    },
}
PARITY_SAMPLES = [
    ("open chrome", "open_app"),
    ("launch notepad please", "open_app"),
    ("go to youtube", "open_website"),
    ("open gmail", "open_website"),
    ("search for flights to goa", "web_search"),
    ("google the weather in hyderabad", "web_search"),
    ("pause the music", "media"),
    ("next song", "media"),
    ("turn the volume up", "volume"),
    ("mute", "volume"),
    ("show me the desktop", "window"),
    ("take a screenshot", "screenshot"),
    ("lock my computer", "lock"),
    ("i think we should meet tomorrow at five", "none"),
]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Exportable(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask, marker_pos, marker_mask, qtype):
        return self.model(input_ids, attention_mask, marker_pos, marker_mask, qtype)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="laya-onnx")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    from huggingface_hub import snapshot_download
    from safetensors.torch import load_file
    from transformers import AutoConfig, AutoModel, AutoTokenizer

    src = snapshot_download(
        REPO,
        revision=REVISION,
        allow_patterns=["model.safetensors", "rl_agent_config.json", "rl_common.py", "encoder/*", "tokenizer/*"],
    )
    sys.path.insert(0, src)
    from rl_common import DecisionModel, QTYPES, build_sequence, collate_items, render_options, temp_bucket

    with open(os.path.join(src, "rl_agent_config.json")) as f:
        cfg = json.load(f)
    tok = AutoTokenizer.from_pretrained(os.path.join(src, "tokenizer"))

    # Eager attention and no fused encoder fast path: both trace cleanly to ONNX.
    torch.backends.mha.set_fastpath_enabled(False)
    ecfg = AutoConfig.from_pretrained(os.path.join(src, "encoder"))
    ecfg.reference_compile = False
    enc = AutoModel.from_config(ecfg, attn_implementation="eager")
    model = DecisionModel(enc, cfg["head_layers"], len(cfg["act_costs"]) + 1)
    model.load_state_dict(load_file(os.path.join(src, "model.safetensors")), strict=True)
    model.eval()
    wrapped = Exportable(model).eval()

    q = {"t": "choice", "ins": INTENT_QUESTION["instructions"], "crit": INTENT_QUESTION["criteria"]}

    def encode(text):
        ids, markers = build_sequence(tok, text, q, cfg["max_len"], cfg["head_max_len"])
        assert len(markers) == len(render_options(q)), "options did not fit"
        item = {"ids": ids, "markers": markers, "qtype": QTYPES["choice"], "target": [0.0] * len(markers),
                "label": -1, "episode": 0, "ep_step": 0, "ep_len": 1, "src": "export"}
        b = collate_items([[item]], tok.pad_token_id)
        return (b["input_ids"], b["attention_mask"], b["marker_pos"], b["marker_mask"], b["qtype"])

    fp32_path = os.path.join(args.out, "laya.onnx")
    with torch.no_grad():
        torch.onnx.export(
            wrapped,
            encode(PARITY_SAMPLES[0][0]),
            fp32_path,
            input_names=["input_ids", "attention_mask", "marker_pos", "marker_mask", "qtype"],
            output_names=["logits", "act_logits"],
            dynamic_axes={
                "input_ids": {0: "batch", 1: "seq"},
                "attention_mask": {0: "batch", 1: "seq"},
                "marker_pos": {0: "batch", 1: "options"},
                "marker_mask": {0: "batch", 1: "options"},
                "qtype": {0: "batch"},
                "logits": {0: "batch", 1: "options"},
                "act_logits": {0: "batch"},
            },
            opset_version=17,
            do_constant_folding=True,
            dynamo=False,
        )

    from onnxruntime.quantization import QuantType, quantize_dynamic

    int8_path = os.path.join(args.out, "laya-int8.onnx")
    quantize_dynamic(fp32_path, int8_path, weight_type=QuantType.QInt8)

    import onnxruntime as ort

    keys = list(INTENT_QUESTION["criteria"].keys())
    k = len(keys)
    temp = cfg.get("temperature_by_options", {}).get(temp_bucket(QTYPES["choice"], k), cfg["temperature"][QTYPES["choice"]])

    def probs(logits):
        z = np.asarray(logits[:k], dtype=np.float64) / temp
        p = np.exp(z - z.max())
        return p / p.sum()

    sessions = {name: ort.InferenceSession(p, providers=["CPUExecutionProvider"])
                for name, p in (("fp32", fp32_path), ("int8", int8_path))}
    report = {"temperature": temp, "samples": []}
    for text, expected in PARITY_SAMPLES:
        inputs = encode(text)
        with torch.no_grad():
            t_logits, _ = wrapped(*inputs)
        row = {"text": text, "expected": expected, "torch": keys[int(probs(t_logits[0].numpy()).argmax())]}
        feeds = {"input_ids": inputs[0].numpy(), "attention_mask": inputs[1].numpy(), "marker_pos": inputs[2].numpy(),
                 "marker_mask": inputs[3].numpy(), "qtype": inputs[4].numpy()}
        for name, sess in sessions.items():
            o_logits, _ = sess.run(None, feeds)
            p = probs(o_logits[0])
            row[name] = keys[int(p.argmax())]
            row[name + "_confidence"] = round(float(p.max()), 4)
            row[name + "_max_prob_diff_vs_torch"] = round(float(np.abs(p - probs(t_logits[0].numpy())).max()), 4)
        report["samples"].append(row)
        print(json.dumps(row))

    n = len(PARITY_SAMPLES)
    for name in ("torch", "fp32", "int8"):
        report[name + "_accuracy"] = sum(r[name] == r["expected"] for r in report["samples"]) / n
    report["fp32_matches_torch"] = sum(r["fp32"] == r["torch"] for r in report["samples"]) / n
    report["int8_matches_torch"] = sum(r["int8"] == r["torch"] for r in report["samples"]) / n
    print(json.dumps({k2: v for k2, v in report.items() if k2 != "samples"}, indent=2))
    if report["fp32_matches_torch"] < 1.0:
        sys.exit("fp32 ONNX export disagrees with PyTorch; not publishing.")
    with open(os.path.join(args.out, "parity.json"), "w") as f:
        json.dump(report, f, indent=2)

    shutil.copy(os.path.join(src, "tokenizer", "tokenizer.json"), os.path.join(args.out, "tokenizer.json"))

    def token_id(tok_str):
        return int(tok.convert_tokens_to_ids(tok_str))

    app_cfg = {
        "source": {"repo": REPO, "revision": REVISION},
        "max_len": cfg["max_len"],
        "head_max_len": cfg["head_max_len"],
        "temperature": cfg["temperature"],
        "temperature_by_options": cfg.get("temperature_by_options", {}),
        "special_tokens": {
            "cls": token_id(tok.cls_token), "sep": token_id(tok.sep_token),
            "mask": token_id(tok.mask_token), "pad": token_id(tok.pad_token),
            "mask_text": tok.mask_token,
        },
        "recommended_model": "laya-int8.onnx" if report["int8_matches_torch"] >= 0.9 else "laya.onnx",
        "files": {},
    }
    for name in ("laya.onnx", "laya-int8.onnx", "tokenizer.json"):
        path = os.path.join(args.out, name)
        app_cfg["files"][name] = {"sha256": sha256(path), "size_bytes": os.path.getsize(path)}
    with open(os.path.join(args.out, "laya-config.json"), "w") as f:
        json.dump(app_cfg, f, indent=2)
    print(json.dumps(app_cfg, indent=2))


if __name__ == "__main__":
    main()

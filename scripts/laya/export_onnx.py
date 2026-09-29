"""Convert the Laya decision model to ONNX for Silktone Voice Commands (beta).

Runs in CI (.github/workflows/laya-onnx.yml):
  1. Scores each published Laya checkpoint on SAMPLES (the intent question the
     app asks) and keeps the most accurate one.
  2. Exports it with fixed input shapes (SEQ_LEN tokens, MAX_OPTIONS options):
     the head's attention layers bake traced sizes into Reshape nodes, so
     dynamic shapes do not survive export. The app pads to these sizes.
  3. Quantizes to int8 and checks both files against PyTorch.

Outputs in --out: laya.onnx, laya-int8.onnx, tokenizer.json, laya-config.json,
report.json. The app (src-tauri/src/voice_commands/laya.rs) ports
build_sequence and the temperature scaling from the checkpoint's rl_common.py.
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
VARIANTS = ["", "typed-decisions", "multilingual"]  # "" is the base English checkpoint
SEQ_LEN = 256
MAX_OPTIONS = 24

# Ways of asking the intent question. Each is scored on every checkpoint and
# the winner is written to laya-config.json, which the app reads, so the app
# asks exactly the question that was measured. Keys must match the intents
# handled in src-tauri/src/voice_commands/intents.rs.
PLAIN = {
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
EXAMPLES = {
    "instructions": "The user spoke a short instruction to their computer. What should the computer do?",
    "criteria": {
        "open_app": "open, launch or start an app such as Chrome, Notepad, Calculator or Spotify",
        "open_website": "go to or open a website such as YouTube, Gmail or GitHub",
        "web_search": "search Google or YouTube for information",
        "media": "play, pause, resume or skip music or a video",
        "volume": "turn the sound up or down, or mute it",
        "window": "show the desktop, or minimize, maximize or switch windows",
        "screenshot": "take a screenshot or capture the screen",
        "lock": "lock the computer or the screen",
        "none": "ordinary speech that is not an instruction to the computer",
    },
}


def without_none(q):
    return {"instructions": q["instructions"], "criteria": {k: v for k, v in q["criteria"].items() if k != "none"}}


FORMULATIONS = {
    "plain": PLAIN,
    "plain_no_none": without_none(PLAIN),
    "examples": EXAMPLES,
    "examples_no_none": without_none(EXAMPLES),
}
# Same as MIN_PROBABILITY in intents.rs: below it the app says it didn't understand.
MIN_PROBABILITY = 0.45

SAMPLES = [
    ("open chrome", "open_app"),
    ("launch notepad please", "open_app"),
    ("start calculator", "open_app"),
    ("open file explorer", "open_app"),
    ("can you open spotify", "open_app"),
    ("go to youtube", "open_website"),
    ("open gmail", "open_website"),
    ("take me to github", "open_website"),
    ("open litovation dot com", "open_website"),
    ("search for flights to goa", "web_search"),
    ("google the weather in hyderabad", "web_search"),
    ("look up the latest cricket score", "web_search"),
    ("search youtube for lofi music", "web_search"),
    ("pause the music", "media"),
    ("next song", "media"),
    ("play the previous track", "media"),
    ("resume the video", "media"),
    ("turn the volume up", "volume"),
    ("make it quieter", "volume"),
    ("mute", "volume"),
    ("show me the desktop", "window"),
    ("minimize this window", "window"),
    ("switch to the other window", "window"),
    ("take a screenshot", "screenshot"),
    ("capture my screen", "screenshot"),
    ("lock my computer", "lock"),
    ("lock the screen", "lock"),
    ("i think we should meet tomorrow at five", "none"),
    ("thanks for sending the report yesterday", "none"),
    ("the quarterly numbers look good", "none"),
]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_variant(variant):
    from huggingface_hub import snapshot_download
    from safetensors.torch import load_file
    from transformers import AutoConfig, AutoModel, AutoTokenizer

    prefix = variant + "/" if variant else ""
    root = snapshot_download(
        REPO,
        revision=REVISION,
        allow_patterns=["rl_common.py", "rl_agent_config.json", "encoder/*", "tokenizer/*", "model.safetensors"]
        if not variant
        else ["rl_common.py", prefix + "*"],
    )
    if root not in sys.path:
        sys.path.insert(0, root)
    from rl_common import DecisionModel

    base = os.path.join(root, variant) if variant else root
    with open(os.path.join(base, "rl_agent_config.json")) as f:
        cfg = json.load(f)
    tok = AutoTokenizer.from_pretrained(os.path.join(base, "tokenizer"))
    # Eager attention and no fused encoder fast path: both trace to ONNX.
    torch.backends.mha.set_fastpath_enabled(False)
    ecfg = AutoConfig.from_pretrained(os.path.join(base, "encoder"))
    ecfg.reference_compile = False
    enc = AutoModel.from_config(ecfg, attn_implementation="eager")
    model = DecisionModel(enc, cfg["head_layers"], len(cfg["act_costs"]) + 1)
    model.load_state_dict(load_file(os.path.join(base, "model.safetensors")), strict=True)
    model.eval()
    return base, cfg, tok, model


class Exportable(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask, marker_pos, marker_mask, qtype):
        return self.model(input_ids, attention_mask, marker_pos, marker_mask, qtype)


def make_encoder(tok, cfg, question):
    from rl_common import QTYPES, build_sequence, render_options

    q = {"t": "choice", "ins": question["instructions"], "crit": question["criteria"]}
    k = len(question["criteria"])

    def encode(text):
        ids, markers = build_sequence(tok, text, q, SEQ_LEN, cfg["head_max_len"])
        assert len(markers) == len(render_options(q)), "options did not fit"
        input_ids = torch.full((1, SEQ_LEN), tok.pad_token_id, dtype=torch.long)
        attention = torch.zeros((1, SEQ_LEN), dtype=torch.long)
        input_ids[0, : len(ids)] = torch.tensor(ids)
        attention[0, : len(ids)] = 1
        marker_pos = torch.zeros((1, MAX_OPTIONS), dtype=torch.long)
        marker_mask = torch.zeros((1, MAX_OPTIONS), dtype=torch.bool)
        marker_pos[0, :k] = torch.tensor(markers)
        marker_mask[0, :k] = True
        return (input_ids, attention, marker_pos, marker_mask, torch.tensor([QTYPES["choice"]]))

    return encode, k


def temperature_for(cfg, k):
    from rl_common import QTYPES, temp_bucket

    return cfg.get("temperature_by_options", {}).get(temp_bucket(QTYPES["choice"], k), cfg["temperature"][QTYPES["choice"]])


def softmax(logits, k, t):
    z = np.asarray(logits[:k], dtype=np.float64) / t
    p = np.exp(z - z.max())
    return p / p.sum()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="laya-onnx")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    report = {"candidates": {}}

    def judged(question, p):
        """The app acts only above MIN_PROBABILITY, so score what it would do."""
        keys = list(question["criteria"].keys())
        got = keys[int(p.argmax())] if p.max() >= MIN_PROBABILITY else "none"
        return got, float(p.max())

    # 1. Pick the most accurate checkpoint + question on the command samples.
    best = None
    for variant in VARIANTS:
        vname = variant or "base"
        base, cfg, tok, model = load_variant(variant)
        for fname, question in FORMULATIONS.items():
            encode, k = make_encoder(tok, cfg, question)
            t = temperature_for(cfg, k)
            rows = []
            with torch.no_grad():
                for text, expected in SAMPLES:
                    logits, _ = model(*encode(text))
                    got, prob = judged(question, softmax(logits[0].numpy(), k, t))
                    rows.append({"text": text, "expected": expected, "got": got, "probability": round(prob, 3)})
            acc = sum(r["got"] == r["expected"] for r in rows) / len(rows)
            name = "%s/%s" % (vname, fname)
            report["candidates"][name] = {"accuracy": acc, "samples": rows}
            print("ACCURACY %s: %.3f" % (name, acc))
            if best is None or acc > best[0]:
                best = (acc, variant, fname, rows)
        del model
    acc, chosen_variant, chosen_q, rows = best
    question = FORMULATIONS[chosen_q]
    report["chosen"] = {"checkpoint": chosen_variant or "base", "question": chosen_q, "accuracy": acc}
    print("CHOSEN %s/%s (accuracy %.3f)" % (chosen_variant or "base", chosen_q, acc))
    for r in rows:
        if r["got"] != r["expected"]:
            print("  miss %r -> %s (%.2f), expected %s" % (r["text"], r["got"], r["probability"], r["expected"]))

    # 2. Export the winner with static shapes.
    keys = list(question["criteria"].keys())
    base, cfg, tok, model = load_variant(chosen_variant)
    encode, k = make_encoder(tok, cfg, question)
    t = temperature_for(cfg, k)
    wrapped = Exportable(model).eval()
    fp32_path = os.path.join(args.out, "laya.onnx")
    with torch.no_grad():
        torch.onnx.export(
            wrapped, encode(SAMPLES[0][0]), fp32_path,
            input_names=["input_ids", "attention_mask", "marker_pos", "marker_mask", "qtype"],
            output_names=["logits", "act_logits"],
            opset_version=17, do_constant_folding=True, dynamo=False,
        )

    import onnx
    import onnxruntime as ort
    from onnxruntime.quantization import QuantType, quantize_dynamic

    # Quantizing the decision head wrecks its calibrated scores, so only the
    # encoder is quantized; embeddings-only is the gentler fallback.
    graph_nodes = onnx.load(fp32_path, load_external_data=False).graph.node
    print("NODES %s" % [n.name for n in graph_nodes if n.op_type in ("MatMul", "Gather")][:6])
    encoder_nodes = lambda ops: [n.name for n in graph_nodes if n.op_type in ops and "/encoder/" in n.name]
    quant_candidates = {
        "encoder-int8": (["MatMul", "Gather"], encoder_nodes({"MatMul", "Gather"})),
        "embeddings-int8": (["Gather"], encoder_nodes({"Gather"})),
    }

    def parity(path):
        sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        agree = correct = 0
        max_diff = 0.0
        for text, expected in SAMPLES:
            inputs = encode(text)
            with torch.no_grad():
                pt = softmax(wrapped(*inputs)[0][0].numpy(), k, t)
            feeds = dict(zip(["input_ids", "attention_mask", "marker_pos", "marker_mask", "qtype"], [x.numpy() for x in inputs]))
            po = softmax(sess.run(["logits"], feeds)[0][0], k, t)
            agree += int(po.argmax() == pt.argmax())
            correct += int(judged(question, po)[0] == expected)
            max_diff = max(max_diff, float(np.abs(po - pt).max()))
        n = len(SAMPLES)
        return {"matches_torch": agree / n, "accuracy": correct / n, "max_prob_diff": round(max_diff, 4),
                "size_mb": os.path.getsize(path) // 1_000_000}

    report["fp32"] = parity(fp32_path)
    print("PARITY fp32: %s" % json.dumps(report["fp32"]))
    if report["fp32"]["matches_torch"] < 1.0:
        sys.exit("fp32 ONNX export disagrees with PyTorch; not publishing.")
    int8_path = os.path.join(args.out, "laya-int8.onnx")
    recommended = "laya.onnx"
    for qname, (ops, nodes) in quant_candidates.items():
        if not nodes:
            print("SKIP %s: no encoder nodes found" % qname)
            continue
        tmp = os.path.join(args.out, qname + ".onnx")
        quantize_dynamic(fp32_path, tmp, weight_type=QuantType.QInt8, op_types_to_quantize=ops, nodes_to_quantize=nodes)
        report[qname] = parity(tmp)
        print("PARITY %s: %s" % (qname, json.dumps(report[qname])))
        if report[qname]["matches_torch"] >= 0.95:
            shutil.move(tmp, int8_path)
            recommended = "laya-int8.onnx"
            report["int8_method"] = qname
            break
        os.remove(tmp)
    if recommended == "laya.onnx":
        shutil.copy(fp32_path, int8_path)  # keep the release file set stable
    report["recommended_model"] = recommended
    with open(os.path.join(args.out, "report.json"), "w") as f:
        json.dump(report, f, indent=2)

    shutil.copy(os.path.join(base, "tokenizer", "tokenizer.json"), os.path.join(args.out, "tokenizer.json"))
    tid = lambda s: int(tok.convert_tokens_to_ids(s))
    app_cfg = {
        "source": {"repo": REPO, "revision": REVISION, "variant": chosen_variant or "base"},
        "intent": {"instructions": question["instructions"], "options": [[k2, v] for k2, v in question["criteria"].items()]},
        "min_probability": MIN_PROBABILITY,
        "seq_len": SEQ_LEN,
        "max_options": MAX_OPTIONS,
        "max_len": SEQ_LEN,
        "head_max_len": cfg["head_max_len"],
        "temperature": cfg["temperature"],
        "temperature_by_options": cfg.get("temperature_by_options", {}),
        "special_tokens": {"cls": tid(tok.cls_token), "sep": tid(tok.sep_token), "mask": tid(tok.mask_token),
                           "pad": tid(tok.pad_token), "mask_text": tok.mask_token},
        "recommended_model": recommended,
        "files": {},
    }
    for name in ("laya.onnx", "laya-int8.onnx", "tokenizer.json"):
        path = os.path.join(args.out, name)
        app_cfg["files"][name] = {"sha256": sha256(path), "size_bytes": os.path.getsize(path)}
    with open(os.path.join(args.out, "laya-config.json"), "w") as f:
        json.dump(app_cfg, f, indent=2)
    print("RECOMMENDED %s (%d MB)" % (recommended, app_cfg["files"][recommended]["size_bytes"] // 1_000_000))


if __name__ == "__main__":
    main()

// Point the model catalog at a Hugging Face org that holds duplicates of the
// five model repos. Verifies every file (size + sha256) before changing anything.
//
//   node scripts/point-models-to-org.mjs <HF org>           # check only
//   node scripts/point-models-to-org.mjs <HF org> --write   # check, then repoint
import fs from "node:fs";

const CAT = new URL("../src-tauri/src/catalog/catalog.json", import.meta.url);
const ORG = process.argv[2];
if (!ORG || ORG.startsWith("--")) {
  console.error("Usage: node scripts/point-models-to-org.mjs <HF org> [--write]");
  process.exit(1);
}

await (async () => {
  const cat = JSON.parse(fs.readFileSync(CAT, "utf8"));
  let allOk = true;
  for (const m of cat.models) {
    const name = m.id.split("/")[1];
    const target = `${ORG}/${name}`;
    const res = await fetch(`https://huggingface.co/api/models/${target}?blobs=true`);
    if (!res.ok) {
      console.log(`MISSING  ${target} (${res.status})`);
      allOk = false;
      continue;
    }
    const info = await res.json();
    const blobs = Object.fromEntries(info.siblings.map((s) => [s.rfilename, s]));
    const problems = [];
    for (const f of m.files) {
      const b = blobs[f.filename];
      if (!b) problems.push(`no ${f.filename}`);
      else if (b.lfs?.sha256 !== f.sha256) problems.push(`hash differs ${f.filename}`);
      else if (b.size !== f.size_bytes) problems.push(`size differs ${f.filename}`);
    }
    console.log(`${problems.length ? "PROBLEM" : "OK     "}  ${target} @ ${info.sha.slice(0, 12)}  (${m.files.length} files) ${problems.join("; ")}`);
    if (problems.length) allOk = false;
    m._new = { id: target, revision: info.sha };
  }
  if (process.argv.includes("--write")) {
    if (!allOk) throw new Error("Not writing: fix the problems above first.");
    for (const m of cat.models) {
      m.id = m._new.id;
      m.revision = m._new.revision;
      delete m._new;
    }
    fs.writeFileSync(CAT, JSON.stringify(cat, null, 2) + "\n");
    console.log("catalog.json now points at", ORG);
  }
})();

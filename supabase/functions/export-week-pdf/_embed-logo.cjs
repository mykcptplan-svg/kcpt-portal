/**
 * One-shot: resize public/brand/heart-mark.png, validate base64, patch index.ts.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "../../..");
const PNG_PATH = path.join(ROOT, "public/brand/heart-mark.png");
const INDEX_PATH = path.join(__dirname, "index.ts");

function assertDenoSafeBase64(b64) {
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) {
    throw new Error("base64 has invalid characters for Deno atob");
  }
  if (b64.length % 4 !== 0) {
    throw new Error(`base64 length ${b64.length} is not divisible by 4`);
  }
  // Deno atob rejects any char outside the alphabet; also reject whitespace.
  for (let i = 0; i < b64.length; i++) {
    const c = b64[i];
    if (
      !(
        (c >= "A" && c <= "Z") ||
        (c >= "a" && c <= "z") ||
        (c >= "0" && c <= "9") ||
        c === "+" ||
        c === "/" ||
        c === "="
      )
    ) {
      throw new Error(`invalid base64 char at ${i}: U+${c.charCodeAt(0).toString(16)}`);
    }
  }
  const buf = Buffer.from(b64, "base64");
  if (buf.length === 0) throw new Error("decoded buffer is empty");
  const sig = buf.subarray(0, 8).toString("hex");
  if (sig !== "89504e470d0a1a0a") {
    throw new Error(`PNG signature mismatch: ${sig}`);
  }
  // Round-trip must match (Node may silently skip bad chars — we already charset-checked).
  if (buf.toString("base64") !== b64 && Buffer.from(b64, "base64").toString("base64") !== b64) {
    // Some encoders omit padding equivalence; compare decoded bytes only.
    const again = Buffer.from(buf.toString("base64"), "base64");
    if (!again.equals(buf)) throw new Error("base64 round-trip failed");
  }
  return buf;
}

async function main() {
  const pngBytes = await sharp(PNG_PATH)
    .resize(64, 64, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const b64 = pngBytes.toString("base64");
  const decoded = assertDenoSafeBase64(b64);
  console.log("validated logo", {
    pngBytes: pngBytes.length,
    b64Len: b64.length,
    decodedLen: decoded.length,
  });

  let index = fs.readFileSync(INDEX_PATH, "utf8");
  const re = /const HEART_MARK_BASE64 = "[^"]*";/;
  if (!re.test(index)) {
    throw new Error("HEART_MARK_BASE64 constant not found in index.ts");
  }
  index = index.replace(re, `const HEART_MARK_BASE64 = "${b64}";`);

  // ASCII hyphen in PDF-drawn week range (Helvetica-safe).
  index = index.replace(
    /return fmt\(monday\) \+ " [^"]+ " \+ fmt\(sunday\);/,
    'return fmt(monday) + " - " + fmt(sunday);',
  );
  // Fallback if en-dash literal present
  index = index.replace(
    'return fmt(monday) + " – " + fmt(sunday);',
    'return fmt(monday) + " - " + fmt(sunday);',
  );

  fs.writeFileSync(INDEX_PATH, index);
  console.log("patched", INDEX_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

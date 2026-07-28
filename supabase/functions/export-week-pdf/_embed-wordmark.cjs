/**
 * One-shot: validate public/brand/wordmark.png as Deno-safe base64, patch index.ts.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const PNG_PATH = path.join(ROOT, "public/brand/wordmark.png");
const INDEX_PATH = path.join(__dirname, "index.ts");

function assertDenoSafeBase64(b64) {
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) {
    throw new Error("base64 has invalid characters for Deno atob");
  }
  if (b64.length % 4 !== 0) {
    throw new Error(`base64 length ${b64.length} is not divisible by 4`);
  }
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
  return buf;
}

function main() {
  const pngBytes = fs.readFileSync(PNG_PATH);
  const b64 = pngBytes.toString("base64");
  const decoded = assertDenoSafeBase64(b64);
  console.log("validated wordmark", {
    pngBytes: pngBytes.length,
    b64Len: b64.length,
    decodedLen: decoded.length,
  });

  let index = fs.readFileSync(INDEX_PATH, "utf8");
  const re = /const WORDMARK_BASE64 = "[^"]*";/;
  if (!re.test(index)) {
    throw new Error("WORDMARK_BASE64 constant not found in index.ts");
  }
  index = index.replace(re, `const WORDMARK_BASE64 = "${b64}";`);

  fs.writeFileSync(INDEX_PATH, index);
  console.log("patched", INDEX_PATH);
}

main();

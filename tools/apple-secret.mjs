// Generate the Apple "client secret" JWT that Supabase's Apple provider needs (web OAuth).
// No dependencies — pure Node crypto. Your .p8 private key never leaves your machine.
//
// Usage (from the repo root):
//   node tools/apple-secret.mjs "C:\\path\\to\\AuthKey_239D36H4SH.p8"
//
// Paste the printed token into Supabase → Authentication → Providers → Apple → "Secret Key (for OAuth)".
// It is valid ~6 months; re-run this and update Supabase before it expires.
import fs from "node:fs";
import crypto from "node:crypto";

const TEAM_ID = "9ZS97G9388"; // Apple Team ID
const KEY_ID = "239D36H4SH"; // the key you just created
const SERVICES_ID = "io.turfgame.app.signin"; // the Services ID (OAuth client id)

const p8Path = process.argv[2];
if (!p8Path) {
  console.error('Pass the path to your .p8, e.g.  node tools/apple-secret.mjs "C:\\Users\\you\\Downloads\\AuthKey_239D36H4SH.p8"');
  process.exit(1);
}
const privateKey = fs.readFileSync(p8Path, "utf8");

const b64url = (input) => Buffer.from(input).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" }));
const payload = b64url(
  JSON.stringify({
    iss: TEAM_ID,
    iat: now,
    exp: now + 60 * 60 * 24 * 180, // ~6 months (Apple's max)
    aud: "https://appleid.apple.com",
    sub: SERVICES_ID,
  }),
);
const signingInput = `${header}.${payload}`;
const signer = crypto.createSign("SHA256");
signer.update(signingInput);
// ES256 JWTs need the raw r||s signature (IEEE P1363), not Node's default DER.
const signature = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
const token = `${signingInput}.${b64url(signature)}`;

// Write to a file (no newline) so it copies cleanly — avoids terminal line-wrapping/clip issues.
fs.writeFileSync("apple-secret.txt", token);
console.log("Wrote the client secret to apple-secret.txt — open it, copy ALL, paste into Supabase, then delete it.");

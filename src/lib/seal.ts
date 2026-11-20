import { createHash, createPublicKey, verify as ed25519Verify } from 'node:crypto';
import fs from 'node:fs';
import type { BundleKey, BundleManifest } from './types';
import { canonical } from './canonical';

export function loadBundleKeys(keysPath: string): BundleKey[] {
  const raw = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  if (raw?.schema !== 'argus.bundle-keys.v0' || !Array.isArray(raw.keys)) {
    throw new Error(`invalid bundle keys file: ${keysPath}`);
  }
  return raw.keys;
}

export type SealCheck = { ok: true } | { ok: false; reason: string };

// Verification order: schema -> key_id -> signature -> tree_sha256.
export function verifySeal(
  manifest: BundleManifest,
  tarballPath: string,
  keys: BundleKey[],
): SealCheck {
  if (!manifest || manifest.schema !== 'argus.bundle.v0') {
    return { ok: false, reason: `unsupported manifest schema: ${String(manifest?.schema)}` };
  }
  const key = keys.find((k) => k.key_id === manifest.key_id && k.status === 'active');
  if (!key) {
    return { ok: false, reason: `unknown key_id: ${manifest.key_id}` };
  }
  let signatureOk = false;
  try {
    const pub = createPublicKey({ key: Buffer.from(key.public_key_b64, 'base64'), type: 'spki', format: 'der' });
    const { signature, ...rest } = manifest;
    signatureOk = ed25519Verify(null, Buffer.from(canonical(rest)), pub, Buffer.from(signature, 'base64'));
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) {
    return { ok: false, reason: 'signature invalid' };
  }
  const sha = createHash('sha256').update(fs.readFileSync(tarballPath)).digest('hex');
  if (sha !== manifest.tree_sha256) {
    return { ok: false, reason: `tree_sha256 mismatch (expected ${manifest.tree_sha256.slice(0, 12)}..., got ${sha.slice(0, 12)}...)` };
  }
  return { ok: true };
}

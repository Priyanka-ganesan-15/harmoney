import { createHash, randomBytes } from "node:crypto";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(size = 32) {
  return randomBytes(size).toString("hex");
}

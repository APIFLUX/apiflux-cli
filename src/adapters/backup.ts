import { copyFileSync, existsSync } from "node:fs";

const backedUp = new Set<string>();

/** Copy the file to <file>.bak.<timestamp> once per process run. No-op if the file does not exist. */
export function backupOnce(filePath: string): void {
  if (backedUp.has(filePath) || !existsSync(filePath)) return;
  copyFileSync(filePath, `${filePath}.bak.${Date.now()}`);
  backedUp.add(filePath);
}

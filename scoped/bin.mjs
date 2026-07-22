#!/usr/bin/env node
// Thin alias: @apiflux/cli exists to hold the org scope; the canonical
// implementation lives in the unscoped apiflux-cli package.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("apiflux-cli/package.json");
const pkg = require("apiflux-cli/package.json");
await import(pathToFileURL(resolve(dirname(pkgPath), pkg.bin.apiflux)).href);

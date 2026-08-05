import { serverComponentFingerprints } from "./lib/server-components.ts";

process.stdout.write(`${JSON.stringify(serverComponentFingerprints())}\n`);

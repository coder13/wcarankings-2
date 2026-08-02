import { readFile, writeFile } from "node:fs/promises";

const path = ".github/workflows/build-projections.yml";
let content = await readFile(path, "utf8");
if (!content.includes("  raw-export:\n")) {
  const job = `  raw-export:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        if: inputs.build_groups != '' || inputs.include_raw
        with:
          ref: \${{ inputs.ref }}

      - name: Set up pnpm
        if: inputs.build_groups != '' || inputs.include_raw
        uses: pnpm/action-setup@v4

      - name: Set up Node.js
        if: inputs.build_groups != '' || inputs.include_raw
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - name: Install export tooling
        if: inputs.build_groups != '' || inputs.include_raw
        run: pnpm install --frozen-lockfile --prod

      - name: Restore WCA SQL export
        if: inputs.build_groups != '' || inputs.include_raw
        id: wca-cache
        uses: actions/cache/restore@v4
        with:
          path: /tmp/wca-export-cache
          key: wca-sql-export-\${{ inputs.export_date }}

      - name: Download WCA SQL export on cache miss
        if: (inputs.build_groups != '' || inputs.include_raw) && steps.wca-cache.outputs.cache-hit != 'true'
        run: |
          mkdir -p /tmp/wca-export-cache
          node scripts/sync-wca-export.mjs --dry-run

      - name: Save WCA SQL export
        if: (inputs.build_groups != '' || inputs.include_raw) && steps.wca-cache.outputs.cache-hit != 'true'
        uses: actions/cache/save@v4
        continue-on-error: true
        with:
          path: /tmp/wca-export-cache
          key: wca-sql-export-\${{ inputs.export_date }}

`;
  content = content.replace("jobs:\n  matrix:\n", `jobs:\n${job}  matrix:\n`);
}
content = content.replace("    needs: matrix\n    strategy:\n", "    needs: [matrix, raw-export]\n    strategy:\n");
content = content.replace(
  "    needs: [matrix, wave-one, wave-two]\n",
  "    needs: [matrix, raw-export, wave-one, wave-two]\n",
);
content = content.replace(
  "      && needs.matrix.result == 'success'\n",
  "      && needs.matrix.result == 'success'\n      && needs.raw-export.result == 'success'\n",
);
await writeFile(path, content);

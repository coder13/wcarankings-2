import { readFile, writeFile } from "node:fs/promises";

function extractRunStep(workflow, name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  if (start < 0) throw new Error(`Workflow step not found: ${name}`);
  const run = workflow.indexOf("        run: |\n", start);
  if (run < 0) throw new Error(`Workflow step has no run block: ${name}`);
  const bodyStart = run + "        run: |\n".length;
  const next = workflow.indexOf("      - name:", bodyStart);
  const raw = workflow.slice(bodyStart, next < 0 ? workflow.length : next);
  return raw
    .split("\n")
    .map((line) => line.startsWith("          ") ? line.slice(10) : line)
    .join("\n")
    .trimEnd();
}

const deployWorkflowPath = ".github/workflows/deploy-projections.yml";
const deployWorkflow = await readFile(deployWorkflowPath, "utf8");
const validate = extractRunStep(deployWorkflow, "Validate immutable release coordinates");
const verify = extractRunStep(deployWorkflow, "Verify projection release integrity and compatibility");
const stage = extractRunStep(deployWorkflow, "Stage exact generation directly from GHCR");
const activate = extractRunStep(deployWorkflow, "Prepare and atomically activate ranking generation");
const refreshSystem = extractRunStep(deployWorkflow, "Refresh database-backed system lists");
const refreshBoard = extractRunStep(deployWorkflow, "Refresh WCA Board list");
const refreshDelegates = extractRunStep(deployWorkflow, "Refresh WCA Delegates list");
const diagnostics = extractRunStep(deployWorkflow, "Capture failed generation diagnostics");
const cleanup = extractRunStep(deployWorkflow, "Remove deployment-specific image tags");

const deploymentScript = `#!/usr/bin/env bash
set -euo pipefail

capture_failed_generation_diagnostics() {
  set +e
${diagnostics.split("\n").map((line) => `  ${line}`).join("\n")}
}
trap capture_failed_generation_diagnostics ERR

# Validate immutable release coordinates.
${validate}

# Verify the lightweight release coordinate and compatibility contract.
${verify}

# Pull and stage exact digest-qualified release inputs directly on production.
${stage}

# Prepare, verify, and atomically activate the candidate generation.
${activate}

# Refresh database-backed and externally sourced system lists after activation.
${refreshSystem}
${refreshBoard}
${refreshDelegates}

trap - ERR
${cleanup}
`;
await writeFile("scripts/run-projection-deployment.sh", deploymentScript);

const prWorkflowPath = ".github/workflows/pull-request.yml";
const prWorkflow = await readFile(prWorkflowPath, "utf8");
const bulkTransfer = extractRunStep(prWorkflow, "Exercise bulk projection table transfer");
await writeFile(
  "scripts/test-bulk-projection-transfer.sh",
  `#!/usr/bin/env bash\nset -euo pipefail\n\n${bulkTransfer}\n`,
);

const testsPath = "tests/deploy-workflow.test.mjs";
let tests = await readFile(testsPath, "utf8");
if (!tests.includes("run-projection-deployment.sh")) {
  const close = tests.indexOf("];", tests.indexOf("Promise.all"));
  if (close < 0) throw new Error("Could not locate workflow fixture list");
  tests = `${tests.slice(0, close + 2)}\nconst projectionDeploymentScript = await readFile(\n  new URL(\"../scripts/run-projection-deployment.sh\", import.meta.url),\n  \"utf8\",\n);\nconst projectionDeploySource = `${"${projectionDeploy}"}\\n${"${projectionDeploymentScript}"}`;${tests.slice(close + 2)}`;
  tests = tests.replaceAll("assert.match(projectionDeploy,", "assert.match(projectionDeploySource,");
  tests = tests.replaceAll("assert.doesNotMatch(projectionDeploy,", "assert.doesNotMatch(projectionDeploySource,");
  tests = tests.replaceAll("projectionDeploy.includes(", "projectionDeploySource.includes(");
  tests = tests.replaceAll("projectionDeploy.match(", "projectionDeploySource.match(");
}
await writeFile(testsPath, tests);

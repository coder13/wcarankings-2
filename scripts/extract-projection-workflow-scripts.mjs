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

function secureRegistryTransfer(stage) {
  const insecureInvocation = [
    'ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \\',
    '  "GHCR_TOKEN=\'$GHCR_TOKEN\' \\',
    '   GHCR_ACTOR=\'$GHCR_ACTOR\' \\',
    '   ARTIFACT_ID=\'$ARTIFACT_ID\'',
  ].join("\n");
  const secureInvocation = [
    'local_auth_directory=$(mktemp -d)',
    'cleanup_local_auth() {',
    '  docker --config "$local_auth_directory" logout ghcr.io >/dev/null 2>&1 || true',
    '  rm -rf "$local_auth_directory"',
    '}',
    'trap cleanup_local_auth EXIT',
    'printf \'%s\' "$GHCR_TOKEN" \\',
    '  | docker --config "$local_auth_directory" login ghcr.io \\',
    '      --username "$GHCR_ACTOR" --password-stdin >/dev/null',
    'scp -q -o BatchMode=yes "$local_auth_directory/config.json" \\',
    '  "$SERVER_USER@$SERVER_IP:/tmp/wcarankings-${ARTIFACT_ID}-docker-config.json"',
    'ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" \\',
    '  "ARTIFACT_ID=\'$ARTIFACT_ID\'',
  ].join("\n");
  if (!stage.includes(insecureInvocation)) {
    throw new Error("Could not locate GHCR token-bearing SSH invocation");
  }
  let secured = stage.replace(insecureInvocation, secureInvocation);
  const remoteLogin = [
    'auth_directory=$(mktemp -d)',
    'stage_directory=$(mktemp -d)',
    'cleanup_stage() {',
    '  docker --config "$auth_directory" logout ghcr.io >/dev/null 2>&1 || true',
    '  rm -rf "$auth_directory" "$stage_directory"',
    '}',
    'trap cleanup_stage EXIT TERM INT HUP',
    '',
    'printf \'%s\' "$GHCR_TOKEN" \\',
    '  | docker --config "$auth_directory" login ghcr.io \\',
    '      --username "$GHCR_ACTOR" --password-stdin >/dev/null',
  ].join("\n");
  const remoteConfig = [
    'auth_directory=$(mktemp -d)',
    'stage_directory=$(mktemp -d)',
    'cleanup_stage() {',
    '  docker --config "$auth_directory" logout ghcr.io >/dev/null 2>&1 || true',
    '  rm -rf "$auth_directory" "$stage_directory"',
    '}',
    'trap cleanup_stage EXIT TERM INT HUP',
    'install -m 600 "/tmp/wcarankings-${ARTIFACT_ID}-docker-config.json" \\',
    '  "$auth_directory/config.json"',
    'rm -f "/tmp/wcarankings-${ARTIFACT_ID}-docker-config.json"',
  ].join("\n");
  if (!secured.includes(remoteLogin)) {
    throw new Error("Could not locate remote GHCR login block");
  }
  secured = secured.replace(remoteLogin, remoteConfig);
  secured += "\ncleanup_local_auth\ntrap - EXIT";
  return secured;
}

const deployWorkflowPath = ".github/workflows/deploy-projections.yml";
const deployWorkflow = await readFile(deployWorkflowPath, "utf8");
const validate = extractRunStep(deployWorkflow, "Validate immutable release coordinates");
const verify = extractRunStep(deployWorkflow, "Verify projection release integrity and compatibility");
const stage = secureRegistryTransfer(
  extractRunStep(deployWorkflow, "Stage exact generation directly from GHCR"),
);
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
  const fixture = [
    "",
    "const projectionDeploymentScript = await readFile(",
    "  new URL(\"../scripts/run-projection-deployment.sh\", import.meta.url),",
    "  \"utf8\",",
    ");",
    "const projectionDeploySource = projectionDeploy + \"\\n\" + projectionDeploymentScript;",
  ].join("\n");
  tests = tests.slice(0, close + 2) + fixture + tests.slice(close + 2);
  tests = tests.replaceAll("assert.match(projectionDeploy,", "assert.match(projectionDeploySource,");
  tests = tests.replaceAll("assert.doesNotMatch(projectionDeploy,", "assert.doesNotMatch(projectionDeploySource,");
  tests = tests.replaceAll("projectionDeploy.includes(", "projectionDeploySource.includes(");
  tests = tests.replaceAll("projectionDeploy.match(", "projectionDeploySource.match(");
}
await writeFile(testsPath, tests);

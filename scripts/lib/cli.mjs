export function argumentValue(name, argv = process.argv) {
  const prefix = `--${name}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? "";
}

export function hasArgument(name, argv = process.argv) {
  return argv.includes(`--${name}`);
}

export function listArgument(name, argv = process.argv) {
  return argumentValue(name, argv).split(",").map((value) => value.trim()).filter(Boolean);
}

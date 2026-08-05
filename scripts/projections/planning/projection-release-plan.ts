export * from "../../../data-tools/projections/release.ts";
import { projectionReleasePlanCli } from "../../../data-tools/projections/release.ts";

if (import.meta.main) await projectionReleasePlanCli();

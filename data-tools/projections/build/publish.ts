import { PUBLISHED_PROJECTION_TABLES } from "../../projection-catalog/tables.ts";
import { dropManagedObject, tableExists } from "../shared/database.ts";
import type { ProjectionConnection } from "../shared/database-types.ts";

export interface PublishProjectionTablesOptions {
  projectionSuffix?: string;
  tables?: readonly string[];
}

export async function publishProjectionTables(
  connection: ProjectionConnection,
  options: PublishProjectionTablesOptions = {},
): Promise<void> {
  const {
    projectionSuffix = "_staging",
    tables = PUBLISHED_PROJECTION_TABLES,
  } = options;
  const renames: string[] = [];
  const obsolete: string[] = [];
  for (const published of tables) {
    const previous = `${published}_previous`;
    await dropManagedObject(connection, previous);
    if (await tableExists(connection, published)) {
      renames.push(`\`${published}\` TO \`${previous}\``);
      obsolete.push(`\`${previous}\``);
    }
    renames.push(`\`${published}${projectionSuffix}\` TO \`${published}\``);
  }
  await connection.query(`RENAME TABLE ${renames.join(", ")}`);
  if (obsolete.length > 0)
    await connection.query(`DROP TABLE ${obsolete.join(", ")}`);
}

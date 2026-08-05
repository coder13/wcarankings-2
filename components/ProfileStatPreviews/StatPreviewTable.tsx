import type { ReactNode } from "react";

export function StatPreviewTable({
  tableName,
  controls,
  action,
  children,
}: {
  tableName?: string;
  controls?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="profilePreview">
      {tableName && (
        <div className="profilePreviewLabel">
          <h2 className="profilePreviewName">{tableName}</h2>
        </div>
      )}
      <div className="profilePreviewTable">
        {(controls || action) && (
          <div className="profilePreviewHeading">
            {controls}
            {action}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

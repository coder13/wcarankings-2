import type { ReactNode } from "react";

export function StatPreviewTable({
  tableName,
  labelAction,
  controls,
  action,
  surfaceClassName,
  children,
}: {
  tableName?: string;
  labelAction?: ReactNode;
  controls?: ReactNode;
  action?: ReactNode;
  surfaceClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className="profilePreview">
      {(tableName || labelAction) && (
        <div className="profilePreviewLabel">
          {tableName && <h2 className="profilePreviewName">{tableName}</h2>}
          {labelAction}
        </div>
      )}
      <div className={`profilePreviewTable ${surfaceClassName ?? ""}`}>
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

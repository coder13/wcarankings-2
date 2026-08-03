export function LoadingSpinner({ label }: { label: string }) {
  return (
    <span
      className="LoadingSpinner"
      role="status"
      aria-label={label}
      style={{ opacity: 0 }}
    >
      <svg
        className="LoadingSpinner-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="LoadingSpinner-track" cx="12" cy="12" r="9" />
        <path className="LoadingSpinner-arc" d="M12 3a9 9 0 0 1 9 9" />
      </svg>
    </span>
  );
}

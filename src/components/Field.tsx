import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}

/** Labeled input with the game's pink accent bar. */
export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label className="field__label" htmlFor={htmlFor}>
        <span className="field__bar" aria-hidden />
        {label}
        {hint && <span className="field__hint">{hint}</span>}
      </label>
      {children}
      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

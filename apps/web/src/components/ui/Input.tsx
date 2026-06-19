import * as React from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string | undefined;
  error?: string | undefined;
  hint?: string | undefined;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1 text-sm">
      {label ? <span className="font-medium text-fg">{label}</span> : null}
      <input
        id={inputId}
        ref={ref}
        className={cn(
          'h-11 w-full rounded-xl border bg-surface-2 px-3 text-fg placeholder:text-muted',
          'outline-none focus-visible:ring-2 focus-visible:ring-accent',
          error ? 'border-down' : 'border-border',
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error ? (
        <span className="text-xs text-down">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
});

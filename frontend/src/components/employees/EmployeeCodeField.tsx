'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import {
  employeeCodeNeedsCorrection,
  formatEmployeeCode,
  normalizeEmployeeCode,
  validateEmployeeCode,
} from '@/lib/employeeCode';
import { cn } from '@/lib/utils';

/**
 * Canonical employee-number display used everywhere in the app:
 * monospace string, leading zeros preserved, legacy non-conforming codes
 * rendered verbatim with a visible "needs correction" indicator.
 */
export function EmployeeCodeText({
  code,
  className,
  showCorrectionFlag = true,
  size = 'xs',
}: {
  code?: string | number | null;
  className?: string;
  showCorrectionFlag?: boolean;
  size?: 'xs' | 'sm';
}) {
  const display = formatEmployeeCode(code);
  const needsCorrection = showCorrectionFlag && employeeCodeNeedsCorrection(code);

  return (
    <span className={cn('inline-flex items-center gap-1.5 max-w-full', className)}>
      <span
        className={cn(
          'font-mono font-semibold text-slate-700 dark:text-slate-200 truncate',
          size === 'xs' ? 'text-[11px]' : 'text-xs'
        )}
        title={needsCorrection ? `Legacy employee number stored as "${display}" — digits only required` : display}
      >
        {display}
      </span>
      {needsCorrection && (
        <span
          className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[9.5px] font-bold uppercase tracking-wide"
          title="This record keeps a legacy non-numeric employee number. HR must correct it — the value is never rewritten automatically."
        >
          <AlertTriangle className="w-3 h-3" />
          Needs correction
        </span>
      )}
    </span>
  );
}

interface EmployeeCodeInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** Extra error coming from the backend rejection, merged with the local check. */
  serverError?: string | null;
  className?: string;
  id?: string;
  placeholder?: string;
  readOnly?: boolean;
}

/**
 * Employee-number text input with digits-only validation.
 * The value stays a string end-to-end, so "0007" is never collapsed to 7.
 */
export function EmployeeCodeInput({
  label = 'Employee Number',
  value,
  onChange,
  onBlur,
  required = true,
  disabled = false,
  serverError,
  className,
  id,
  placeholder = 'e.g. 1372',
  readOnly,
}: EmployeeCodeInputProps) {
  const [touched, setTouched] = React.useState(false);

  const localValidation = validateEmployeeCode(value, required);
  const showError = touched || Boolean(serverError);
  const error = showError ? serverError || (!localValidation.valid ? localValidation.error : undefined) : undefined;

  return (
    <div className={className}>
      <Input
        id={id}
        label={required ? `${label} *` : label}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={value}
        readOnly={readOnly}
        disabled={disabled}
        placeholder={placeholder}
        // Digits-only is enforced as a validation message, not by silently
        // stripping what the user typed — they must see why it is rejected.
        onChange={(e) => onChange(normalizeEmployeeCode(e.target.value))}
        onBlur={(e) => {
          setTouched(true);
          onBlur?.(normalizeEmployeeCode(e.target.value));
        }}
        error={error}
        helperText={
          employeeCodeNeedsCorrection(value)
            ? 'Existing legacy number — shown as recorded. Correct it to digits only when saving.'
            : 'Digits only, leading zeros preserved (e.g. 1372, 1604).'
        }
      />
    </div>
  );
}

/** Inline filter box for searching by employee number (digits only). */
export function EmployeeCodeFilter({
  value,
  onChange,
  className,
  label = 'Filter by employee number',
}: {
  value: string;
  onChange: (value: string, error: string | null) => void;
  className?: string;
  label?: string;
}) {
  const validation = value ? validateEmployeeCode(value, true) : { valid: true as boolean, error: undefined };
  const error = validation.valid ? null : validation.error;

  return (
    <Input
      label={label}
      className={className}
      type="text"
      inputMode="numeric"
      placeholder="e.g. 1604"
      value={value}
      onChange={(e) => {
        const next = normalizeEmployeeCode(e.target.value);
        onChange(next, next ? (validateEmployeeCode(next, true).valid ? null : 'Employee number must be digits only.') : null);
      }}
      error={error ?? undefined}
    />
  );
}

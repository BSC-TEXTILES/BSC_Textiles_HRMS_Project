/**
 * Minimal, dependency-free RFC 4180 CSV reader/writer used by the bulk employee
 * importer and exporter.
 *
 * Safety notes
 * ------------
 *  - Cell contents are ALWAYS treated as untrusted plain text. Nothing here
 *    evaluates spreadsheet formulas; the importer never interprets `=`, `+`,
 *    `-` or `@` as anything other than literal characters.
 *  - When WRITING files that a human may open in Excel, values that a
 *    spreadsheet would treat as a formula are neutralised by prefixing a
 *    single quote (`'`), which Excel renders as a literal value. This blocks
 *    CSV formula injection through employee names, remarks, addresses, etc.
 *  - Handles UTF-8 BOM (Excel "UTF-8 CSV"), CRLF/LF, quoted fields with
 *    embedded commas, quotation marks (escaped as "") and line breaks.
 */

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/** Neutralise spreadsheet formula injection for a value being written to CSV. */
export function guardFormula(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (s.length > 0 && FORMULA_PREFIXES.includes(s[0])) {
    return `'${s}`;
  }
  return s;
}

/** Strip a UTF-8 BOM if present (Excel frequently emits one). */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Parse CSV text into a matrix of raw string cells.
 * Blank trailing lines are discarded.
 */
export function parseCsv(text: string): string[][] {
  const input = stripBom(text ?? '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    // Drop completely-empty trailing rows produced by a final newline.
    if (row.length === 1 && row[0].trim() === '') {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      // A quote only opens a quoted field at the start of a field; anywhere
      // else (e.g. `O'Brien, "Bob"`) it is treated literally.
      if (field.length === 0) {
        inQuotes = true;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === ',') {
      pushField();
      i++;
      continue;
    }

    if (ch === '\r') {
      // CRLF or lone CR terminates a record.
      if (input[i + 1] === '\n') i++;
      pushRow();
      i++;
      continue;
    }

    if (ch === '\n') {
      pushRow();
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // Flush the final field/row (input without a trailing newline).
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}

/** Serialise a matrix of cells into RFC 4180 CSV text (CRLF line endings). */
export function toCsv(rows: Array<Array<unknown>>, options?: { guardFormulas?: boolean }): string {
  const guard = options?.guardFormulas !== false;
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const raw = guard ? guardFormula(cell) : cell === null || cell === undefined ? '' : String(cell);
          const needsQuotes = /[",\r\n]/.test(raw);
          return needsQuotes ? `"${raw.replace(/"/g, '""')}"` : raw;
        })
        .join(',')
    )
    .join('\r\n');
}

/** Normalise a mobile number to its last 10 digits for comparison/matching. */
export function normalizePhone(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Normalise an email address for uniqueness checks. */
export function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/** Normalise a header cell so `Employee ID`, `employee id` and `EMPLOYEE_ID` all match. */
export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s.\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

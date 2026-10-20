/**
 * Minimal RFC 4180 CSV parser: quoted fields, `""` escapes, embedded commas/newlines,
 * CRLF/LF/CR line ends, optional UTF-8 BOM. Pure; never evaluates anything.
 * Returns rows of fields; blank lines are skipped. Throws CsvError on an unterminated quote.
 */
export class CsvError extends Error {
  constructor(
    message: string,
    /** 1-based line where the offending quoted field started. */
    readonly line: number,
  ) {
    super(message);
    this.name = "CsvError";
  }
}

export interface CsvRecord {
  fields: string[];
  /** 1-based line where the record starts (differs from its index when fields contain newlines). */
  line: number;
}

export function parseCsv(text: string, delimiter = ","): string[][] {
  return parseCsvRecords(text, delimiter).map((r) => r.fields);
}

export function parseCsvRecords(text: string, delimiter = ","): CsvRecord[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: CsvRecord[] = [];
  let rowLine = 1;
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteLine = 1;
  let line = 1;
  let rowHasContent = false; // distinguishes a blank line from a row with one empty quoted field

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (rowHasContent || row.length > 1 || row[0] !== "")
      rows.push({ fields: row, line: rowLine });
    row = [];
    rowHasContent = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (c === "\n") line++;
        field += c;
      }
    } else if (c === '"' && field === "") {
      inQuotes = true;
      rowHasContent = true;
      quoteLine = line;
    } else if (c === delimiter) {
      endField();
      rowHasContent = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
      rowLine = line;
    } else {
      field += c;
    }
  }
  if (inQuotes) throw new CsvError("Unterminated quoted field", quoteLine);
  if (field !== "" || row.length > 0 || rowHasContent) endRow();
  return rows;
}

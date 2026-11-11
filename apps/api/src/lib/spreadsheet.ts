import ExcelJS from "exceljs";
import type { FastifyReply } from "fastify";

// Small helper for Excel exports (HRMS has a richer lib/spreadsheet.ts; this is the same idea).

export interface SheetColumn<T> {
  header: string;
  width?: number;
  /** Excel number format, e.g. '"$"#,##0.00' or '0.0"%"'. */
  numFmt?: string;
  value: (row: T) => string | number | Date | null;
}

export interface SheetSpec<T> {
  name: string;
  columns: SheetColumn<T>[];
  rows: T[];
  /** Optional lines above the table (title, period, generated-at). */
  intro?: string[];
}

export const MONEY_FMT = '"$"#,##0.00';

export async function buildWorkbook<T>(sheets: SheetSpec<T>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Integer ERP";
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name.slice(0, 31));
    for (const line of spec.intro ?? []) ws.addRow([line]).font = { bold: ws.rowCount === 0 };
    if (spec.intro?.length) ws.addRow([]);
    const header = ws.addRow(spec.columns.map((c) => c.header));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3E9F1" } };
    });
    const headerRow = header.number;
    for (const row of spec.rows) ws.addRow(spec.columns.map((c) => c.value(row)));
    spec.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width ?? Math.max(12, c.header.length + 2);
      if (c.numFmt) col.numFmt = c.numFmt;
    });
    ws.views = [{ state: "frozen", ySplit: headerRow }];
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: spec.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function sendXlsx(reply: FastifyReply, fileName: string, data: Buffer) {
  return reply
    .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .header("Content-Disposition", `attachment; filename="${fileName.replace(/[^\w.-]/g, "_")}"`)
    .send(data);
}

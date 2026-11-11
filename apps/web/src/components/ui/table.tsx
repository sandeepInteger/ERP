import * as React from "react";
import { cn } from "../../lib/utils.js";

/** Wide tables scroll inside this box instead of widening the page.
 *  `relative` keeps absolutely-positioned children (e.g. sr-only header labels) inside the box too. */
const TableScroll = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("relative w-full overflow-x-auto", className)} {...props} />
);

/** Card layout below `xl` (1280px; phones: one column, tablets and small laptops: two). The first column is the card title; every other
 *  cell shows its column header as a label (`data-label`, filled in from <thead> by `useStackLabels`). */
const STACK = cn(
  "max-xl:block max-xl:[&>thead]:hidden",
  "max-xl:[&>tbody]:grid max-xl:[&>tbody]:gap-3 max-xl:[&>tbody]:p-3 md:max-xl:[&>tbody]:grid-cols-2",
  "max-xl:[&>tbody>tr]:flex max-xl:[&>tbody>tr]:flex-col max-xl:[&>tbody>tr]:gap-0.5 max-xl:[&>tbody>tr]:rounded-md",
  "max-xl:[&>tbody>tr]:border max-xl:[&>tbody>tr]:border-surface-200 max-xl:[&>tbody>tr]:bg-surface-0 max-xl:[&>tbody>tr]:p-3",
  "max-xl:[&>tbody>tr>td]:grid max-xl:[&>tbody>tr>td]:grid-cols-[7rem_minmax(0,1fr)] max-xl:[&>tbody>tr>td]:items-baseline max-xl:[&>tbody>tr>td]:justify-items-start",
  "max-xl:[&>tbody>tr>td]:gap-3 max-xl:[&>tbody>tr>td]:px-0 max-xl:[&>tbody>tr>td]:py-1 max-xl:[&>tbody>tr>td]:text-left",
  "max-xl:[&>tbody>tr>td]:before:content-[attr(data-label)] max-xl:[&>tbody>tr>td]:before:text-[11px]",
  "max-xl:[&>tbody>tr>td]:before:font-bold max-xl:[&>tbody>tr>td]:before:uppercase max-xl:[&>tbody>tr>td]:before:tracking-[0.5px]",
  "max-xl:[&>tbody>tr>td]:before:text-surface-500",
  // Every child of a labelled cell stays in the value column (a second line must not slip under the label).
  "max-xl:[&>tbody>tr>td[data-label]>*]:col-start-2",
  "max-xl:[&>tbody>tr>td:not([data-label])]:block max-xl:[&>tbody>tr>td:first-child]:text-[15px]",
  // Links in a card (e.g. a site ID) get a finger-sized tap area.
  "max-xl:[&>tbody>tr>td>a]:inline-flex max-xl:[&>tbody>tr>td>a]:min-h-10 max-xl:[&>tbody>tr>td>a]:items-center",
);

/** Copies each column's header text onto its body cells as `data-label` (skips the first column and
 *  headers whose only text is screen-reader text, e.g. an "Actions" column of buttons). */
function useStackLabels(table: React.RefObject<HTMLTableElement | null>, on: boolean) {
  React.useLayoutEffect(() => {
    const t = table.current;
    if (!on || !t) return;
    const apply = () => {
      const heads: string[] = [];
      t.querySelectorAll(":scope > thead > tr:first-child > th").forEach((th) => {
        const sr = th.querySelector(".sr-only");
        const text = (th.textContent ?? "").trim();
        const label = sr && text === (sr.textContent ?? "").trim() ? "" : text;
        for (let i = 0; i < ((th as HTMLTableCellElement).colSpan || 1); i++) heads.push(label);
      });
      t.querySelectorAll(":scope > tbody > tr").forEach((tr) => {
        let col = 0;
        for (const cell of Array.from(tr.children) as HTMLTableCellElement[]) {
          const label = col === 0 || cell.colSpan > 1 ? "" : heads[col] ?? "";
          if (label) cell.setAttribute("data-label", label);
          else cell.removeAttribute("data-label");
          col += cell.colSpan || 1;
        }
      });
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(t, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [table, on]);
}

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** Show rows as labelled cards on phones and tablets instead of a sideways-scrolling table. */
  stack?: boolean | undefined;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(({ className, stack = false, ...props }, ref) => {
  const inner = React.useRef<HTMLTableElement>(null);
  React.useImperativeHandle(ref, () => inner.current as HTMLTableElement);
  useStackLabels(inner, stack);
  return <table ref={inner} className={cn("w-full border-collapse text-[13px]", stack && STACK, className)} {...props} />;
});
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("bg-surface-50", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={className} {...props} />,
);
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => <tr ref={ref} className={cn("border-b border-surface-100", className)} {...props} />,
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn("whitespace-nowrap border-b border-surface-200 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-surface-500", className)}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <td ref={ref} className={cn("px-3 py-2.5 align-top", className)} {...props} />,
);
TableCell.displayName = "TableCell";

/** One full-width row for "nothing here" or "loading". */
function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-surface-500">{children}</td>
    </tr>
  );
}

export { TableScroll, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty };

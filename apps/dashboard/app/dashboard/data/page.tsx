import { DataTableView } from "@/components/data-table-view";

export default function DataPage() {
  return (
    <div className="flex flex-col h-full p-4 gap-3">
      <div>
        <h1 className="text-lg font-semibold">Data</h1>
        <p className="text-xs text-muted-foreground">
          Live view of the seeded &amp; generated Neon tables.
        </p>
      </div>
      <DataTableView />
    </div>
  );
}

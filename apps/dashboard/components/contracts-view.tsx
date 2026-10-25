"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlusIcon, PaperclipIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InfoTip } from "@/components/info-tip";
import { useMoney } from "@/components/currency-provider";
import type { ContractRow } from "@/lib/contracts";

interface Material {
  materialId: string;
  name: string;
  unit: string;
}

const HEALTH: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  expiring: { label: "Expiring", variant: "secondary" },
  expired: { label: "Expired", variant: "destructive" },
  upcoming: { label: "Upcoming", variant: "outline" },
  terminated: { label: "Terminated", variant: "outline" },
};

const EMPTY = {
  supplier: "",
  materialId: "",
  unitPrice: "",
  minQty: "1",
  maxQty: "",
  leadTimeDays: "",
  validFrom: "",
  validTo: "",
  paymentTerms: "",
  penaltyTerms: "",
};

export function ContractsView() {
  const { money } = useMoney();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await fetch("/api/contracts").then((r) => r.json());
    setContracts(data.contracts);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, setState happens after the await
    refresh();
    fetch("/api/inventory").then((r) => r.json()).then((d) => setMaterials(d.inventory));
    fetch("/api/suppliers").then((r) => r.json()).then((d) => setSuppliers(d.suppliers ?? []));
  }, [refresh]);

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMessage(null);
    try {
      const text = await fn();
      if (text) setMessage({ text });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "failed", error: true });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  function openForm(c?: ContractRow) {
    setForm(
      c
        ? {
            supplier: c.supplier,
            materialId: c.materialId,
            unitPrice: String(c.unitPrice),
            minQty: String(c.minQty),
            maxQty: String(c.maxQty),
            leadTimeDays: String(c.leadTimeDays),
            validFrom: c.validFrom,
            validTo: c.validTo,
            paymentTerms: c.paymentTerms ?? "",
            penaltyTerms: c.penaltyTerms ?? "",
          }
        : EMPTY
    );
    setEditing(c ? c.id : "new");
  }

  const save = () =>
    run(async () => {
      const body = {
        ...form,
        unitPrice: Number(form.unitPrice),
        minQty: Number(form.minQty),
        maxQty: Number(form.maxQty),
        leadTimeDays: Number(form.leadTimeDays),
      };
      const res = await fetch(editing === "new" ? "/api/contracts" : `/api/contracts/${editing}`, {
        method: editing === "new" ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "could not save");
      setEditing(null);
      return "Contract saved.";
    });

  const terminate = (c: ContractRow) =>
    run(async () => {
      if (!window.confirm(`Terminate the ${c.supplier.replace(/_/g, " ")} contract for ${c.material}? Agents will stop buying under it.`)) return;
      const res = await fetch(`/api/contracts/${c.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "could not terminate");
      return "Contract terminated.";
    });

  const upload = (file: File) =>
    run(async () => {
      const id = uploadFor.current;
      if (!id) return;
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/contracts/${id}/file`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "upload failed");
      return `Attached ${file.name}.`;
    });

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const materialName = materials.find((m) => m.materialId === form.materialId)?.name;
  const formValid =
    form.supplier.trim() !== "" && form.materialId !== "" && Number(form.unitPrice) > 0 && Number(form.maxQty) >= Number(form.minQty) &&
    form.leadTimeDays !== "" && form.validFrom !== "" && form.validTo !== "";

  return (
    <TooltipProvider delay={150}>
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold">Supplier contracts</h1>
            <p className="text-xs text-muted-foreground">
              The purchasing agent only buys under a contract that is active, in date, and covers the quantity. Price and lead time come from the contract.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {message && <p className={`max-w-sm text-right text-xs ${message.error ? "text-destructive" : "text-muted-foreground"}`}>{message.text}</p>}
            <Button size="sm" onClick={() => openForm()}>
              <PlusIcon /> Add contract
            </Button>
          </div>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(f);
          }}
        />

        <ScrollArea className="min-h-0 flex-1 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-8 text-[11px]">Material</TableHead>
                <TableHead className="h-8 text-[11px]">Supplier</TableHead>
                <TableHead className="h-8 text-right text-[11px]">Unit price</TableHead>
                <TableHead className="h-8 text-[11px]">
                  <span className="inline-flex items-center gap-1">
                    Qty range <InfoTip label="Qty range">A purchase outside this range cannot use the contract. The agent will pick another supplier or ask you.</InfoTip>
                  </span>
                </TableHead>
                <TableHead className="h-8 text-right text-[11px]">Lead (d)</TableHead>
                <TableHead className="h-8 text-[11px]">Valid</TableHead>
                <TableHead className="h-8 text-[11px]">Status</TableHead>
                <TableHead className="h-8 text-[11px]">Terms</TableHead>
                <TableHead className="h-8 text-[11px]">Document</TableHead>
                <TableHead className="h-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((c) => (
                <TableRow key={c.id} className="text-xs">
                  <TableCell className="py-1.5">{c.material}</TableCell>
                  <TableCell className="py-1.5">{c.supplier.replace(/_/g, " ")}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono tabular-nums">{money(c.unitPrice)}</TableCell>
                  <TableCell className="py-1.5 font-mono tabular-nums">{c.minQty}–{c.maxQty}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono tabular-nums">{c.leadTimeDays}</TableCell>
                  <TableCell className="py-1.5 font-mono whitespace-nowrap">{c.validFrom} → {c.validTo}</TableCell>
                  <TableCell className="py-1.5">
                    <Badge variant={HEALTH[c.health].variant} className="h-4 px-1.5 text-[10px]">{HEALTH[c.health].label}</Badge>
                  </TableCell>
                  <TableCell className="max-w-48 truncate py-1.5 text-muted-foreground" title={`${c.paymentTerms ?? ""} | ${c.penaltyTerms ?? ""}`}>
                    {c.paymentTerms ?? "—"}
                  </TableCell>
                  <TableCell className="py-1.5">
                    {c.hasFile ? (
                      <a href={`/api/contracts/${c.id}/file`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                        <PaperclipIcon className="size-3" /> {c.fileName}
                      </a>
                    ) : (
                      <Button size="xs" variant="ghost" disabled={busy} onClick={() => { uploadFor.current = c.id; fileInput.current?.click(); }}>
                        Attach
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <div className="flex gap-1">
                      <Button size="xs" variant="ghost" disabled={busy} onClick={() => openForm(c)}>Edit</Button>
                      {c.health !== "terminated" && (
                        <Button size="xs" variant="ghost" disabled={busy} onClick={() => terminate(c)}>Terminate</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-sm">{editing === "new" ? "Add contract" : "Edit contract"}</DialogTitle>
              <DialogDescription className="text-xs">Agents read these terms when they buy. Attach the signed document from the table afterwards.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="c-sup" className="text-xs">Supplier</Label>
                <Input id="c-sup" list="supplier-list" className="h-8 text-xs" value={form.supplier} onChange={set("supplier")} />
                <datalist id="supplier-list">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Material</Label>
                <Select value={form.materialId} onValueChange={(v) => setForm((f) => ({ ...f, materialId: String(v ?? "") }))}>
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder="Choose a material">{() => materialName ?? "Choose a material"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((m) => <SelectItem key={m.materialId} value={m.materialId} className="text-xs">{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {([
                ["unitPrice", "Unit price (USD)"],
                ["leadTimeDays", "Lead time (days)"],
                ["minQty", "Min quantity"],
                ["maxQty", "Max quantity"],
              ] as const).map(([k, label]) => (
                <div key={k} className="space-y-1">
                  <Label htmlFor={`c-${k}`} className="text-xs">{label}</Label>
                  <Input id={`c-${k}`} type="number" min={0} className="h-8 font-mono text-xs" value={form[k]} onChange={set(k)} />
                </div>
              ))}
              <div className="space-y-1">
                <Label htmlFor="c-from" className="text-xs">Valid from</Label>
                <Input id="c-from" type="date" className="h-8 font-mono text-xs" value={form.validFrom} onChange={set("validFrom")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-to" className="text-xs">Valid to</Label>
                <Input id="c-to" type="date" className="h-8 font-mono text-xs" value={form.validTo} onChange={set("validTo")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-pay" className="text-xs">Payment terms</Label>
                <Input id="c-pay" className="h-8 text-xs" placeholder="Net 30" value={form.paymentTerms} onChange={set("paymentTerms")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-pen" className="text-xs">Penalty terms</Label>
                <Input id="c-pen" className="h-8 text-xs" placeholder="1% per late day" value={form.penaltyTerms} onChange={set("penaltyTerms")} />
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" disabled={busy || !formValid} onClick={save}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

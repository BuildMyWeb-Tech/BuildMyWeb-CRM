"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CompanyInfoField, CompanyInfoValue } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, Settings, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// Company Info — a small admin-defined form rather than a fixed
// set of columns, per BMW's call: start blank, admin adds whatever
// fields matter (Legal Name, GSTIN, whatever) and marks each
// required or optional. Mirrors the app's existing
// custom_fields/contact_custom_values EAV pattern
// (001_initial_schema.sql) rather than inventing a new shape.
//
// isAdmin gates editing (field management + saving values); a
// member with office_access can view this page but not edit it —
// see 043_bmw_office.sql.

interface CompanyInfoProps {
  accountId: string;
  currentUserId: string;
  isAdmin: boolean;
}

export function CompanyInfo({ accountId, currentUserId, isAdmin }: CompanyInfoProps) {
  const supabase = createClient();
  const [fields, setFields] = useState<CompanyInfoField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [manageOpen, setManageOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [addingField, setAddingField] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [fieldsRes, valuesRes] = await Promise.all([
      supabase
        .from("company_info_fields")
        .select("*")
        .eq("account_id", accountId)
        .order("position", { ascending: true }),
      supabase.from("company_info_values").select("*").eq("account_id", accountId),
    ]);
    setFields(fieldsRes.data ?? []);
    const valueMap: Record<string, string> = {};
    for (const v of (valuesRes.data ?? []) as CompanyInfoValue[]) {
      valueMap[v.field_id] = v.value ?? "";
    }
    setValues(valueMap);
    setLoading(false);
  }, [supabase, accountId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddField() {
    const trimmed = newFieldName.trim();
    if (!trimmed) return;
    setAddingField(true);
    try {
      const { data, error } = await supabase
        .from("company_info_fields")
        .insert({
          account_id: accountId,
          field_name: trimmed,
          is_required: newFieldRequired,
          position: fields.length,
        })
        .select()
        .single();
      if (error || !data) {
        toast.error("Could not add field.");
        return;
      }
      setFields([...fields, data]);
      setNewFieldName("");
      setNewFieldRequired(false);
    } finally {
      setAddingField(false);
    }
  }

  async function handleDeleteField(fieldId: string) {
    const { error } = await supabase.from("company_info_fields").delete().eq("id", fieldId);
    if (error) {
      toast.error("Could not delete field.");
      return;
    }
    setFields(fields.filter((f) => f.id !== fieldId));
    setValues((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }

  async function handleToggleRequired(field: CompanyInfoField) {
    const { error } = await supabase
      .from("company_info_fields")
      .update({ is_required: !field.is_required })
      .eq("id", field.id);
    if (error) {
      toast.error("Could not update field.");
      return;
    }
    setFields(fields.map((f) => (f.id === field.id ? { ...f, is_required: !f.is_required } : f)));
  }

  async function handleSaveValues() {
    const missingRequired = fields.filter((f) => f.is_required && !values[f.id]?.trim());
    if (missingRequired.length > 0) {
      toast.error(`Fill in required field${missingRequired.length > 1 ? "s" : ""}: ${missingRequired.map((f) => f.field_name).join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      const rows = fields.map((f) => ({
        account_id: accountId,
        field_id: f.id,
        value: values[f.id] ?? "",
        updated_by: currentUserId,
      }));
      if (rows.length === 0) {
        setSaving(false);
        return;
      }
      const { error } = await supabase
        .from("company_info_values")
        .upsert(rows, { onConflict: "account_id,field_id" });
      if (error) {
        toast.error("Could not save.");
        return;
      }
      toast.success("Company info saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-8 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mt-4">
      {isAdmin && (
        <div className="mb-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Manage fields
          </Button>
        </div>
      )}

      {fields.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-14 text-center">
          <p className="text-sm text-muted-foreground">No company info fields yet.</p>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add your first field
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {fields.map((field) => (
            <div key={field.id} className="grid gap-1.5">
              <Label className="flex items-center gap-1 text-muted-foreground">
                {field.field_name}
                {field.is_required && <span className="text-red-400">*</span>}
              </Label>
              <Input
                value={values[field.id] ?? ""}
                onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                disabled={!isAdmin}
                className="border-border bg-muted text-foreground disabled:opacity-100"
              />
            </div>
          ))}
          {isAdmin && (
            <Button onClick={handleSaveValues} disabled={saving} className="mt-2 w-fit">
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      )}

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-md bg-popover border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Manage fields</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {fields.length > 0 && (
              <div className="space-y-2">
                {fields.map((field) => (
                  <div
                    key={field.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2"
                  >
                    <span className="flex-1 truncate text-sm text-foreground">
                      {field.field_name}
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox
                        checked={field.is_required}
                        onCheckedChange={() => handleToggleRequired(field)}
                      />
                      Required
                    </label>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDeleteField(field.id)}
                      className="text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-dashed border-border p-3">
              <Label className="text-muted-foreground">New field</Label>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder="e.g. GSTIN, Bank Account Number"
                  className="border-border bg-muted text-sm text-foreground"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddField();
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddField}
                  disabled={addingField || !newFieldName.trim()}
                  className="shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={newFieldRequired}
                  onCheckedChange={(checked) => setNewFieldRequired(checked === true)}
                />
                Required
              </label>
            </div>

            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              Required fields are enforced when saving values, not retroactively —
              existing blank values stay blank until someone fills them in.
            </p>
          </div>

          <DialogFooter className="border-border bg-popover/50">
            <Button onClick={() => setManageOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
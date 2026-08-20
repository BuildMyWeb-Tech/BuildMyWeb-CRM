"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  CustomFieldDef,
  CustomFieldEntityType,
  CustomFieldType,
  CustomFieldValue,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Settings, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";

// The generic Custom Fields engine (047_custom_fields.sql) — one
// component, reused on Clients, Scope of Work, Daily Tasks, and
// Kanban cards. Admin defines fields (text/file/dropdown/checkbox/
// radio) per entity_type via "Manage fields"; anyone with at least
// employee access can fill in values on a specific record — matches
// the same admin-defines / employee-fills split as Company Info
// (Phase 4), generalized to 5 field types and 4 entity types instead
// of 1 each.
//
// All reads/writes go straight through the RLS-scoped browser
// client, same pattern as company-info.tsx and file-manager.tsx.

interface CustomFieldsSectionProps {
  accountId: string;
  currentUserId: string;
  entityType: CustomFieldEntityType;
  /** null while creating a not-yet-saved record — values can't be
   * filled in until the record (and its id) exists. */
  entityId: string | null;
  isAdmin: boolean;
  /** Employee+ can fill values; viewer-only sees them read-only. */
  canEdit: boolean;
}

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  file: "File upload",
  dropdown: "Dropdown",
  checkbox: "Checkbox",
  radio: "Radio buttons",
};

export function CustomFieldsSection({
  accountId,
  currentUserId,
  entityType,
  entityId,
  isAdmin,
  canEdit,
}: CustomFieldsSectionProps) {
  const supabase = createClient();
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [values, setValues] = useState<Record<string, CustomFieldValue>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const [manageOpen, setManageOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [addingField, setAddingField] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const fieldsRes = await supabase
      .from("custom_field_defs")
      .select("*")
      .eq("account_id", accountId)
      .eq("entity_type", entityType)
      .order("position", { ascending: true });
    setFields(fieldsRes.data ?? []);

    if (entityId) {
      const valuesRes = await supabase
        .from("custom_field_values")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);
      const map: Record<string, CustomFieldValue> = {};
      for (const v of (valuesRes.data ?? []) as CustomFieldValue[]) {
        map[v.field_id] = v;
      }
      setValues(map);
    } else {
      setValues({});
    }
    setLoading(false);
  }, [supabase, accountId, entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveValue(field: CustomFieldDef, raw: string) {
    if (!entityId) return;
    setSaving(field.id);
    try {
      const { data, error } = await supabase
        .from("custom_field_values")
        .upsert(
          {
            account_id: accountId,
            field_id: field.id,
            entity_type: entityType,
            entity_id: entityId,
            value: raw,
            updated_by: currentUserId,
          },
          { onConflict: "field_id,entity_id" },
        )
        .select()
        .single();
      if (error || !data) {
        toast.error("Could not save.");
        return;
      }
      setValues((prev) => ({ ...prev, [field.id]: data }));
    } finally {
      setSaving(null);
    }
  }

  async function handleFileUpload(field: CustomFieldDef, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !entityId) return;

    setUploading(field.id);
    try {
      const path = `${accountId}/custom-fields/${field.id}-${entityId}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("files").upload(path, file, {
        upsert: true,
      });
      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`);
        return;
      }
      const { data, error } = await supabase
        .from("custom_field_values")
        .upsert(
          {
            account_id: accountId,
            field_id: field.id,
            entity_type: entityType,
            entity_id: entityId,
            file_storage_path: path,
            file_name: file.name,
            updated_by: currentUserId,
          },
          { onConflict: "field_id,entity_id" },
        )
        .select()
        .single();
      if (error || !data) {
        toast.error("File uploaded but could not be recorded.");
        return;
      }
      setValues((prev) => ({ ...prev, [field.id]: data }));
      toast.success("File attached.");
    } finally {
      setUploading(null);
    }
  }

  async function handleDownloadFile(value: CustomFieldValue) {
    if (!value.file_storage_path) return;
    const { data, error } = await supabase.storage
      .from("files")
      .createSignedUrl(value.file_storage_path, 60, { download: value.file_name ?? undefined });
    if (error || !data) {
      toast.error("Could not generate a download link.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function handleAddField() {
    const trimmed = newFieldName.trim();
    if (!trimmed) return;
    setAddingField(true);
    try {
      const options =
        newFieldType === "dropdown" || newFieldType === "radio"
          ? newFieldOptions
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean)
          : [];
      const { data, error } = await supabase
        .from("custom_field_defs")
        .insert({
          account_id: accountId,
          entity_type: entityType,
          field_name: trimmed,
          field_type: newFieldType,
          field_options: options,
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
      setNewFieldType("text");
      setNewFieldOptions("");
      setNewFieldRequired(false);
    } finally {
      setAddingField(false);
    }
  }

  async function handleDeleteField(fieldId: string) {
    const { error } = await supabase.from("custom_field_defs").delete().eq("id", fieldId);
    if (error) {
      toast.error("Could not delete field.");
      return;
    }
    setFields(fields.filter((f) => f.id !== fieldId));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (fields.length === 0 && !isAdmin) return null;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Custom fields</p>
        {isAdmin && (
          <Button variant="ghost" size="icon-xs" onClick={() => setManageOpen(true)}>
            <Settings className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">No custom fields set up yet.</p>
      ) : !entityId ? (
        <p className="text-xs text-muted-foreground">Save first, then fill in custom fields.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {fields.map((field) => {
            const val = values[field.id];
            return (
              <div key={field.id} className="grid gap-1.5">
                <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                  {field.field_name}
                  {field.is_required && <span className="text-red-400">*</span>}
                </Label>

                {field.field_type === "text" && (
                  <Input
                    defaultValue={val?.value ?? ""}
                    disabled={!canEdit}
                    onBlur={(e) => saveValue(field, e.target.value)}
                    className="border-border bg-muted text-sm text-foreground disabled:opacity-100"
                  />
                )}

                {field.field_type === "dropdown" && (
                  <Select
                    value={val?.value ?? ""}
                    onValueChange={(v) => v && saveValue(field, v)}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue className="truncate">
                        {(v: string) => v || "Select…"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {field.field_options.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {field.field_type === "radio" && (
                  <div className="flex flex-wrap gap-3">
                    {field.field_options.map((opt) => (
                      <label key={opt} className="flex items-center gap-1.5 text-sm text-foreground">
                        <input
                          type="radio"
                          name={`radio-${field.id}`}
                          value={opt}
                          checked={val?.value === opt}
                          disabled={!canEdit}
                          onChange={() => saveValue(field, opt)}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}

                {field.field_type === "checkbox" && (
                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={val?.value === "true"}
                      disabled={!canEdit}
                      onCheckedChange={(checked) => saveValue(field, checked === true ? "true" : "false")}
                    />
                    <span className="text-sm text-muted-foreground">
                      {val?.value === "true" ? "Yes" : "No"}
                    </span>
                  </label>
                )}

                {field.field_type === "file" && (
                  <div className="flex items-center gap-2">
                    {val?.file_name ? (
                      <button
                        type="button"
                        onClick={() => handleDownloadFile(val)}
                        className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        {val.file_name}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">No file attached</span>
                    )}
                    {canEdit && (
                      <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        {uploading === field.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Paperclip className="h-3 w-3" />
                        )}
                        {val?.file_name ? "Replace" : "Upload"}
                        <input
                          type="file"
                          className="hidden"
                          disabled={uploading === field.id}
                          onChange={(e) => handleFileUpload(field, e)}
                        />
                      </label>
                    )}
                  </div>
                )}

                {saving === field.id && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-md bg-popover border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Manage custom fields</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {fields.length > 0 && (
              <div className="space-y-2">
                {fields.map((field) => (
                  <div
                    key={field.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2"
                  >
                    <div className="flex-1">
                      <p className="truncate text-sm text-foreground">{field.field_name}</p>
                      <p className="text-[10px] uppercase text-muted-foreground">
                        {FIELD_TYPE_LABELS[field.field_type]}
                        {field.is_required ? " · required" : ""}
                      </p>
                    </div>
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
              <div className="mt-2 flex flex-col gap-2">
                <Input
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder="Field name"
                  className="border-border bg-muted text-sm text-foreground"
                />
                <Select value={newFieldType} onValueChange={(v) => v && setNewFieldType(v as CustomFieldType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue className="truncate">
                      {(v: string) => FIELD_TYPE_LABELS[v as CustomFieldType]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {FIELD_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(newFieldType === "dropdown" || newFieldType === "radio") && (
                  <Input
                    value={newFieldOptions}
                    onChange={(e) => setNewFieldOptions(e.target.value)}
                    placeholder="Comma-separated options, e.g. Website, Logo, Video"
                    className="border-border bg-muted text-sm text-foreground"
                  />
                )}
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={newFieldRequired}
                    onCheckedChange={(checked) => setNewFieldRequired(checked === true)}
                  />
                  Required
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddField}
                  disabled={addingField || !newFieldName.trim()}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add field
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="border-border bg-popover/50">
            <Button onClick={() => setManageOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

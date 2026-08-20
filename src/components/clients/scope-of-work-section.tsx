"use client";

import { useState } from "react";
import type { ScopeOfWork } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import { Plus, Briefcase } from "lucide-react";
import { toast } from "sonner";

// Scope of Work — one-to-many per client. "Service category" and
// "Deliverable/type of work" (the reference screenshots' dropdowns)
// are Custom Fields (entity_type='scope_of_work'), not hardcoded
// columns — lets BMW define their own category/deliverable lists
// per sector instead of the reference's social-media-only ones.

interface ScopeOfWorkSectionProps {
  accountId: string;
  currentUserId: string;
  clientId: string;
  items: ScopeOfWork[];
  isAdmin: boolean;
  canEdit: boolean;
  canCreate: boolean;
  onChanged: () => void;
}

export function ScopeOfWorkSection({
  accountId,
  currentUserId,
  clientId,
  items,
  isAdmin,
  canEdit,
  canCreate,
  onChanged,
}: ScopeOfWorkSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ScopeOfWork | null>(null);
  const [description, setDescription] = useState("");
  const [totalMonthlyUnit, setTotalMonthlyUnit] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function openNew() {
    setEditingItem(null);
    setDescription("");
    setTotalMonthlyUnit("");
    setDialogOpen(true);
  }

  function openEdit(item: ScopeOfWork) {
    setEditingItem(item);
    setDescription(item.description ?? "");
    setTotalMonthlyUnit(item.total_monthly_unit != null ? String(item.total_monthly_unit) : "");
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        description: description.trim() || null,
        total_monthly_unit: totalMonthlyUnit ? Number(totalMonthlyUnit) : null,
      };
      const res = await fetch(
        editingItem ? `/api/scope-of-work/${editingItem.id}` : `/api/clients/${clientId}/scope-of-work`,
        {
          method: editingItem ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        toast.error("Could not save scope of work.");
        return;
      }
      setDialogOpen(false);
      onChanged();
      toast.success(editingItem ? "Updated." : "Added.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingItem) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/scope-of-work/${editingItem.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete.");
        return;
      }
      setDialogOpen(false);
      onChanged();
      toast.success("Deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Scope of Work</h3>
        {canCreate && (
          <Button variant="outline" size="sm" onClick={openNew}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No scope of work entries yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openEdit(item)}
              className="flex items-start gap-2 rounded-lg border border-border p-3 text-left hover:bg-muted/50"
            >
              <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{item.description || "No description"}</p>
                {item.total_monthly_unit != null && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.total_monthly_unit} units/month
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md bg-popover border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {editingItem ? "Edit scope of work" : "Add scope of work"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEdit}
                className="border-border bg-muted text-foreground disabled:opacity-100"
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Total monthly unit</Label>
              <Input
                type="number"
                value={totalMonthlyUnit}
                onChange={(e) => setTotalMonthlyUnit(e.target.value)}
                disabled={!canEdit}
                className="border-border bg-muted text-foreground disabled:opacity-100"
              />
            </div>

            <CustomFieldsSection
              accountId={accountId}
              currentUserId={currentUserId}
              entityType="scope_of_work"
              entityId={editingItem?.id ?? null}
              isAdmin={isAdmin}
              canEdit={canEdit && !!editingItem}
            />
          </div>

          <DialogFooter className="border-border bg-popover/50">
            {editingItem && canCreate && (
              <Button onClick={handleDelete} disabled={deleting} className="mr-auto bg-red-600 text-white hover:bg-red-700">
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            {canEdit && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

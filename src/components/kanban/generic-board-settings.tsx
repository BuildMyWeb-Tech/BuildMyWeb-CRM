"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import type { Pipeline, PipelineStage } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, GripVertical } from "lucide-react";
import { toast } from "sonner";

// Generic column (pipeline_stage) editor shared by standalone
// Kanban boards and Daily Tasks — same mechanics as
// projects/board-settings.tsx, parameterized by which table to
// check before allowing a column delete (kanban_cards vs
// daily_tasks), since each board type's cards live in a different
// table. Renaming the board itself is optional — Daily Tasks has no
// per-account name to change (there's exactly one board, always
// called "Daily Tasks"), so `allowRename` hides that field there.

const STAGE_COLORS = [
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
];

interface GenericBoardSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline;
  stages: PipelineStage[];
  cardsTable: "kanban_cards" | "daily_tasks";
  allowRename?: boolean;
  onChanged: () => void;
}

export function GenericBoardSettings({
  open,
  onOpenChange,
  pipeline,
  stages,
  cardsTable,
  allowRename = true,
  onChanged,
}: GenericBoardSettingsProps) {
  const supabase = createClient();

  const [name, setName] = useState(pipeline.name);
  const [localStages, setLocalStages] = useState<PipelineStage[]>(stages);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState(STAGE_COLORS[0]);
  const [saving, setSaving] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setName(pipeline.name);
    setLocalStages([...stages].sort((a, b) => a.position - b.position));
  }, [open, pipeline, stages]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localStages.findIndex((s) => s.id === active.id);
    const newIndex = localStages.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setLocalStages(arrayMove(localStages, oldIndex, newIndex));
  }

  async function handleSave() {
    setSaving(true);
    const stageRows = localStages.map((s, i) => ({
      id: s.id,
      pipeline_id: s.pipeline_id,
      name: s.name,
      color: s.color,
      position: i,
    }));

    const stagesResult = await supabase.from("pipeline_stages").upsert(stageRows, { onConflict: "id" });
    const renameResult = allowRename
      ? await supabase.from("pipelines").update({ name: name.trim() }).eq("id", pipeline.id)
      : null;
    setSaving(false);

    if (stagesResult.error || renameResult?.error) {
      toast.error("Could not save changes.");
      return;
    }
    onOpenChange(false);
    onChanged();
    toast.success("Board updated.");
  }

  async function handleAddStage() {
    const trimmed = newStageName.trim();
    if (!trimmed) return;
    const { data, error } = await supabase
      .from("pipeline_stages")
      .insert({ pipeline_id: pipeline.id, name: trimmed, color: newStageColor, position: localStages.length })
      .select()
      .single();
    if (error || !data) {
      toast.error("Could not add column.");
      return;
    }
    setLocalStages([...localStages, data as PipelineStage]);
    setNewStageName("");
    setNewStageColor(STAGE_COLORS[(localStages.length + 1) % STAGE_COLORS.length]);
  }

  async function handleRemoveStage(stageId: string) {
    const { count } = await supabase
      .from(cardsTable)
      .select("id", { count: "exact", head: true })
      .eq("stage_id", stageId);
    if (count && count > 0) {
      toast.error("Move or delete the cards in this column first.");
      return;
    }
    const { error } = await supabase.from("pipeline_stages").delete().eq("id", stageId);
    if (error) {
      toast.error("Could not delete column.");
      return;
    }
    setLocalStages(localStages.filter((s) => s.id !== stageId));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-popover border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">Board settings</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {allowRename && (
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Board name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="border-border bg-muted text-foreground" />
            </div>
          )}

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Columns</Label>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
              <SortableContext items={localStages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {localStages.map((stage, index) => (
                    <SortableStageRow
                      key={stage.id}
                      stage={stage}
                      onNameChange={(v) => {
                        const updated = [...localStages];
                        updated[index] = { ...updated[index], name: v };
                        setLocalStages(updated);
                      }}
                      onColorChange={(v) => {
                        const updated = [...localStages];
                        updated[index] = { ...updated[index], color: v };
                        setLocalStages(updated);
                      }}
                      onRemove={() => handleRemoveStage(stage.id)}
                      colors={STAGE_COLORS}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="mt-1 flex flex-wrap gap-1">
              {STAGE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewStageColor(color)}
                  className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ backgroundColor: color, borderColor: newStageColor === color ? "var(--foreground)" : "transparent" }}
                  aria-label={`Pick color ${color}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="New column name"
                className="border-border bg-muted text-sm text-foreground"
                onKeyDown={(e) => { if (e.key === "Enter") handleAddStage(); }}
              />
              <Button variant="outline" size="sm" onClick={handleAddStage} disabled={!newStageName.trim()} className="shrink-0 border-border bg-transparent text-muted-foreground hover:bg-muted">
                <Plus className="mr-1 h-3 w-3" />
                Add
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="border-border bg-popover/50">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || (allowRename && !name.trim())} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableStageRow({
  stage, onNameChange, onColorChange, onRemove, colors,
}: {
  stage: PipelineStage;
  onNameChange: (v: string) => void;
  onColorChange: (v: string) => void;
  onRemove: () => void;
  colors: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2">
      <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing" aria-label="Drag to reorder">
        <GripVertical className="h-4 w-4" />
      </button>
      <ColorSwatch value={stage.color} onChange={onColorChange} colors={colors} />
      <Input value={stage.name} onChange={(e) => onNameChange(e.target.value)} className="h-7 flex-1 border-transparent bg-transparent text-sm text-foreground focus:border-border" />
      <Button variant="ghost" size="icon-xs" onClick={onRemove} className="text-muted-foreground hover:text-red-400">
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function ColorSwatch({ value, onChange, colors }: { value: string; onChange: (v: string) => void; colors: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: value }} aria-label="Change color" />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 flex flex-wrap gap-1 rounded-lg border border-border bg-popover p-2 shadow-lg w-36">
            {colors.map((c) => (
              <button key={c} type="button" onClick={() => { onChange(c); setOpen(false); }} className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110" style={{ backgroundColor: c, borderColor: c === value ? "var(--foreground)" : "transparent" }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

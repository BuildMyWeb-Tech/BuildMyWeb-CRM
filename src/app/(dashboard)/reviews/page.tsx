"use client";

import { useEffect, useState, useCallback } from "react";
import { Star, Plus, Trash2, Pencil, Loader2, X, MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface Review {
  id: string;
  client_name: string;
  project_name: string | null;
  rating: number;
  review_text: string | null;
  review_date: string;
  is_public: boolean;
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} style={{ width: size, height: size }}
          className={i <= Math.round(rating) ? "text-amber-400 fill-amber-400" : "text-slate-700 fill-slate-700"} />
      ))}
    </div>
  );
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

interface FormState { id?: string; client_name: string; project_name: string; rating: number; review_text: string; review_date: string; is_public: boolean; }

function Modal({ open, onClose, onSaved, initial }: { open: boolean; onClose: () => void; onSaved: () => void; initial: FormState | null }) {
  const blank: FormState = { client_name: "", project_name: "", rating: 5, review_text: "", review_date: new Date().toISOString().slice(0, 10), is_public: false };
  const [form, setForm] = useState<FormState>(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm(initial ?? blank); }, [open, initial]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!form.client_name.trim()) { toast.error("Client name required"); return; }
    setSaving(true);
    try {
      const url = form.id ? `/api/reviews/${form.id}` : "/api/reviews";
      const res = await fetch(url, { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d?.error ?? "Failed"); return; }
      toast.success(form.id ? "Updated." : "Review saved."); onSaved(); onClose();
    } finally { setSaving(false); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-[#2a3045] bg-[#0f1117] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">{form.id ? "Edit Review" : "Add Review"}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Client *</label>
              <input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} placeholder="Client name"
                className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Project</label>
              <input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} placeholder="Project name"
                className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-2 block">Rating</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} type="button" onClick={() => setForm({ ...form, rating: i })}
                  className="transition-transform hover:scale-110">
                  <Star className={`h-7 w-7 ${i <= form.rating ? "text-amber-400 fill-amber-400" : "text-slate-700"}`} />
                </button>
              ))}
              <span className="ml-2 text-sm font-bold text-amber-400">{form.rating}.0</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Review Text</label>
            <textarea value={form.review_text} onChange={(e) => setForm({ ...form, review_text: e.target.value })} rows={3}
              placeholder="What did the client say?"
              className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none resize-none" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-slate-400 mb-1 block">Date</label>
              <input type="date" value={form.review_date} onChange={(e) => setForm({ ...form, review_date: e.target.value })}
                className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 focus:border-amber-500 focus:outline-none" />
            </div>
            <div className="pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_public} onChange={(e) => setForm({ ...form, is_public: e.target.checked })}
                  className="rounded" />
                <span className="text-xs text-slate-400">Public review</span>
              </label>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-[#2a3045] text-sm text-slate-400 hover:text-white">Cancel</button>
          <button onClick={save} disabled={saving || !form.client_name.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-600 text-sm text-white hover:bg-amber-500 disabled:opacity-50">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {form.id ? "Save" : "Add Review"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReviewsPage() {
  const { accountId } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editReview, setEditReview] = useState<FormState | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/reviews");
      if (res.ok) { const d = await res.json(); setReviews(d.reviews ?? []); }
    } finally { setLoading(false); }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  async function del(id: string) {
    if (!confirm("Delete this review?")) return;
    const res = await fetch(`/api/reviews/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not delete"); return; }
    toast.success("Deleted."); load();
  }

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => Math.round(r.rating) === n).length }));

  return (
    <>
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditReview(null); }} onSaved={load} initial={editReview} />
      <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Star className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Client Reviews</h1>
              <p className="text-sm text-slate-400">Store and showcase client testimonials</p>
            </div>
          </div>
          <button onClick={() => { setEditReview(null); setModalOpen(true); }}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500">
            <Plus className="h-4 w-4" /> Add Review
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Average Rating", value: avgRating > 0 ? `${avgRating.toFixed(1)} / 5` : "—", sub: `${reviews.length} reviews`, color: "text-amber-400", bg: "bg-amber-500/10" },
            { label: "5 Stars", value: String(dist[0].count), sub: "perfect scores", color: "text-green-400", bg: "bg-green-500/10" },
            { label: "Public Reviews", value: String(reviews.filter((r) => r.is_public).length), sub: "shareable", color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "Total Reviews", value: String(reviews.length), sub: "collected", color: "text-purple-400", bg: "bg-purple-500/10" },
          ].map((c) => (
            <div key={c.label} className={`rounded-xl border border-[#2a3045] ${c.bg} p-4`}>
              <p className="text-xs text-slate-500 mb-1">{c.label}</p>
              <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-slate-600 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
        ) : reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-20 gap-3">
            <MessageSquare className="h-10 w-10 text-slate-700" />
            <p className="text-slate-500">No reviews yet. Add your first client testimonial.</p>
            <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300">
              <Plus className="h-4 w-4" /> Add Review
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">{r.client_name}</p>
                    {r.project_name && <p className="text-xs text-slate-500 mt-0.5">{r.project_name}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditReview({ id: r.id, client_name: r.client_name, project_name: r.project_name ?? "", rating: r.rating, review_text: r.review_text ?? "", review_date: r.review_date, is_public: r.is_public }); setModalOpen(true); }}
                      className="p-1.5 rounded text-slate-500 hover:text-white transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => del(r.id)} className="p-1.5 rounded text-slate-500 hover:text-red-400 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <StarRow rating={r.rating} />
                {r.review_text && (
                  <p className="text-sm text-slate-400 italic leading-relaxed">"{r.review_text}"</p>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-600">{fmtDate(r.review_date)}</span>
                  {r.is_public && <span className="text-[10px] rounded-full bg-green-500/10 text-green-400 px-2 py-0.5">Public</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

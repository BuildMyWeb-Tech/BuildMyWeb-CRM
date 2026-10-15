"use client";

import { useState, useCallback } from "react";
import {
  Receipt, Plus, Trash2, Download, ChevronRight, Home, GripVertical,
  ChevronDown, ChevronUp, X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface BulletSection {
  id: string;
  title: string;
  items: string[];
}

interface PricingRow {
  id: string;
  plan: string;
  scope: string;
  cost: string;
}

interface TermsItem {
  id: string;
  text: string;
}

function uid() { return Math.random().toString(36).slice(2, 9); }

const DEFAULT_TERMS: TermsItem[] = [
  { id: uid(), text: "Content, materials, and assets will be provided by the client unless otherwise agreed." },
  { id: uid(), text: "Any functionality outside the agreed scope will be charged separately." },
  { id: uid(), text: "Domain, hosting, and third-party service charges are separate where applicable." },
  { id: uid(), text: "Development timelines depend on the final scope and timely availability of content." },
  { id: uid(), text: "Final pricing will be confirmed after reviewing the complete requirements." },
  { id: uid(), text: "Maintenance and future feature development are separate from the initial cost." },
];

export default function QuotationsPage() {
  // Header fields
  const [docTitle, setDocTitle] = useState("");
  const [docSubtitle, setDocSubtitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [preparedBy] = useState("Ajai Kumar E");
  const [serviceCategory, setServiceCategory] = useState("");
  const [costRange, setCostRange] = useState("");
  const [duration, setDuration] = useState("");
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");

  // Dark bar highlights
  const [highlights, setHighlights] = useState(["", "", ""]);

  // Sections
  const [sections, setSections] = useState<BulletSection[]>([
    { id: uid(), title: "Project Overview", items: [""] },
  ]);

  // Pricing
  const [showPricing, setShowPricing] = useState(false);
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([
    { id: uid(), plan: "Basic", scope: "", cost: "" },
    { id: uid(), plan: "Standard", scope: "", cost: "" },
    { id: uid(), plan: "Advanced", scope: "", cost: "" },
  ]);
  const [estimatedRange, setEstimatedRange] = useState("");

  // Maintenance
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [maintenanceCost, setMaintenanceCost] = useState("");
  const [maintenanceItems, setMaintenanceItems] = useState<string[]>([
    "Domain / hosting renewal support",
    "Minor content updates",
    "Bug fixing",
    "Security updates",
    "Technical support",
  ]);

  // Terms
  const [showTerms, setShowTerms] = useState(true);
  const [terms, setTerms] = useState<TermsItem[]>(DEFAULT_TERMS);

  // Collapsed sections in form
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggleCollapse(id: string) {
    setCollapsed((p) => ({ ...p, [id]: !p[id] }));
  }

  // Section helpers
  function addSection() {
    setSections((p) => [...p, { id: uid(), title: "", items: [""] }]);
  }
  function removeSection(id: string) {
    setSections((p) => p.filter((s) => s.id !== id));
  }
  function updateSectionTitle(id: string, title: string) {
    setSections((p) => p.map((s) => s.id === id ? { ...s, title } : s));
  }
  function addItem(sectionId: string) {
    setSections((p) => p.map((s) => s.id === sectionId ? { ...s, items: [...s.items, ""] } : s));
  }
  function updateItem(sectionId: string, idx: number, val: string) {
    setSections((p) => p.map((s) => s.id === sectionId ? { ...s, items: s.items.map((it, i) => i === idx ? val : it) } : s));
  }
  function removeItem(sectionId: string, idx: number) {
    setSections((p) => p.map((s) => s.id === sectionId ? { ...s, items: s.items.filter((_, i) => i !== idx) } : s));
  }

  // Pricing helpers
  function addPricingRow() {
    setPricingRows((p) => [...p, { id: uid(), plan: "", scope: "", cost: "" }]);
  }
  function updatePricingRow(id: string, field: keyof Omit<PricingRow, "id">, val: string) {
    setPricingRows((p) => p.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }
  function removePricingRow(id: string) {
    setPricingRows((p) => p.filter((r) => r.id !== id));
  }

  // Terms helpers
  function addTerms() {
    setTerms((p) => [...p, { id: uid(), text: "" }]);
  }
  function updateTerms(id: string, text: string) {
    setTerms((p) => p.map((t) => t.id === id ? { ...t, text } : t));
  }
  function removeTerms(id: string) {
    setTerms((p) => p.filter((t) => t.id !== id));
  }

  const fd = useCallback((d: string) => {
    if (!d) return "";
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  }, []);

  function generatePDF() {
    if (!docTitle.trim()) { toast.error("Document title is required"); return; }
    if (!clientName.trim()) { toast.error("Client name is required"); return; }

    const sectionHTMLs = sections.map((sec, sIdx) => {
      const bullets = sec.items.filter(Boolean).map((item) =>
        `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;">
          <span style="color:#0f766e;font-weight:700;flex-shrink:0;margin-top:1px;">&#10003;</span>
          <span>${item}</span>
        </div>`
      ).join("");
      if (!bullets) return "";
      return `
      <div style="margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:10px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:14px;">
          <div style="width:26px;height:26px;background:#1e3a5f;border-radius:50%;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${sIdx + 1}</div>
          <div style="font-size:15px;font-weight:700;color:#0f172a;">${sec.title || `Section ${sIdx + 1}`}</div>
        </div>
        <div style="columns:2;column-gap:20px;font-size:13px;color:#334155;">${bullets}</div>
      </div>`;
    }).join("");

    let sectionCount = sections.length;

    const pricingHTML = showPricing && pricingRows.some((r) => r.plan) ? (() => {
      sectionCount++;
      const rows = pricingRows.filter((r) => r.plan).map((r) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;">${r.plan}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#475569;">${r.scope}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#1e3a5f;">${r.cost}</td>
        </tr>`).join("");
      return `
      <div style="margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:10px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:14px;">
          <div style="width:26px;height:26px;background:#1e3a5f;border-radius:50%;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${sectionCount}</div>
          <div style="font-size:15px;font-weight:700;color:#0f172a;">Package &amp; Pricing</div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
          <thead><tr style="background:#f8fafc;">
            <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;border-bottom:2px solid #e2e8f0;width:120px;">Plan</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;border-bottom:2px solid #e2e8f0;">Scope</th>
            <th style="padding:8px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;border-bottom:2px solid #e2e8f0;width:140px;">Estimated Cost</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${estimatedRange ? `<div style="display:flex;justify-content:space-between;background:#1e3a5f;color:#fff;padding:12px 16px;align-items:center;">
          <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;opacity:.8;">Estimated Project Range</span>
          <span style="font-size:18px;font-weight:800;">${estimatedRange}</span>
        </div>` : ""}
      </div>`;
    })() : "";

    const maintenanceHTML = showMaintenance ? (() => {
      sectionCount++;
      const mItems = maintenanceItems.filter(Boolean).map((item) =>
        `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;">
          <span style="color:#0f766e;font-weight:700;flex-shrink:0;">&#10003;</span>
          <span>${item}</span>
        </div>`
      ).join("");
      return `
      <div style="margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:10px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:14px;">
          <div style="width:26px;height:26px;background:#1e3a5f;border-radius:50%;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${sectionCount}</div>
          <div style="font-size:15px;font-weight:700;color:#0f172a;">Maintenance &amp; Future Updates</div>
        </div>
        <p style="font-size:13px;color:#475569;margin-bottom:12px;">Website maintenance can be provided separately after the initial development. Maintenance may include:</p>
        <div style="columns:2;column-gap:20px;font-size:13px;color:#334155;">${mItems}</div>
        ${maintenanceCost ? `<div style="display:flex;justify-content:space-between;background:#1e3a5f;color:#fff;padding:12px 16px;align-items:center;margin-top:14px;">
          <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;opacity:.8;">Estimated Annual Maintenance</span>
          <span style="font-size:18px;font-weight:800;">${maintenanceCost}</span>
        </div>` : ""}
      </div>`;
    })() : "";

    const termsHTML = showTerms && terms.some((t) => t.text) ? (() => {
      sectionCount++;
      const tItems = terms.filter((t) => t.text).map((t) =>
        `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;">
          <span style="color:#0f766e;font-weight:700;flex-shrink:0;margin-top:1px;">&#10003;</span>
          <span>${t.text}</span>
        </div>`
      ).join("");
      return `
      <div style="margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:10px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:14px;">
          <div style="width:26px;height:26px;background:#1e3a5f;border-radius:50%;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${sectionCount}</div>
          <div style="font-size:15px;font-weight:700;color:#0f172a;">Important Notes &amp; Terms</div>
        </div>
        <div style="font-size:13px;color:#334155;">${tItems}</div>
      </div>`;
    })() : "";

    const hlItems = highlights.filter(Boolean);
    const darkBarHTML = hlItems.length > 0
      ? `<div style="background:#1e3a5f;color:#fff;padding:12px 16px;display:grid;grid-template-columns:repeat(${hlItems.length},1fr);gap:8px;margin-bottom:28px;">
          ${hlItems.map((h) => `<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">${h}</div>`).join("")}
        </div>`
      : "";

    const metaCells = [
      { label: "Prepared By", value: preparedBy },
      clientName ? { label: "Client", value: clientName } : null,
      serviceCategory ? { label: "Service Category", value: serviceCategory } : null,
      (duration || validUntil) ? { label: duration ? "Duration" : "Valid Until", value: duration || fd(validUntil) } : null,
      costRange ? { label: "Cost Range", value: costRange } : null,
    ].filter(Boolean) as { label: string; value: string }[];

    const metaHTML = `<div style="display:flex;border:1px solid #e2e8f0;margin-bottom:20px;">
      ${metaCells.map((c) => `<div style="flex:1;padding:8px 12px;border-right:1px solid #e2e8f0;">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;">${c.label}</div>
        <div style="font-size:12px;font-weight:600;color:#1e293b;margin-top:2px;">${c.value}</div>
      </div>`).join("")}
    </div>`.replace(/border-right:1px solid #e2e8f0;">\s*$/, ';">');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Quotation — ${docTitle}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;background:#fff;font-size:13px;}
  @page{margin:0;size:A4;}
  @media print{body{margin:0;}}
  .page{max-width:794px;margin:0 auto;padding:40px 48px 80px;}
  .footer{position:fixed;bottom:0;left:0;right:0;padding:10px 48px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;background:#fff;}
  .footer-text{font-size:10px;color:#94a3b8;}
</style></head><body>
<div class="page">
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;">
    <div>
      <div style="font-size:22px;font-weight:800;color:#1e3a5f;letter-spacing:-.5px;">BuildMyWeb</div>
      <div style="font-size:9px;color:#6b7280;letter-spacing:.5px;text-transform:uppercase;margin-top:2px;">Where Imagination Meets Innovation</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:18px;font-weight:800;color:#1e3a5f;letter-spacing:1px;">QUOTATION</div>
      <div style="font-size:10px;color:#6b7280;">buildmyweb.info</div>
    </div>
  </div>
  <!-- Accent line -->
  <div style="height:5px;background:linear-gradient(to right,#f59e0b,#f97316);margin-bottom:28px;"></div>
  <!-- Title -->
  <div style="font-size:30px;font-weight:800;color:#0f172a;text-transform:uppercase;line-height:1.1;margin-bottom:5px;">${docTitle}</div>
  ${docSubtitle ? `<div style="font-size:12px;color:#64748b;margin-bottom:18px;">${docSubtitle}</div>` : `<div style="margin-bottom:18px;"></div>`}
  <!-- Meta -->
  ${metaHTML}
  <!-- Dark bar -->
  ${darkBarHTML}
  <!-- Sections -->
  ${sectionHTMLs}
  <!-- Pricing -->
  ${pricingHTML}
  <!-- Maintenance -->
  ${maintenanceHTML}
  <!-- Terms -->
  ${termsHTML}
  <!-- Signature -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:32px;">
    <div>
      <div style="font-size:10px;text-transform:uppercase;font-weight:700;color:#64748b;margin-bottom:8px;">Client Acceptance</div>
      <div style="border-bottom:1px solid #cbd5e1;margin-bottom:14px;"></div>
      <div style="font-size:12px;color:#64748b;">Name: ____________________</div>
      <div style="font-size:12px;color:#64748b;margin-top:8px;">Signature: ____________________</div>
      <div style="font-size:12px;color:#64748b;margin-top:8px;">Date: ____________________</div>
    </div>
    <div>
      <div style="font-size:10px;text-transform:uppercase;font-weight:700;color:#64748b;margin-bottom:8px;">For BuildMyWeb</div>
      <div style="border-bottom:1px solid #cbd5e1;margin-bottom:14px;"></div>
      <div style="font-size:12px;font-weight:600;color:#1e293b;">Authorized Representative: ${preparedBy}</div>
      <div style="font-size:12px;color:#64748b;margin-top:8px;">Signature: ____________________</div>
      <div style="font-size:12px;color:#64748b;margin-top:8px;">Date: ${fd(quoteDate) || "____________________"}</div>
    </div>
  </div>
  <!-- Contact box -->
  <div style="margin-top:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px 16px;">
    <div style="font-size:12px;font-weight:700;color:#1e3a5f;">BuildMyWeb</div>
    <div style="font-size:11px;color:#64748b;line-height:1.8;margin-top:4px;">
      Where Imagination Meets Innovation<br>
      Email: buildmyweb2024@gmail.com &nbsp;|&nbsp; Phone: +91 93440 95727 / +91 93855 73581<br>
      Website: www.buildmyweb.info
    </div>
  </div>
</div>
<div class="footer">
  <div class="footer-text">BuildMyWeb | Where Imagination Meets Innovation | buildmyweb.info</div>
  <div class="footer-text">Page 1</div>
</div>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) { toast.error("Pop-up blocked — allow pop-ups and try again"); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  const inputCls = "w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none";
  const labelCls = "text-xs text-slate-400 mb-1 block";

  return (
    <div className="min-h-screen bg-[#0f1117]">
      <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto pb-24">

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Home className="h-3 w-3" />
          <Link href="/office" className="hover:text-white transition-colors">Office</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-300">Quotation Generator</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20">
              <Receipt className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Quotation Generator</h1>
              <p className="text-sm text-slate-400">Fill in the details and generate a branded PDF quotation</p>
            </div>
          </div>
          <button
            type="button"
            onClick={generatePDF}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 transition-colors"
          >
            <Download className="h-4 w-4" /> Generate PDF
          </button>
        </div>

        {/* ── Section A: Document Details ── */}
        <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-5 space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Document Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={labelCls}>Document Title * <span className="text-slate-600">(shown as large heading)</span></label>
              <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="E.g. E-COMMERCE WEBSITE DEVELOPMENT" className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Subtitle <span className="text-slate-600">(shown below the title)</span></label>
              <input value={docSubtitle} onChange={(e) => setDocSubtitle(e.target.value)} placeholder="E.g. Website Development Quotation" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Client Name *</label>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client or company name" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Service Category</label>
              <input value={serviceCategory} onChange={(e) => setServiceCategory(e.target.value)} placeholder="E.g. 05. E-Commerce Website" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Cost Range</label>
              <input value={costRange} onChange={(e) => setCostRange(e.target.value)} placeholder="E.g. ₹25,000 – ₹80,000+" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Duration / Timeline</label>
              <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="E.g. 4–6 Weeks" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Quotation Date</label>
              <input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Valid Until</label>
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        {/* ── Section B: Feature Highlights ── */}
        <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-5 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Feature Highlights <span className="normal-case font-normal text-slate-600">(3 items shown in the dark bar)</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {highlights.map((h, i) => (
              <div key={i}>
                <label className={labelCls}>Highlight {i + 1}</label>
                <input
                  value={h}
                  onChange={(e) => setHighlights((p) => p.map((v, idx) => idx === i ? e.target.value : v))}
                  placeholder={["Product Catalog & Cart", "Secure Checkout & Payments", "Admin & Order Management"][i] || `Feature ${i + 1}`}
                  className={inputCls}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Section C: Content Sections ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Content Sections</p>
            <button
              type="button"
              onClick={addSection}
              className="flex items-center gap-1.5 rounded-lg border border-[#2a3045] px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-amber-500/50 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add Section
            </button>
          </div>

          {sections.map((sec, sIdx) => (
            <div key={sec.id} className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
              {/* Section header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2a3045]">
                <GripVertical className="h-4 w-4 text-slate-600 shrink-0" />
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1e3a5f] text-[10px] font-bold text-white shrink-0">{sIdx + 1}</div>
                <input
                  value={sec.title}
                  onChange={(e) => updateSectionTitle(sec.id, e.target.value)}
                  placeholder={`Section ${sIdx + 1} Title`}
                  className="flex-1 bg-transparent text-sm font-medium text-white placeholder:text-slate-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => toggleCollapse(sec.id)}
                  className="text-slate-500 hover:text-white transition-colors"
                >
                  {collapsed[sec.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => removeSection(sec.id)}
                  className="text-slate-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {!collapsed[sec.id] && (
                <div className="p-4 space-y-2">
                  {sec.items.map((item, iIdx) => (
                    <div key={iIdx} className="flex items-start gap-2">
                      <span className="text-teal-500 mt-2 text-sm shrink-0">✓</span>
                      <textarea
                        value={item}
                        onChange={(e) => updateItem(sec.id, iIdx, e.target.value)}
                        placeholder="Item / feature / point..."
                        rows={1}
                        className="flex-1 rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-600 focus:border-amber-500/50 focus:outline-none resize-none"
                        onInput={(e) => {
                          const el = e.currentTarget;
                          el.style.height = "auto";
                          el.style.height = el.scrollHeight + "px";
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(sec.id, iIdx)}
                        className="mt-2 text-slate-600 hover:text-red-400 transition-colors shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addItem(sec.id)}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition-colors mt-1"
                  >
                    <Plus className="h-3 w-3" /> Add item
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Section D: Pricing Table ── */}
        <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPricing(!showPricing)}
            className="w-full flex items-center justify-between px-5 py-4 text-left"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Package &amp; Pricing Table <span className="normal-case font-normal text-slate-600">(optional)</span></p>
            {showPricing ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </button>
          {showPricing && (
            <div className="px-5 pb-5 space-y-3 border-t border-[#2a3045]">
              <div className="pt-4 space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-slate-500 px-2">
                  <span className="col-span-2">Plan</span>
                  <span className="col-span-7">Scope Description</span>
                  <span className="col-span-2 text-right">Cost</span>
                  <span className="col-span-1" />
                </div>
                {pricingRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-12 gap-2 items-start">
                    <input value={row.plan} onChange={(e) => updatePricingRow(row.id, "plan", e.target.value)} placeholder="Basic" className={`${inputCls} col-span-2`} />
                    <input value={row.scope} onChange={(e) => updatePricingRow(row.id, "scope", e.target.value)} placeholder="Scope description..." className={`${inputCls} col-span-7`} />
                    <input value={row.cost} onChange={(e) => updatePricingRow(row.id, "cost", e.target.value)} placeholder="₹25,000" className={`${inputCls} col-span-2`} />
                    <button type="button" onClick={() => removePricingRow(row.id)} className="col-span-1 flex justify-center pt-2 text-slate-600 hover:text-red-400 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addPricingRow} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition-colors">
                  <Plus className="h-3 w-3" /> Add row
                </button>
              </div>
              <div>
                <label className={labelCls}>Total / Estimated Range (shown in highlight bar)</label>
                <input value={estimatedRange} onChange={(e) => setEstimatedRange(e.target.value)} placeholder="₹25,000 – ₹80,000+" className={inputCls} />
              </div>
            </div>
          )}
        </div>

        {/* ── Section E: Maintenance ── */}
        <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowMaintenance(!showMaintenance)}
            className="w-full flex items-center justify-between px-5 py-4 text-left"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Maintenance &amp; Future Updates <span className="normal-case font-normal text-slate-600">(optional)</span></p>
            {showMaintenance ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </button>
          {showMaintenance && (
            <div className="px-5 pb-5 space-y-3 border-t border-[#2a3045]">
              <div className="pt-4 space-y-2">
                {maintenanceItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-teal-500 text-sm shrink-0">✓</span>
                    <input
                      value={item}
                      onChange={(e) => setMaintenanceItems((p) => p.map((v, idx) => idx === i ? e.target.value : v))}
                      className={inputCls}
                    />
                    <button type="button" onClick={() => setMaintenanceItems((p) => p.filter((_, idx) => idx !== i))} className="text-slate-600 hover:text-red-400 transition-colors shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setMaintenanceItems((p) => [...p, ""])} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition-colors">
                  <Plus className="h-3 w-3" /> Add item
                </button>
              </div>
              <div>
                <label className={labelCls}>Annual Maintenance Cost</label>
                <input value={maintenanceCost} onChange={(e) => setMaintenanceCost(e.target.value)} placeholder="₹8,000 – ₹30,000 / Year" className={inputCls} />
              </div>
            </div>
          )}
        </div>

        {/* ── Section F: Terms ── */}
        <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowTerms(!showTerms)}
            className="w-full flex items-center justify-between px-5 py-4 text-left"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Important Notes &amp; Terms</p>
            {showTerms ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </button>
          {showTerms && (
            <div className="px-5 pb-5 space-y-2 border-t border-[#2a3045]">
              <div className="pt-4 space-y-2">
                {terms.map((t) => (
                  <div key={t.id} className="flex items-start gap-2">
                    <span className="text-teal-500 mt-2 text-sm shrink-0">✓</span>
                    <textarea
                      value={t.text}
                      onChange={(e) => updateTerms(t.id, e.target.value)}
                      placeholder="Term or condition..."
                      rows={2}
                      className="flex-1 rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-600 focus:border-amber-500/50 focus:outline-none resize-none"
                    />
                    <button type="button" onClick={() => removeTerms(t.id)} className="mt-2 text-slate-600 hover:text-red-400 transition-colors shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addTerms} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition-colors">
                  <Plus className="h-3 w-3" /> Add term
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sticky bottom bar */}
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#2a3045] bg-[#0f1117]/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between lg:pl-64">
          <p className="text-sm text-slate-400">
            {sections.length} section{sections.length !== 1 ? "s" : ""}
            {showPricing && pricingRows.filter((r) => r.plan).length > 0 ? ` · ${pricingRows.filter((r) => r.plan).length} pricing rows` : ""}
          </p>
          <button
            type="button"
            onClick={generatePDF}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 transition-colors"
          >
            <Download className="h-4 w-4" /> Generate PDF
          </button>
        </div>

      </div>
    </div>
  );
}

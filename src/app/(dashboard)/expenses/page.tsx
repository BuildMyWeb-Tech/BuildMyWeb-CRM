"use client";

import { Receipt } from "lucide-react";
import { ExpensesTab } from "@/components/office/expenses-tab";

export default function ExpensesPage() {
  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-red-500/20 flex items-center justify-center">
          <Receipt className="h-5 w-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground">Track your business expenses</p>
        </div>
      </div>
      <ExpensesTab />
    </div>
  );
}

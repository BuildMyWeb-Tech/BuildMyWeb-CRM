"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface GenerateResult {
  searched: number;
  inserted: number;
  duplicates: number;
  skippedNoPhone: number;
  qualified: number;
  qualifyFailed: number;
  aiConfigured: boolean;
}

// Lead Sourcing — type a niche + location, pull matching businesses
// from LeadScout (Google Places), insert the ones with a phone
// number as contacts, and qualify each one against the 3 BuildMyWeb
// products via the account's configured AI (Settings → AI Agents).
// See src/app/api/leads/generate/route.ts for the actual work.
export default function LeadSourcingPage() {
  const [niche, setNiche] = useState("");
  const [location, setLocation] = useState("");
  const [count, setCount] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/leads/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche, location, count }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      setResult(data);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Lead Sourcing
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Search for businesses by niche and location, then automatically
        qualify and score each one that has a phone number.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">New search</CardTitle>
          <CardDescription>
            Pulled from Google Maps via LeadScout. Results without a phone
            number are skipped — this CRM needs one for WhatsApp outreach.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="niche">Niche</Label>
              <Input
                id="niche"
                placeholder="e.g. unisex salon, pharmacy, grocery store"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="e.g. Andheri, Mumbai"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="count">Leads to fetch (1-60)</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={60}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </div>
            <Button type="submit" disabled={loading} className="mt-2">
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Searching &amp; qualifying…
                </>
              ) : (
                "Find leads"
              )}
            </Button>
          </form>

          {error && (
            <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {result && (
            <div className="mt-4 rounded-md border border-border bg-muted/30 p-4 text-sm">
              <p className="font-medium text-foreground">
                {result.searched} businesses found
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
                <li>{result.inserted} added as new contacts</li>
                <li>{result.duplicates} already existed (skipped)</li>
                <li>{result.skippedNoPhone} had no phone number (skipped)</li>
                <li>{result.qualified} qualified by AI</li>
                {result.qualifyFailed > 0 && (
                  <li className="text-amber-500">
                    {result.qualifyFailed} failed AI qualification — check
                    Contacts, they were still imported
                  </li>
                )}
              </ul>
              {!result.aiConfigured && result.inserted > 0 && (
                <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-500">
                  Contacts were imported, but no AI is configured for this
                  account yet — set one up under AI Agents → Setup to enable
                  scoring.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
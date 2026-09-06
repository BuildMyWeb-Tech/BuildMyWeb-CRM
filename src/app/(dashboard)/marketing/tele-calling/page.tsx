"use client";

import { Phone } from "lucide-react";
import { MarketingList } from "@/components/marketing/marketing-list";

export default function TeleCallingPage() {
  return <MarketingList category="tele_calling" pageKey="marketing_tele_calling" title="Tele Calling" icon={Phone} />;
}

"use client";

import { Megaphone } from "lucide-react";
import { MarketingList } from "@/components/marketing/marketing-list";

export default function PaidMarketingPage() {
  return <MarketingList category="paid_marketing" pageKey="marketing_paid_marketing" title="Paid Marketing" icon={Megaphone} />;
}

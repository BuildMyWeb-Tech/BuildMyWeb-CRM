"use client";

import { PenSquare } from "lucide-react";
import { MarketingList } from "@/components/marketing/marketing-list";

export default function ContentCreationPage() {
  return <MarketingList category="content_creation" pageKey="marketing_content_creation" title="Content Creation" icon={PenSquare} />;
}

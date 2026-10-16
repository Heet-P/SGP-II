import type { Metadata } from "next";

import ClientPortal from "@/components/client/ClientPortal";

export const metadata: Metadata = {
  title: "SolarLeads · Client portal",
  description: "Which housing societies to pitch together, and a live check for your own list.",
};

export default function ClientPage() {
  return <ClientPortal />;
}

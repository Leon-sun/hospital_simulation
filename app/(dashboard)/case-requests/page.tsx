import { HospitalDashboard } from "@/components/dashboard/hospital-dashboard";
import { getDashboardData } from "@/lib/get-dashboard-data";

export default async function CaseRequestsPage() {
  const initialData = await getDashboardData();

  return <HospitalDashboard initialData={initialData} />;
}

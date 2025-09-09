import DashboardComponent from "@/components/DashboardComponent";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function Home() {
  return (
    <ProtectedRoute>
      <DashboardComponent />
    </ProtectedRoute>
  );
}

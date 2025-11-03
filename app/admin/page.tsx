import AdminPageComponent from "@/components/AdminPageComponent";
import ProtectedRoute from "@/components/ProtectedRoute";

const AdminPage = () => {
  return (
    <ProtectedRoute>
      <AdminPageComponent />
    </ProtectedRoute>
  );
};

export default AdminPage;

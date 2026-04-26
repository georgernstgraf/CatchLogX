import MyUploadsPageComponent from "@/components/MyUploadsPageComponent";
import ProtectedRoute from "@/components/ProtectedRoute";

const MyUploadsPage = () => {
  return (
    <ProtectedRoute>
      <MyUploadsPageComponent />
    </ProtectedRoute>
  );
};

export default MyUploadsPage;

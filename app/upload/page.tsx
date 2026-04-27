import UploadPageComponent from "@/components/UploadPageComponent";
import ProtectedRoute from "@/components/ProtectedRoute";

const UploadPage = () => {
  return (
    <ProtectedRoute>
      <UploadPageComponent />
    </ProtectedRoute>
  );
};

export default UploadPage;

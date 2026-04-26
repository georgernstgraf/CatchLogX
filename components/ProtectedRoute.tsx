"use client";
import React, { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { usePathname, useRouter } from "next/navigation";

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  redirectTo = "/login",
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isFirstLoginPage = pathname === "/first-login";

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      console.log(
        "ProtectedRoute: user is not authenticated, redirecting to",
        redirectTo,
      );
      setTimeout(() => {
        router.replace(redirectTo);
      }, 50);
      return;
    }

    if (
      !isLoading &&
      isAuthenticated &&
      user?.isFirstLogin &&
      !isFirstLoginPage
    ) {
      setTimeout(() => {
        router.replace("/first-login");
      }, 50);
      return;
    }

    if (
      !isLoading &&
      isAuthenticated &&
      !user?.isFirstLogin &&
      isFirstLoginPage
    ) {
      setTimeout(() => {
        router.replace("/");
      }, 50);
    }
  }, [
    isAuthenticated,
    isLoading,
    isFirstLoginPage,
    pathname,
    redirectTo,
    router,
    user?.isFirstLogin,
  ]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // Show nothing while redirecting
  if (!isAuthenticated) {
    return null;
  }

  if (user?.isFirstLogin && !isFirstLoginPage) {
    return null;
  }

  // Show protected content
  return <>{children}</>;
};

export default ProtectedRoute;

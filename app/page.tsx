// Alle auskommentierten Sachen werden wieder reaktiviert, sobald Login Form und Funktionalität vorhanden

import DashboardComponent from "@/components/DashboardComponent";
/* import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect } from "react"; */

export default function Home() {
  /* const session = useSession();
  const router = useRouter(); */

  /* useEffect(() => {
    if (!session.data?.user) {
      router.replace("/login")
    }
  }) */

  return <DashboardComponent />;
}

"use client";

import Sidebar from "@/components/Sidebar";
import DarkModeToggle from "@/components/DarkModeToggle";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Mail } from "lucide-react";

type Contributor = {
  name: string;
  role: string;
  email?: string;
};

const developmentTeam: Contributor[] = [
  {
    name: "Arman Sarrafi-Nour",
    role: "Project Lead & Backend Developer",
    email: "arman.sarrafi28@gmail.com",
  },
  {
    name: "Maxima Simons",
    role: "Vice Project Lead & Software Security",
  },
  {
    name: "Tadeáš Reindl",
    role: "Head of UI/UX & Frontend Developer",
    email: "tadeas.reindl@gmail.com",
  },
  {
    name: "Burak Bingöl",
    role: "Database Engineer & Software Architecture",
  },
];

const specialThanks: Contributor[] = [
  {
    name: "Georg Ernst Graf",
    role: "Supervising Teacher",
    email: "grafg@spengergasse.at",
  },
  {
    name: "Lena Graf",
    role: "Scientist @ BOKU Wien",
  },
  {
    name: "Martin Seebacher",
    role: "System Administrator @ BOKU Wien",
  },
];

function ContributorCard({ contributor }: { contributor: Contributor }) {
  return (
    <div className="rounded-xl border border-[#c7e0e0] dark:border-[#2d4257] bg-white dark:bg-gray-800 px-4 py-4 shadow-sm">
      <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
        {contributor.name}
      </p>
      <p className="mt-1 inline-flex rounded-full bg-[#e8f3f3] dark:bg-[#1f2f3e] px-3 py-1 text-xs font-medium text-[#235457] dark:text-[#b8d6d8]">
        {contributor.role}
      </p>
      {contributor.email && (
        <a
          href={`mailto:${contributor.email}`}
          className="mt-3 inline-flex items-center gap-2 text-sm text-[#357174] hover:text-[#2a5a5d]"
        >
          <Mail size={14} />
          {contributor.email}
        </a>
      )}
    </div>
  );
}

function AboutPageContent() {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 p-6 md:p-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              About CatchLogX
            </h1>
            <DarkModeToggle variant="page" />
          </div>

          <div className="rounded-xl border border-[#c7e0e0] dark:border-[#2d4257] bg-[#e8f3f3] dark:bg-[#1f2f3e] p-6 mb-8">
            <p className="text-sm md:text-base text-[#235457] dark:text-[#b8d6d8] leading-relaxed">
              The project CatchLogX was developed as the thesis project of the
              development team at HTL Spengergasse in the schoolyear 2025/26. In
              case there should be any issues occurring or there should be
              requests for new features or enhancements of existing ones, kindly
              open a GitHub issue in the repository of the project. It can be
              found under
              <a
                href="https://github.com/AlphaVIE/CatchLogX"
                target="_blank"
                rel="noreferrer"
                className="ml-1 font-semibold text-[#357174] hover:text-[#2a5a5d]"
              >
                https://github.com/AlphaVIE/CatchLogX
              </a>
              .
            </p>
          </div>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Development Team
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {developmentTeam.map((contributor) => (
                <ContributorCard
                  key={contributor.name}
                  contributor={contributor}
                />
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Special Thanks To
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {specialThanks.map((contributor) => (
                <ContributorCard
                  key={contributor.name}
                  contributor={contributor}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <ProtectedRoute>
      <AboutPageContent />
    </ProtectedRoute>
  );
}

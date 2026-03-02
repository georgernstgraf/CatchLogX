"use client";

import {
  FileInputIcon,
  FilePlus2Icon,
  LucideIcon,
  SearchCode,
  ShieldEllipsis,
  User,
} from "lucide-react";
import Link from "next/link";
import React from "react";
import LogoutButton from "./LogoutButton";
import { useAuth } from "./AuthProvider";
import Image from "next/image";
import Logo from "@/assets/img/Boku-wien_randlos.svg";


const Sidebar = () => {
  const { user } = useAuth();

  type LinkType = {
    title: string;
    path: string;
    icon: LucideIcon;
    protected: boolean;
  };

  const links: LinkType[] = [
    {
      title: "SQL Abfrage",
      path: "/",
      icon: SearchCode,
      protected: false,
    },
    {
      title: "Upload",
      path: "/upload",
      icon: FilePlus2Icon,
      protected: false,
    },
    {
      title: "Meine Uploads",
      path: "/my-uploads",
      icon: FileInputIcon,
      protected: false,
    },
    {
      title: "Admin",
      path: "/admin",
      icon: ShieldEllipsis,
      protected: true,
    },
  ];

  return (
    <div className="w-48 h-screen sticky top-0 border-r-[0.8px] border-r-gray-300 dark:border-r-gray-700 bg-[#1d293d] dark:bg-[#111827] shadow-lg">
      <div className="w-full h-full flex flex-col">
        <div className="flex mt-2 px-1 justify-center">
          <Image alt="Boku Logo" src={Logo} width={30} height={30} />
          <h1 className="font-semibold text-[#e5e5e5] ml-3">
            Universität für Bodenkultur Wien
          </h1>
        </div>
        <hr className="mt-3 w-[95%] text-[#e5e5e5] mx-auto" />
        <div className="flex-1">
          <div className="space-y-4 mt-4">
            {links
              .filter((link) => !link.protected || user?.role === "admin")
              .map((link) => (
                <div
                  key={link.title}
                  className="ml-3 flex flex-row items-center transition-colors duration-200 text-[#e5e5e5] hover:text-[#357174]"
                >
                  <link.icon className="mr-2" size={18} />
                  <Link href={link.path}>{link.title}</Link>
                </div>
              ))}
          </div>
        </div>

        <div className="p-3 pb-6 border-t border-gray-300 dark:border-gray-700">
          {user && (
            <div className="relative group">
              <button className="w-full flex items-center text-sm text-[#e5e5e5] hover:text-[#357174] transition-colors duration-200 p-2 rounded">
                <User className="mr-2" size={16} />
                <span className="truncate">{user.name || user.username}</span>
              </button>

              <div className="absolute bottom-full left-0 w-full mb-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg">
                <Link
                  href="/settings"
                  className="block px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Einstellungen
                </Link>
                <div className="px-3 py-2">
                  <LogoutButton />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;

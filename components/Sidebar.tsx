import { FileInputIcon, FilePlus2Icon, Home, LucideIcon } from "lucide-react";
import Link from "next/link";
import React from "react";

const Sidebar = () => {
  type LinkType = {
    title: string;
    path: string;
    icon: LucideIcon;
  };

  const links: LinkType[] = [
    {
      title: "Startseite",
      path: "/",
      icon: Home,
    },
    {
      title: "Datei hochladen",
      path: "/upload",
      icon: FilePlus2Icon,
    },
    {
      title: "Meine Uploads",
      path: "/my-uploads",
      icon: FileInputIcon,
    },
  ];

  return (
    <div className="w-48 h-screen sticky top-0 border-r-[0.8px] border-r-gray-300 bg-[#f4f4f4] shadow-lg">
      <div className="w-full h-full">
        <div className="flex justify-center mb-6 px-3 mt-2">
          <h1 className="text-center">Universität für Bodenkultur Wien</h1>
        </div>
        <div className="space-y-4">
          {links.map((link) => (
            <div
              key={link.title}
              className="ml-3 flex flex-row items-center hover:text-[#357174]"
            >
              <link.icon className="mr-2" size={18} />
              <Link href={link.path}>{link.title}</Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;

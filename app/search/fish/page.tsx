import FishSearchFieldComponent from "@/components/FishSearchFieldComponent";
import Sidebar from "@/components/Sidebar";
import React from "react";

const FishFinderPage = () => {
  return (
    <div className="flex flex-row">
      <div>
        <Sidebar />
      </div>
      <div className="flex flex-col justify-center items-center h-screen w-full">
        <div className="h-72 w-full flex flex-col items-center">
          <h1 className="text-4xl font-bold">Fischsuche</h1>
          <FishSearchFieldComponent />
        </div>
      </div>
    </div>
  );
};

export default FishFinderPage;

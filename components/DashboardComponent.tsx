import React from "react";
import Sidebar from "./Sidebar";
import SqlQueryComponent from "./SqlQueryComponent";

const DashboardComponent = () => {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <SqlQueryComponent />
    </div>
  );
};

export default DashboardComponent;

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import DarkModeToggle from "./DarkModeToggle";
import {
  Users,
  FileSpreadsheet,
  Files,
  Fish,
  Download,
  Trash2,
  UserPlus,
  Edit,
} from "lucide-react";
import AdminTemplateFilesManager from "./AdminTemplateFilesManager";
import AdminFishSpeciesManager from "./AdminFishSpeciesManager";
import { useAuth } from "./AuthProvider";

/** One `Imports` row (#202): an import commits directly, no review step. */
type ImportItem = {
  id: string;
  fileName: string;
  fileHash: string;
  rowCount: number;
  createdAt: string;
  samplings: number;
  userId: string;
  importedByUsername: string;
  importedByName: string | null;
};

type User = {
  id: string;
  username: string;
  email: string;
  name: string;
  role: "VIEWER" | "ADMIN" | "SUPER_ADMIN";
  isActive: boolean;
  createdAt: string;
};

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("de-AT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("de-AT", { dateStyle: "medium" }).format(date);
}

const AdminPageComponent = () => {
  const { user: currentUser } = useAuth();
  const isCurrentUserSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  const [activeTab, setActiveTab] = useState("imports");
  const [imports, setImports] = useState<ImportItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [deleteConfirmUserId, setDeleteConfirmUserId] = useState<string | null>(
    null,
  );
  const [importSearch, setImportSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ImportItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // New user form state
  const [newUser, setNewUser] = useState({
    email: "",
    username: "",
    name: "",
    password: "",
  });

  // Edit user form state
  const [editUser, setEditUser] = useState({
    email: "",
    username: "",
    name: "",
    role: "VIEWER" as "VIEWER" | "ADMIN" | "SUPER_ADMIN",
    isActive: true,
    password: "",
  });

  const fetchUsersAndImports = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/fetch-all/", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      if (response.ok) {
        setUsers(data.users);
        setImports(data.imports);
      }
    } catch (error) {
      console.error("Error fetching admin data:", error);
    }
  }, []);

  useEffect(() => {
    fetchUsersAndImports();
  }, [fetchUsersAndImports]);

  const filteredImports = useMemo(() => {
    const search = importSearch.trim().toLowerCase();

    return imports.filter((item) => {
      if (search.length === 0) return true;
      return (
        item.fileName.toLowerCase().includes(search) ||
        item.importedByUsername.toLowerCase().includes(search) ||
        (item.importedByName ?? "").toLowerCase().includes(search)
      );
    });
  }, [importSearch, imports]);

  const handleDownload = async (importId: string) => {
    try {
      const response = await fetch(`/api/admin/download/${importId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const disposition = response.headers.get("content-disposition") ?? "";
        const match = /filename="?([^"]+)"?/.exec(disposition);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = match?.[1] ?? "import.xlsx";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const errorData = await response.json();
        alert(`Download failed: ${errorData.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error downloading file:", error);
      alert("Network error during download. Please try again.");
    }
  };

  const openDeleteDialog = (item: ImportItem) => {
    setPendingDelete(item);
    setDeleteError("");
  };

  const closeDeleteDialog = () => {
    setPendingDelete(null);
    setDeleteError("");
  };

  const handleDeleteImport = async () => {
    if (!pendingDelete || isDeleting) return;

    setIsDeleting(true);
    setDeleteError("");

    try {
      const response = await fetch(`/api/admin/imports/${pendingDelete.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const deletedId = pendingDelete.id;
        setImports((current) => current.filter((item) => item.id !== deletedId));
        setPendingDelete(null);
        return;
      }

      let message = "The import could not be deleted.";
      try {
        const payload = await response.json();
        if (typeof payload?.error === "string") {
          message = payload.error;
        }
      } catch {
        // Ignore JSON parsing errors and keep the fallback message.
      }
      setDeleteError(message);
    } catch (error) {
      console.error("Error deleting import:", error);
      setDeleteError("Network error while deleting the import.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateUser = async () => {
    if (
      !newUser.email ||
      !newUser.username ||
      !newUser.name ||
      !newUser.password
    ) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      const response = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newUser),
      });

      const data = await response.json();

      if (response.ok) {
        // Add new user to the list
        setUsers([...users, data.user]);
        setShowCreateUserModal(false);
        setNewUser({ email: "", username: "", name: "", password: "" });
        alert("User created successfully.");
      } else {
        alert(`Error: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error creating user:", error);
      alert("Network error. Please try again.");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (response.ok) {
        setUsers(users.filter((user) => user.id !== userId));
        setDeleteConfirmUserId(null);
        alert("User deleted.");
      } else {
        alert(`Error: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Network error. Please try again.");
    }
  };

  const handleEditUserClick = (user: User) => {
    console.log(user);
    setEditUser({
      email: user.email,
      username: user.username,
      name: user.name || "",
      role: user.role,
      isActive: user.isActive,
      password: "",
    });
    setEditingUserId(user.id);
    setShowEditUserModal(true);
  };

  const handleEditUser = async () => {
    if (!editUser.email || !editUser.username) {
      alert("Email and username are required.");
      return;
    }

    try {
      const updateData: any = {
        email: editUser.email,
        username: editUser.username,
        name: editUser.name,
        role: editUser.role,
        isActive: editUser.isActive,
      };

      // Only include password if it was changed
      if (editUser.password.trim()) {
        updateData.password = editUser.password;
      }

      const response = await fetch(`/api/admin/users/${editingUserId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();

      if (response.ok) {
        // Update user in the list
        setUsers(
          users.map((user) => (user.id === editingUserId ? data.user : user)),
        );
        setShowEditUserModal(false);
        setEditingUserId(null);
        setEditUser({
          email: "",
          username: "",
          name: "",
          role: "VIEWER",
          isActive: true,
          password: "",
        });
        alert("User updated successfully.");
      } else {
        alert(`Error: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error updating user:", error);
      alert("Network error. Please try again.");
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 p-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">
              Admin Dashboard
            </h1>
            <DarkModeToggle variant="page" />
          </div>

          <div className="flex space-x-4 mb-6 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab("imports")}
              className={`flex items-center px-4 py-2 border-b-2 transition-colors ${
                activeTab === "imports"
                  ? "border-[#357174] text-[#357174]"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              <FileSpreadsheet className="mr-2" size={20} />
              All Imports
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`flex items-center px-4 py-2 border-b-2 transition-colors ${
                activeTab === "users"
                  ? "border-[#357174] text-[#357174]"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              <Users className="mr-2" size={20} />
              User Management
            </button>
            <button
              onClick={() => setActiveTab("template-files")}
              className={`flex items-center px-4 py-2 border-b-2 transition-colors ${
                activeTab === "template-files"
                  ? "border-[#357174] text-[#357174]"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              <Files className="mr-2" size={20} />
              Template Files
            </button>
            <button
              onClick={() => setActiveTab("fish-species")}
              className={`flex items-center px-4 py-2 border-b-2 transition-colors ${
                activeTab === "fish-species"
                  ? "border-[#357174] text-[#357174]"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              <Fish className="mr-2" size={20} />
              Fish Species
            </button>
          </div>

          {/* Tab Content */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            {activeTab === "imports" && (
              <div>
                <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-4">
                  All Imports
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Every import in the system. Deleting an import removes its
                  catches, its samplings and the original file.
                </p>

                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={importSearch}
                    onChange={(event) => setImportSearch(event.target.value)}
                    placeholder="Search by file name or username"
                    className="w-full sm:max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                  />

                  <button
                    onClick={fetchUsersAndImports}
                    className="px-4 py-2 bg-[#357174] text-white rounded hover:bg-[#2a5a5d] transition-colors"
                  >
                    Refresh
                  </button>
                </div>

                {filteredImports.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <FileSpreadsheet className="mx-auto mb-4" size={48} />
                    <p>No imports found.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            File
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Imported by
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Rows
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Samplings
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Imported at
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredImports.map((item) => {
                          return (
                            <tr
                              key={item.id}
                              className="hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                              <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 break-all">
                                {item.fileName}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {item.importedByUsername}
                                {item.importedByName &&
                                  ` (${item.importedByName})`}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {item.rowCount}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {item.samplings}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {formatDateTime(item.createdAt)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                  Active
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <div className="flex items-center space-x-3">
                                  <button
                                    onClick={() => handleDownload(item.id)}
                                    className="text-blue-600 hover:text-blue-800 flex items-center"
                                    title="Download file"
                                  >
                                    <Download size={16} className="mr-1" />
                                    Download
                                  </button>
                                  <button
                                    onClick={() => openDeleteDialog(item)}
                                    className="text-red-600 hover:text-red-800 flex items-center"
                                    title="Delete import"
                                  >
                                    <Trash2 size={16} className="mr-1" />
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* User Management Tab */}
            {activeTab === "users" && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">
                      User Management
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Create and manage user accounts.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCreateUserModal(true)}
                    className="px-4 py-2 bg-[#357174] text-white rounded hover:bg-[#2a5a5d] transition-colors flex items-center"
                  >
                    <UserPlus size={18} className="mr-2" />
                    New User
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Username
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          E-Mail
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Created At
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {users.map((user) => (
                        <tr
                          key={user.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                            {user.username}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {user.email}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {user.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {user.role}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                user.isActive
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                  : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                              }`}
                            >
                              {user.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {user.createdAt}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {deleteConfirmUserId === user.id ? (
                              <div className="flex items-center space-x-2">
                                <span className="text-red-600 text-xs">
                                  Confirm delete?
                                </span>
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-xs"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmUserId(null)}
                                  className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors text-xs"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleEditUserClick(user)}
                                  className="text-blue-600 hover:text-blue-800 flex items-center"
                                  title="Edit user"
                                >
                                  <Edit size={16} className="mr-1" />
                                  Edit
                                </button>
                                <button
                                  onClick={() =>
                                    setDeleteConfirmUserId(user.id)
                                  }
                                  className="text-red-600 hover:text-red-800 flex items-center"
                                  title="Delete user"
                                >
                                  <Trash2 size={16} className="mr-1" />
                                  Delete
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "template-files" && <AdminTemplateFilesManager />}

            {activeTab === "fish-species" && <AdminFishSpeciesManager />}
          </div>
        </div>
      </div>

      {/* Delete Import Modal */}
      {pendingDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">
              Delete this import?
            </h3>

            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
              <p className="font-medium text-gray-800 dark:text-gray-200 break-all">
                {pendingDelete.fileName} — {pendingDelete.rowCount} rows,
                imported {formatDate(pendingDelete.createdAt)}
              </p>
              <p>
                {pendingDelete.rowCount} catches from{" "}
                {pendingDelete.samplings} samplings will be deleted.
              </p>
              <p>
                The original file and the import record itself will be deleted
                from the database — this cannot be undone.
              </p>
              <p>recapture flags of other imports stay unchanged.</p>
              <p>Analyses that already ran will not be corrected.</p>
            </div>

            {deleteError && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-sm text-red-800 dark:text-red-300">
                {deleteError}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3 mt-6">
              <button
                onClick={() => handleDownload(pendingDelete.id)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Download a copy
              </button>
              <button
                onClick={closeDeleteDialog}
                disabled={isDeleting}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteImport}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:bg-gray-400"
              >
                {isDeleting ? "Deleting..." : "Delete import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">
              Create New User
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  E-Mail
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                  placeholder="max.mustermann@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) =>
                    setNewUser({ ...newUser, username: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                  placeholder="max.mustermann"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) =>
                    setNewUser({ ...newUser, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                  placeholder="Max Mustermann"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Temporary Password
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                  placeholder="Temporary password"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  The user must change this password on first login.
                </p>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateUserModal(false);
                  setNewUser({
                    email: "",
                    username: "",
                    name: "",
                    password: "",
                  });
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                className="px-4 py-2 bg-[#357174] text-white rounded hover:bg-[#2a5a5d] transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">
              Edit User
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  E-Mail
                </label>
                <input
                  type="email"
                  value={editUser.email}
                  onChange={(e) =>
                    setEditUser({ ...editUser, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                  placeholder="max.mustermann@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={editUser.username}
                  onChange={(e) =>
                    setEditUser({ ...editUser, username: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                  placeholder="max.mustermann"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={editUser.name}
                  onChange={(e) =>
                    setEditUser({ ...editUser, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                  placeholder="Max Mustermann"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role
                </label>
                <select
                  value={editUser.role}
                  onChange={(e) =>
                    setEditUser({
                      ...editUser,
                      role: e.target.value as
                        | "VIEWER"
                        | "ADMIN"
                        | "SUPER_ADMIN",
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="ADMIN">Admin</option>
                  {isCurrentUserSuperAdmin && (
                    <option value="SUPER_ADMIN">Super Admin</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Account Status
                </label>
                <select
                  value={editUser.isActive ? "ACTIVE" : "INACTIVE"}
                  onChange={(e) =>
                    setEditUser({
                      ...editUser,
                      isActive: e.target.value === "ACTIVE",
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  New Password (optional)
                </label>
                <input
                  type="password"
                  value={editUser.password}
                  onChange={(e) =>
                    setEditUser({ ...editUser, password: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                  placeholder="New password (leave empty for no change)"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Leave empty to keep the current password.
                </p>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowEditUserModal(false);
                  setEditingUserId(null);
                  setEditUser({
                    email: "",
                    username: "",
                    name: "",
                    role: "VIEWER",
                    isActive: true,
                    password: "",
                  });
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditUser}
                className="px-4 py-2 bg-[#357174] text-white rounded hover:bg-[#2a5a5d] transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPageComponent;

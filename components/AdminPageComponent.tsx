"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import DarkModeToggle from "./DarkModeToggle";
import {
  Users,
  FileSpreadsheet,
  Files,
  Download,
  Check,
  X,
  Trash2,
  UserPlus,
  Edit,
} from "lucide-react";
import AdminDummyFilesManager from "./AdminDummyFilesManager";

type Upload = {
  id: string;
  link: string;
  uploaded_by: string;
  createdAt: string;
  updatedAt: string;
  state: string;
  note?: string | null;
};

type User = {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

const AdminPageComponent = () => {
  const [activeTab, setActiveTab] = useState("uploads");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [selectedUploadId, setSelectedUploadId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [deleteConfirmUserId, setDeleteConfirmUserId] = useState<string | null>(
    null,
  );
  const [uploadStateFilter, setUploadStateFilter] = useState<string>("ALL");
  const [uploadSearch, setUploadSearch] = useState("");

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
    role: "",
    password: "",
  });

  const fetchUsersAndUploads = useCallback(async () => {
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
        setUploads(data.uploads);
      }
    } catch (error) {
      console.error("Error fetching admin data:", error);
    }
  }, []);

  useEffect(() => {
    fetchUsersAndUploads();
  }, [fetchUsersAndUploads]);

  const uploadStates = useMemo(() => {
    const states = new Set(uploads.map((upload) => upload.state));
    return ["ALL", ...Array.from(states)];
  }, [uploads]);

  const pendingUploadsCount = useMemo(
    () => uploads.filter((upload) => upload.state === "UPLOADED").length,
    [uploads],
  );

  const filteredUploads = useMemo(() => {
    const search = uploadSearch.trim().toLowerCase();

    return uploads.filter((upload) => {
      const stateMatch =
        uploadStateFilter === "ALL" || upload.state === uploadStateFilter;

      const searchMatch =
        search.length === 0 ||
        upload.id.toLowerCase().includes(search) ||
        upload.link.toLowerCase().includes(search) ||
        upload.uploaded_by.toLowerCase().includes(search);

      return stateMatch && searchMatch;
    });
  }, [uploadSearch, uploadStateFilter, uploads]);

  const handleDownload = async (filename: string) => {
    try {
      const response = await fetch(`/api/admin/download/${filename}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const errorData = await response.json();
        alert(`Download failed: ${errorData.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error downloading file:", error);
      alert("Network error during download. Please try again.");
    }
  };

  const handleAccept = async (uploadId: string) => {
    try {
      const response = await fetch(`/api/admin/uploads/${uploadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "accept" }),
      });

      if (response.ok) {
        setUploads(
          uploads.map((upload) =>
            upload.id === uploadId ? { ...upload, state: "ACCEPTED" } : upload,
          ),
        );
        alert("Upload has been accepted.");
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error accepting upload:", error);
      alert("Network error. Please try again.");
    }
  };

  const handleDenyClick = (uploadId: string) => {
    setSelectedUploadId(uploadId);
    setShowDenyModal(true);
  };

  const handleDenyConfirm = async () => {
    if (!denyReason.trim()) {
      alert("Please provide a reason for rejection.");
      return;
    }

    try {
      const response = await fetch(`/api/admin/uploads/${selectedUploadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "deny",
          reason: denyReason,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setUploads(
          uploads.map((upload) =>
            upload.id === selectedUploadId
              ? { ...upload, state: "REJECTED", note: denyReason }
              : upload,
          ),
        );

        // Reset modal state
        setShowDenyModal(false);
        setDenyReason("");
        setSelectedUploadId(null);

        alert("Upload has been rejected.");
      } else {
        alert(`Rejection failed: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error denying upload:", error);
      alert("Network error while rejecting upload. Please try again.");
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
          role: "",
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
              onClick={() => setActiveTab("uploads")}
              className={`flex items-center px-4 py-2 border-b-2 transition-colors ${
                activeTab === "uploads"
                  ? "border-[#357174] text-[#357174]"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              <FileSpreadsheet className="mr-2" size={20} />
              Upload Management
              {pendingUploadsCount > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {pendingUploadsCount}
                </span>
              )}
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
              onClick={() => setActiveTab("dummy-files")}
              className={`flex items-center px-4 py-2 border-b-2 transition-colors ${
                activeTab === "dummy-files"
                  ? "border-[#357174] text-[#357174]"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              <Files className="mr-2" size={20} />
              Dummy Files
            </button>
          </div>

          {/* Tab Content */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            {activeTab === "uploads" && (
              <div>
                <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-4">
                  Upload Management
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  All uploads in the system with filtering and search.
                </p>

                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <select
                    value={uploadStateFilter}
                    onChange={(event) =>
                      setUploadStateFilter(event.target.value)
                    }
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                  >
                    {uploadStates.map((state) => (
                      <option key={state} value={state}>
                        {state === "ALL" ? "All statuses" : state}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={uploadSearch}
                    onChange={(event) => setUploadSearch(event.target.value)}
                    placeholder="Search by file name, user ID, or upload ID"
                    className="w-full sm:max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                  />

                  <button
                    onClick={fetchUsersAndUploads}
                    className="px-4 py-2 bg-[#357174] text-white rounded hover:bg-[#2a5a5d] transition-colors"
                  >
                    Refresh
                  </button>
                </div>

                {filteredUploads.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <FileSpreadsheet className="mx-auto mb-4" size={48} />
                    <p>No uploads found for the current filter.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredUploads.map((upload) => (
                      <div
                        key={upload.id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center">
                              <FileSpreadsheet
                                className="mr-3 text-green-600"
                                size={24}
                              />
                              <div>
                                <h3 className="font-semibold text-gray-800 dark:text-gray-100">
                                  {upload.link}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  Upload-ID: {upload.id}
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  Uploaded by {upload.uploaded_by} on{" "}
                                  {upload.createdAt}
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  Status: {upload.state}
                                </p>
                                {upload.note && (
                                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                    Note: {upload.note}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                console.log(upload);
                                console.log(upload.link);
                                handleDownload(upload.link);
                              }}
                              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center"
                              title="Download file"
                            >
                              <Download size={18} className="mr-2" />
                              Download
                            </button>
                            {upload.state === "UPLOADED" && (
                              <>
                                <button
                                  onClick={() => handleAccept(upload.id)}
                                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors flex items-center"
                                  title="Accept upload"
                                >
                                  <Check size={18} className="mr-2" />
                                  Accept
                                </button>
                                <button
                                  onClick={() => handleDenyClick(upload.id)}
                                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors flex items-center"
                                  title="Reject upload"
                                >
                                  <X size={18} className="mr-2" />
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
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

            {activeTab === "dummy-files" && <AdminDummyFilesManager />}
          </div>
        </div>
      </div>

      {/* Deny Upload Modal */}
      {showDenyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">
              Reject Upload
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Please provide a reason for rejection:
            </p>
            <textarea
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174] mb-4 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
              rows={4}
              placeholder="Reason for rejection..."
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDenyModal(false);
                  setDenyReason("");
                  setSelectedUploadId(null);
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDenyConfirm}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Reject
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
                    setEditUser({ ...editUser, role: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
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
                    role: "",
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

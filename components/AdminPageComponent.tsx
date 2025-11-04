"use client";

import React, { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import {
  Users,
  FileSpreadsheet,
  Download,
  Check,
  X,
  Trash2,
  UserPlus,
  Edit,
} from "lucide-react";

type Upload = {
  id: string;
  link: string;
  uploaded_by: string;
  createdAt: string;
  state: string;
};

type User = {
  id: string;
  username: string;
  email: string;
  name: string;
  role?: string;
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
    null
  );

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

  useEffect(() => {
    const fetchUsersAndUploads = async () => {
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
    };
    fetchUsersAndUploads();
  }, []);

  const handleDownload = async (filename: string) => {
    filename = filename.split("/")[2];

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
        alert(
          `Download fehlgeschlagen: ${
            errorData.message || "Unbekannter Fehler"
          }`
        );
      }
    } catch (error) {
      console.error("Error downloading file:", error);
      alert("Netzwerkfehler beim Download. Bitte versuchen Sie es erneut.");
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
        setUploads(uploads.filter((upload) => upload.id !== uploadId));
        alert("Upload wurde akzeptiert!");
      } else {
        const errorData = await response.json();
        alert(`Fehler: ${errorData.error || "Unbekannter Fehler"}`);
      }
    } catch (error) {
      console.error("Error accepting upload:", error);
      alert("Netzwerkfehler. Bitte versuchen Sie es erneut.");
    }
  };

  const handleDenyClick = (uploadId: string) => {
    setSelectedUploadId(uploadId);
    setShowDenyModal(true);
  };

  const handleDenyConfirm = async () => {
    if (!denyReason.trim()) {
      alert("Bitte geben Sie einen Grund für die Ablehnung an.");
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
        // Remove the denied upload from the list
        setUploads(uploads.filter((upload) => upload.id !== selectedUploadId));

        // Reset modal state
        setShowDenyModal(false);
        setDenyReason("");
        setSelectedUploadId(null);

        alert("Upload wurde erfolgreich abgelehnt.");
      } else {
        alert(`Fehler beim Ablehnen: ${data.error || "Unbekannter Fehler"}`);
      }
    } catch (error) {
      console.error("Error denying upload:", error);
      alert(
        "Netzwerkfehler beim Ablehnen des Uploads. Bitte versuchen Sie es erneut."
      );
    }
  };

  const handleCreateUser = async () => {
    if (
      !newUser.email ||
      !newUser.username ||
      !newUser.name ||
      !newUser.password
    ) {
      alert("Bitte füllen Sie alle Felder aus.");
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
        alert("Benutzer wurde erfolgreich erstellt!");
      } else {
        alert(`Fehler: ${data.error || "Unbekannter Fehler"}`);
      }
    } catch (error) {
      console.error("Error creating user:", error);
      alert("Netzwerkfehler. Bitte versuchen Sie es erneut.");
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
        alert("Benutzer wurde gelöscht!");
      } else {
        alert(`Fehler: ${data.error || "Unbekannter Fehler"}`);
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Netzwerkfehler. Bitte versuchen Sie es erneut.");
    }
  };

  const handleEditUserClick = (user: User) => {
    setEditUser({
      email: user.email,
      username: user.username,
      name: user.name || "",
      role: user.role || "viewer",
      password: "",
    });
    setEditingUserId(user.id);
    setShowEditUserModal(true);
  };

  const handleEditUser = async () => {
    if (!editUser.email || !editUser.username) {
      alert("E-Mail und Benutzername sind erforderlich.");
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
        setUsers(users.map(user => 
          user.id === editingUserId ? data.user : user
        ));
        setShowEditUserModal(false);
        setEditingUserId(null);
        setEditUser({
          email: "",
          username: "",
          name: "",
          role: "",
          password: "",
        });
        alert("Benutzer wurde erfolgreich aktualisiert!");
      } else {
        alert(`Fehler: ${data.error || "Unbekannter Fehler"}`);
      }
    } catch (error) {
      console.error("Error updating user:", error);
      alert("Netzwerkfehler. Bitte versuchen Sie es erneut.");
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 p-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-800 mb-8">
            Admin Dashboard
          </h1>

          {/* Tab Navigation */}
          <div className="flex space-x-4 mb-6 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("uploads")}
              className={`flex items-center px-4 py-2 border-b-2 transition-colors ${
                activeTab === "uploads"
                  ? "border-[#357174] text-[#357174]"
                  : "border-transparent text-gray-600 hover:text-gray-800"
              }`}
            >
              <FileSpreadsheet className="mr-2" size={20} />
              Upload-Verwaltung
              {uploads.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {uploads.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`flex items-center px-4 py-2 border-b-2 transition-colors ${
                activeTab === "users"
                  ? "border-[#357174] text-[#357174]"
                  : "border-transparent text-gray-600 hover:text-gray-800"
              }`}
            >
              <Users className="mr-2" size={20} />
              Benutzerverwaltung
            </button>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-lg shadow-md p-6">
            {/* Upload Management Tab */}
            {activeTab === "uploads" && (
              <div>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                  Upload-Verwaltung
                </h2>
                <p className="text-gray-600 mb-6">
                  Überprüfen und bestätigen Sie hochgeladene Excel-Dateien.
                </p>

                {uploads.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileSpreadsheet className="mx-auto mb-4" size={48} />
                    <p>Keine ausstehenden Uploads vorhanden.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {uploads.map((upload) => (
                      <div
                        key={upload.id}
                        className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center">
                              <FileSpreadsheet
                                className="mr-3 text-green-600"
                                size={24}
                              />
                              <div>
                                <h3 className="font-semibold text-gray-800">
                                  {upload.link}
                                </h3>
                                <p className="text-sm text-gray-500">
                                  Hochgeladen von {upload.uploaded_by} am{" "}
                                  {upload.createdAt}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleDownload(upload.link)}
                              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center"
                              title="Datei herunterladen"
                            >
                              <Download size={18} className="mr-2" />
                              Download
                            </button>
                            <button
                              onClick={() => handleAccept(upload.id)}
                              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors flex items-center"
                              title="Upload akzeptieren"
                            >
                              <Check size={18} className="mr-2" />
                              Akzeptieren
                            </button>
                            <button
                              onClick={() => handleDenyClick(upload.id)}
                              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors flex items-center"
                              title="Upload ablehnen"
                            >
                              <X size={18} className="mr-2" />
                              Ablehnen
                            </button>
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
                    <h2 className="text-2xl font-semibold text-gray-800">
                      Benutzerverwaltung
                    </h2>
                    <p className="text-gray-600">
                      Erstellen und verwalten Sie Benutzerkonten.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCreateUserModal(true)}
                    className="px-4 py-2 bg-[#357174] text-white rounded hover:bg-[#2a5a5d] transition-colors flex items-center"
                  >
                    <UserPlus size={18} className="mr-2" />
                    Neuer Benutzer
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Benutzername
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          E-Mail
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Erstellt am
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Aktionen
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {user.username}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {user.email}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {user.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {user.createdAt}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {deleteConfirmUserId === user.id ? (
                              <div className="flex items-center space-x-2">
                                <span className="text-red-600 text-xs">
                                  Wirklich löschen?
                                </span>
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-xs"
                                >
                                  Ja
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmUserId(null)}
                                  className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors text-xs"
                                >
                                  Nein
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleEditUserClick(user)}
                                  className="text-blue-600 hover:text-blue-800 flex items-center"
                                  title="Benutzer bearbeiten"
                                >
                                  <Edit size={16} className="mr-1" />
                                  Bearbeiten
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmUserId(user.id)}
                                  className="text-red-600 hover:text-red-800 flex items-center"
                                  title="Benutzer löschen"
                                >
                                  <Trash2 size={16} className="mr-1" />
                                  Löschen
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
          </div>
        </div>
      </div>

      {/* Deny Upload Modal */}
      {showDenyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              Upload ablehnen
            </h3>
            <p className="text-gray-600 mb-4">
              Bitte geben Sie einen Grund für die Ablehnung an:
            </p>
            <textarea
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174] mb-4"
              rows={4}
              placeholder="Grund für die Ablehnung..."
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDenyModal(false);
                  setDenyReason("");
                  setSelectedUploadId(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDenyConfirm}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Ablehnen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              Neuen Benutzer erstellen
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-Mail
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174]"
                  placeholder="max.mustermann@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Benutzername
                </label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) =>
                    setNewUser({ ...newUser, username: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174]"
                  placeholder="max.mustermann"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) =>
                    setNewUser({ ...newUser, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174]"
                  placeholder="Max Mustermann"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Passwort (temporär)
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174]"
                  placeholder="Temporäres Passwort"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Der Benutzer muss das Passwort beim ersten Login ändern.
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
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleCreateUser}
                className="px-4 py-2 bg-[#357174] text-white rounded hover:bg-[#2a5a5d] transition-colors"
              >
                Erstellen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              Benutzer bearbeiten
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-Mail
                </label>
                <input
                  type="email"
                  value={editUser.email}
                  onChange={(e) =>
                    setEditUser({ ...editUser, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174]"
                  placeholder="max.mustermann@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Benutzername
                </label>
                <input
                  type="text"
                  value={editUser.username}
                  onChange={(e) =>
                    setEditUser({ ...editUser, username: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174]"
                  placeholder="max.mustermann"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={editUser.name}
                  onChange={(e) =>
                    setEditUser({ ...editUser, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174]"
                  placeholder="Max Mustermann"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rolle
                </label>
                <select
                  value={editUser.role}
                  onChange={(e) =>
                    setEditUser({ ...editUser, role: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174]"
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Neues Passwort (optional)
                </label>
                <input
                  type="password"
                  value={editUser.password}
                  onChange={(e) =>
                    setEditUser({ ...editUser, password: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#357174]"
                  placeholder="Neues Passwort (leer lassen für keine Änderung)"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leer lassen, um das Passwort nicht zu ändern.
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
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleEditUser}
                className="px-4 py-2 bg-[#357174] text-white rounded hover:bg-[#2a5a5d] transition-colors"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPageComponent;

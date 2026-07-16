"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  Save,
  Loader2,
  Edit2,
  CheckCircle2,
  LogOut,
} from "lucide-react";

export default function ProfilePage() {
  const {
    user,
    userName,
    userPhotoURL,
    partnerName,
    partnerPhotoURL,
    coupleId,
  } = useAuth();
  const router = useRouter();

  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(userName || "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewURL(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    setMessage("");

    try {
      let newPhotoURL = userPhotoURL;

      if (selectedFile) {
        // Upload to Cloudinary
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("upload_preset", "cagie-project");

        const res = await fetch(
          `https://api.cloudinary.com/v1_1/xcp1rumz/image/upload`,
          {
            method: "POST",
            body: formData,
          },
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data.error?.message || "Failed to upload image to Cloudinary",
          );
        }

        newPhotoURL = data.secure_url;
      }

      // Update Firestore
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        name: nameInput,
        ...(newPhotoURL && { photoURL: newPhotoURL }),
      });

      setMessage("Profile updated successfully!");
      setIsEditing(false);

      // Clear message after a while
      setTimeout(() => setMessage(""), 3000);

      // Note: The UI will update automatically because AuthContext listens to onAuthStateChanged,
      // but wait, AuthContext only fetches the profile document ONCE when auth state changes.
      // To reflect immediately, a full page reload or updating Context state is needed.
      // Since reloading is easiest for a quick update:
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      setMessage("Failed to save profile: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-gray-50 pb-[80px] md:pb-0">
      <div className="px-6 py-8 bg-white border-b border-gray-100 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Your Profile</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage your personal information
        </p>
      </div>

      <div className="p-6 max-w-lg mx-auto w-full space-y-8">
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${message.includes("Failed") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}
          >
            {message.includes("Failed") ? null : <CheckCircle2 size={18} />}
            {message}
          </motion.div>
        )}

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Personal Details</h2>
            {!isEditing ? (
              <button
                onClick={() => {
                  setNameInput(userName || "");
                  setIsEditing(true);
                }}
                className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors"
              >
                <Edit2 size={18} />
              </button>
            ) : (
              <button
                onClick={() => {
                  setIsEditing(false);
                  setSelectedFile(null);
                  setPreviewURL(null);
                }}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-primary text-white flex items-center justify-center text-3xl font-bold border-4 border-white shadow-md">
                {previewURL ? (
                  <img
                    src={previewURL}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : userPhotoURL ? (
                  <img
                    src={userPhotoURL}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (userName?.[0] || "U").toUpperCase()
                )}
              </div>

              <AnimatePresence>
                {isEditing && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="absolute bottom-0 right-0 bg-gray-900 text-white p-2 rounded-full cursor-pointer shadow-lg hover:bg-gray-800 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera size={16} />
                  </motion.div>
                )}
              </AnimatePresence>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
            </div>

            <div className="w-full space-y-1">
              <label className="text-xs font-medium text-gray-500 ml-1">
                Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary transition-all font-medium"
                  placeholder="Your name"
                />
              ) : (
                <div className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl font-medium text-gray-900">
                  {userName || "Not set"}
                </div>
              )}
            </div>

            <div className="w-full space-y-1 opacity-70">
              <label className="text-xs font-medium text-gray-500 ml-1">
                Email
              </label>
              <div className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl font-medium text-gray-500 text-sm">
                {user?.email}
              </div>
            </div>

            <AnimatePresence>
              {isEditing && (
                <motion.button
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full mt-4 py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-70"
                >
                  {isSaving ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <Save size={18} />
                  )}
                  {isSaving ? "Saving..." : "Save Profile"}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Partner Section */}
        {coupleId ? (
          <div className="bg-[#e5f7f8] p-6 rounded-3xl shadow-sm border border-cyan-100 flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-[#25b0b9] text-white flex items-center justify-center text-2xl font-bold border-2 border-white shadow-sm">
              {partnerPhotoURL ? (
                <img
                  src={partnerPhotoURL}
                  alt="Partner"
                  className="w-full h-full object-cover"
                />
              ) : (
                (partnerName?.[0] || "P").toUpperCase()
              )}
            </div>
            <div>
              <p className="text-sm text-[#25b0b9] font-semibold mb-0.5">
                Paired With
              </p>
              <h3 className="text-xl font-bold text-gray-900">
                {partnerName || "Partner"}
              </h3>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 p-6 rounded-3xl shadow-sm border border-gray-200 flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 text-gray-400 flex items-center justify-center text-2xl font-bold border-2 border-white shadow-sm">
              ?
            </div>
            <div>
              <p className="text-sm text-gray-500 font-semibold mb-0.5">
                Partner
              </p>
              <h3 className="text-xl font-bold text-gray-900">
                Not connected yet
              </h3>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="w-full mt-4 py-4 bg-red-50 text-red-600 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 active:scale-[0.98] transition-all border border-red-100"
        >
          <LogOut size={20} />
          Log Out
        </button>
      </div>
    </div>
  );
}

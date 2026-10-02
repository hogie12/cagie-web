"use client";

import { useState, useRef } from "react";
import { useAuth, NotificationStatus } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db, storage } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Save, Loader2, Edit2, LogOut, BellRing } from "lucide-react";
import { compressImage } from "@/lib/image";
import { errorMessage } from "@/lib/errors";
import { Avatar } from "@/components/Avatar";

function initialNotificationStatus(): NotificationStatus {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export default function ProfilePage() {
  const {
    user,
    userName,
    userPhotoURL,
    partnerName,
    partnerPhotoURL,
    coupleId,
    requestNotificationPermission,
    logout,
  } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [notificationStatus, setNotificationStatus] = useState(initialNotificationStatus);
  const [enablingNotifications, setEnablingNotifications] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(userName || "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewURL) URL.revokeObjectURL(previewURL);
    setSelectedFile(file);
    setPreviewURL(URL.createObjectURL(file));
  };

  const resetEdit = () => {
    if (previewURL) URL.revokeObjectURL(previewURL);
    setIsEditing(false);
    setSelectedFile(null);
    setPreviewURL(null);
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);

    try {
      let newPhotoURL = userPhotoURL;

      if (selectedFile) {
        const blob = await compressImage(selectedFile, 512);
        const avatarRef = ref(storage, `users/${user.uid}/avatar_${Date.now()}.jpg`);
        await uploadBytes(avatarRef, blob, { contentType: blob.type || "image/jpeg" });
        newPhotoURL = await getDownloadURL(avatarRef);
      }

      // The profile snapshot in AuthContext updates the UI everywhere.
      await updateDoc(doc(db, "users", user.uid), {
        name: nameInput.trim(),
        ...(newPhotoURL && { photoURL: newPhotoURL }),
      });

      toast("Profile updated", { kind: "success" });
      resetEdit();
    } catch (err) {
      console.error(err);
      toast("Failed to save profile", { kind: "error", body: errorMessage(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnableNotifications = async () => {
    setEnablingNotifications(true);
    try {
      const status = await requestNotificationPermission();
      setNotificationStatus(status);
      if (status === "granted") toast("Notifications enabled", { kind: "success" });
      else if (status === "denied")
        toast("Notifications are blocked", {
          kind: "error",
          body: "Allow notifications for this site in your browser settings, then try again.",
        });
      else if (status === "unsupported")
        toast("Not supported here", {
          kind: "error",
          body: "On iPhone, add Cagie to your Home Screen first, then enable notifications from there.",
        });
    } catch (err) {
      console.error(err);
      toast("Couldn't enable notifications", { kind: "error", body: errorMessage(err) });
    } finally {
      setEnablingNotifications(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
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
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Personal Details</h2>
            {!isEditing ? (
              <button
                onClick={() => {
                  setNameInput(userName || "");
                  setIsEditing(true);
                }}
                aria-label="Edit profile"
                className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors"
              >
                <Edit2 size={18} />
              </button>
            ) : (
              <button
                onClick={resetEdit}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <Avatar
                url={previewURL || userPhotoURL}
                name={userName}
                fallback="U"
                className="w-24 h-24 rounded-full text-3xl border-4 border-white shadow-md"
              />

              <AnimatePresence>
                {isEditing && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="absolute bottom-0 right-0 bg-gray-900 text-white p-2 rounded-full cursor-pointer shadow-lg hover:bg-gray-800 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Change photo"
                  >
                    <Camera size={16} />
                  </motion.button>
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
            <Avatar
              url={partnerPhotoURL}
              name={partnerName}
              fallback="P"
              colorClassName="bg-[#25b0b9] text-white"
              className="w-16 h-16 rounded-full text-2xl border-2 border-white shadow-sm"
            />
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

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Push Notifications</h3>
            <p className="text-sm text-gray-500 mt-1">Get alerts for new greetings & photos</p>
          </div>
          {notificationStatus === "granted" ? (
            // Tapping again re-registers this device (e.g. after reinstalling the PWA).
            <button
              onClick={handleEnableNotifications}
              disabled={enablingNotifications}
              title="Re-register this device"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-xl hover:bg-green-100 transition-colors disabled:opacity-50"
            >
              <BellRing size={16} /> On
            </button>
          ) : (
            <button
              onClick={handleEnableNotifications}
              disabled={enablingNotifications}
              className="px-4 py-2 bg-primary/10 text-foreground font-medium rounded-xl hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {enablingNotifications ? "Enabling..." : "Enable"}
            </button>
          )}
        </div>

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

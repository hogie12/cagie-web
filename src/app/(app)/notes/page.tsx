"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCoupleData, StickyNote } from "@/context/CoupleDataContext";
import { doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Check, Trash2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

const COLORS = [
  { id: "yellow", bg: "bg-[#fef08a]", border: "border-[#fde047]", text: "text-amber-900" },
  { id: "pink", bg: "bg-[#fbcfe8]", border: "border-[#f9a8d4]", text: "text-pink-900" },
  { id: "blue", bg: "bg-[#bfdbfe]", border: "border-[#93c5fd]", text: "text-blue-900" },
  { id: "green", bg: "bg-[#bbf7d0]", border: "border-[#86efac]", text: "text-green-900" },
  { id: "purple", bg: "bg-[#e9d5ff]", border: "border-[#d8b4fe]", text: "text-purple-900" },
];

export default function NotesPage() {
  const { user, coupleId, userName } = useAuth();
  const { notes, isLoading } = useCoupleData();
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newText, setNewText] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLORS[0].id);
  const [isSaving, setIsSaving] = useState(false);
  
  const [windowSize, setWindowSize] = useState({ width: typeof window !== "undefined" ? window.innerWidth : 1000, height: typeof window !== "undefined" ? window.innerHeight : 1000 });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
      handleResize();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);
  
  const boardRef = useRef<HTMLDivElement>(null);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || !coupleId || !user) return;
    
    setIsSaving(true);
    try {
      const noteId = uuidv4();
      
      // Random position roughly in the center
      const centerX = window.innerWidth / 2 - 100 + (Math.random() * 40 - 20);
      const centerY = window.innerHeight / 2 - 100 + (Math.random() * 40 - 20);

      const newNote: StickyNote = {
        id: noteId,
        text: newText,
        color: selectedColor,
        x: Math.max(20, centerX),
        y: Math.max(100, centerY),
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "couples", coupleId, "notes", noteId), newNote);
      
      setNewText("");
      setIsAddOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to add note.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!coupleId) return;
    try {
      await deleteDoc(doc(db, "couples", coupleId, "notes", id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDragEnd = async (id: string, info: any) => {
    if (!coupleId) return;
    try {
      const note = notes.find(n => n.id === id);
      if (!note) return;
      
      const safeX = Math.max(10, Math.min(note.x, windowSize.width - 190));
      const safeY = Math.max(80, Math.min(note.y, windowSize.height - 250));

      const newX = safeX + info.offset.x;
      const newY = safeY + info.offset.y;

      await updateDoc(doc(db, "couples", coupleId, "notes", id), {
        x: Math.max(10, Math.min(newX, windowSize.width - 190)),
        y: Math.max(80, Math.min(newY, windowSize.height - 250))
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] relative overflow-hidden" ref={boardRef}>
      
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-6 z-10 pointer-events-none">
        <h1 className="text-3xl font-bold text-gray-900 drop-shadow-sm">Notes Wall</h1>
        <p className="text-gray-600 font-medium drop-shadow-sm">Leave a sweet note!</p>
      </div>

      {/* Notes Board */}
      <div className="absolute inset-0 z-0">
        <AnimatePresence>
          {notes.map((note) => {
            const colorTheme = COLORS.find(c => c.id === note.color) || COLORS[0];
            const isMine = note.createdBy === user?.uid;
            
            const safeX = Math.max(10, Math.min(note.x, windowSize.width - 190));
            const safeY = Math.max(80, Math.min(note.y, windowSize.height - 250));
            
            return (
              <motion.div
                key={note.id}
                drag
                dragConstraints={boardRef}
                dragMomentum={false}
                onDragEnd={(_, info) => handleDragEnd(note.id, info)}
                initial={{ opacity: 0, scale: 0.8, x: safeX, y: safeY }}
                animate={{ opacity: 1, scale: 1, x: safeX, y: safeY }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className={`absolute w-[180px] min-h-[180px] ${colorTheme.bg} border ${colorTheme.border} p-4 rounded-bl-3xl rounded-tr-lg rounded-tl-lg rounded-br-lg shadow-[2px_4px_12px_rgba(0,0,0,0.08)] cursor-grab active:cursor-grabbing flex flex-col group`}
                style={{
                  boxShadow: "2px 4px 16px rgba(0,0,0,0.1), inset 0 0 40px rgba(0,0,0,0.02)"
                }}
              >
                <div className={`flex-1 text-sm font-medium whitespace-pre-wrap ${colorTheme.text} leading-relaxed`}>
                  {note.text}
                </div>
                
                <div className="mt-4 flex justify-between items-end opacity-50 group-hover:opacity-100 transition-opacity">
                  <div className={`text-[10px] font-bold ${colorTheme.text}`}>
                    {isMine ? (userName || "Me") : "Partner"}
                  </div>
                  
                  {isMine && (
                    <button 
                      onClick={() => handleDelete(note.id)}
                      className={`p-1.5 rounded-full hover:bg-black/5 transition-colors ${colorTheme.text}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                
                {/* Fold effect on bottom left */}
                <div className={`absolute bottom-0 left-0 w-6 h-6 bg-black/10 rounded-tr-xl rounded-bl-3xl pointer-events-none`} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* FAB Add Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsAddOpen(true)}
        className="absolute bottom-28 right-6 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center z-20"
      >
        <Plus size={28} />
      </motion.button>

      {/* Add Note Modal */}
      <AnimatePresence>
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl"
            >
              <button 
                onClick={() => setIsAddOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full p-2"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-bold mb-6">Write a Note</h2>

              <form onSubmit={handleAddNote} className="space-y-6">
                <div>
                  <textarea
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder="I love you because..."
                    className="w-full min-h-[120px] p-4 bg-gray-50 border border-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Choose Color</label>
                  <div className="flex gap-3 justify-between">
                    {COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedColor(c.id)}
                        className={`w-10 h-10 rounded-full ${c.bg} border-2 transition-all flex items-center justify-center ${selectedColor === c.id ? c.border + " scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
                      >
                        {selectedColor === c.id && <Check size={18} className={c.text} />}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!newText.trim() || isSaving}
                  className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isSaving ? "Sticking it..." : "Post Note"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

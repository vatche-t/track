import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Card } from "./ui";

// Reusable modal: fade + scale in, closes on backdrop click and Esc.
// Props: open, onClose, title, children, wide (roomier panel for review flows).
export function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{ width: wide ? "min(760px, 100%)" : "min(560px, 100%)" }}
          >
            <Card className="modal modal-panel">
              <div className="modal-head">
                {title && <h2>{title}</h2>}
                <button
                  type="button"
                  className="icon-btn"
                  onClick={onClose}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="modal-body">{children}</div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

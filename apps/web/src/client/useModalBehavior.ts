import { useEffect } from "react";

/**
 * Shared modal behavior: Escape closes, background scroll locks.
 * Pair with overlay onClick={onClose} + panel onClick stopPropagation.
 */
export function useModalBehavior(onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, active]);
}

import { useState, useEffect, useCallback } from "react";
import { useT } from "@/i18n";

interface UndoAction {
  message: string;
  onUndo: () => void;
}

let showToastFn: ((action: UndoAction) => void) | null = null;

/** Call this from anywhere to show an undo toast */
export function showUndoToast(action: UndoAction) {
  showToastFn?.(action);
}

export function UndoToast() {
  const { t } = useT();
  const [action, setAction] = useState<UndoAction | null>(null);
  const [visible, setVisible] = useState(false);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => setAction(null), 300);
  }, []);

  useEffect(() => {
    showToastFn = (newAction: UndoAction) => {
      setAction(newAction);
      setVisible(true);
    };
    return () => {
      showToastFn = null;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(dismiss, 5000);
    return () => clearTimeout(timer);
  }, [visible, action, dismiss]);

  if (!action) return null;

  const handleUndo = () => {
    action.onUndo();
    dismiss();
  };

  return (
    <div
      className={`fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between rounded-xl bg-stone-900 px-4 py-3 shadow-2xl transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <span className="text-sm text-stone-200">{action.message}</span>
      <button
        onClick={handleUndo}
        className="ml-4 shrink-0 rounded-md bg-white/10 px-3 py-1 text-[13px] font-semibold text-white hover:bg-white/20 transition-colors"
      >
        {t("undo.button")}
      </button>
    </div>
  );
}

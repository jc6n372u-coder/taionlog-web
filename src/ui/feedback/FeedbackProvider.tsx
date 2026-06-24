import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { COLORS } from "../tokens";
import { registerFeedbackApi, type FeedbackApi, type FeedbackTone } from "./feedbackService";

type DialogKind = "alert" | "confirm" | "prompt";

type DialogRequest = {
  id: number;
  kind: DialogKind;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  inputLabel?: string;
  initialValue?: string;
  placeholder?: string;
  resolve: (value: boolean | string | null) => void;
};

let sequence = 0;

type SnackbarRequest = {
  id: number;
  message: string;
  tone: FeedbackTone;
  durationMs: number;
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialogs, setDialogs] = useState<DialogRequest[]>([]);
  const [snackbar, setSnackbar] = useState<SnackbarRequest | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const currentDialog = dialogs[0] ?? null;

  const alert = useCallback((title: string, message = "") => {
    return new Promise<void>((resolve) => {
      setDialogs((current) => [
        ...current,
        {
          id: ++sequence,
          kind: "alert",
          title,
          message,
          confirmLabel: "閉じる",
          cancelLabel: "",
          danger: false,
          resolve: () => resolve(),
        },
      ]);
    });
  }, []);

  const confirm = useCallback<FeedbackApi["confirm"]>((options) => {
    return new Promise<boolean>((resolve) => {
      setDialogs((current) => [
        ...current,
        {
          id: ++sequence,
          kind: "confirm",
          title: options.title,
          message: options.message,
          confirmLabel: options.confirmLabel ?? "実行する",
          cancelLabel: options.cancelLabel ?? "キャンセル",
          danger: Boolean(options.danger),
          resolve: (value) => resolve(Boolean(value)),
        },
      ]);
    });
  }, []);

  const prompt = useCallback<FeedbackApi["prompt"]>((options) => {
    return new Promise<string | null>((resolve) => {
      setDialogs((current) => [
        ...current,
        {
          id: ++sequence,
          kind: "prompt",
          title: options.title,
          message: options.message ?? "",
          confirmLabel: options.confirmLabel ?? "決定",
          cancelLabel: options.cancelLabel ?? "キャンセル",
          danger: false,
          inputLabel: options.label,
          initialValue: options.initialValue ?? "",
          placeholder: options.placeholder,
          resolve: (value) => resolve(typeof value === "string" ? value : null),
        },
      ]);
    });
  }, []);

  const notify = useCallback<FeedbackApi["notify"]>((message, options) => {
    setSnackbar({
      id: ++sequence,
      message,
      tone: options?.tone ?? "success",
      durationMs: options?.durationMs ?? 3_000,
    });
  }, []);

  const api = useMemo(() => ({ alert, confirm, prompt, notify }), [alert, confirm, prompt, notify]);

  useEffect(() => {
    registerFeedbackApi(api);
    return () => registerFeedbackApi(null);
  }, [api]);

  useEffect(() => {
    if (!snackbar) return;
    const timer = window.setTimeout(
      () => setSnackbar((current) => (current?.id === snackbar.id ? null : current)),
      snackbar.durationMs,
    );
    return () => window.clearTimeout(timer);
  }, [snackbar]);

  useEffect(() => {
    if (!currentDialog) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    if (currentDialog.kind === "prompt") setPromptValue(currentDialog.initialValue ?? "");
    window.setTimeout(() => confirmButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && currentDialog.kind !== "alert") {
        event.preventDefault();
        currentDialog.resolve(currentDialog.kind === "prompt" ? null : false);
        setDialogs((current) => current.slice(1));
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [currentDialog]);

  const closeDialog = (value: boolean) => {
    if (!currentDialog) return;
    currentDialog.resolve(
      currentDialog.kind === "prompt" ? (value ? promptValue.trim() || null : null) : value,
    );
    setDialogs((current) => current.slice(1));
  };

  return (
    <>
      {children}
      {currentDialog && (
        <div style={styles.backdrop} role="presentation">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`dialog-title-${currentDialog.id}`}
            aria-describedby={`dialog-message-${currentDialog.id}`}
            style={styles.dialog}
          >
            <h2 id={`dialog-title-${currentDialog.id}`} style={styles.dialogTitle}>
              {currentDialog.title}
            </h2>
            {currentDialog.message && (
              <p id={`dialog-message-${currentDialog.id}`} style={styles.dialogMessage}>
                {currentDialog.message}
              </p>
            )}
            {currentDialog.kind === "prompt" && (
              <label style={styles.promptLabel}>
                {currentDialog.inputLabel}
                <input
                  value={promptValue}
                  onChange={(event) => setPromptValue(event.target.value)}
                  placeholder={currentDialog.placeholder}
                  style={styles.promptInput}
                  autoFocus
                />
              </label>
            )}
            <div style={styles.dialogActions}>
              {currentDialog.kind !== "alert" && (
                <button
                  type="button"
                  onClick={() => closeDialog(false)}
                  style={styles.secondaryButton}
                >
                  {currentDialog.cancelLabel}
                </button>
              )}
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={() => closeDialog(true)}
                style={{
                  ...styles.primaryButton,
                  ...(currentDialog.danger ? styles.dangerButton : null),
                }}
              >
                {currentDialog.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
      {snackbar && (
        <div
          role="status"
          aria-live="polite"
          style={{
            ...styles.snackbar,
            ...(snackbar.tone === "warning" ? styles.warningSnackbar : null),
            ...(snackbar.tone === "info" ? styles.infoSnackbar : null),
          }}
        >
          {snackbar.message}
        </div>
      )}
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "rgba(15, 23, 42, 0.48)",
    display: "grid",
    placeItems: "center",
    padding: 20,
  },
  dialog: {
    width: "min(100%, 440px)",
    background: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.25)",
  },
  dialogTitle: { margin: 0, fontSize: 20, color: COLORS.text },
  dialogMessage: {
    margin: "12px 0 0",
    color: COLORS.textMuted,
    whiteSpace: "pre-line",
    lineHeight: 1.7,
  },
  promptLabel: { display: "grid", gap: 6, marginTop: 14, fontWeight: 700 },
  promptInput: { minHeight: 44, padding: 10, borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 16 },
  dialogActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 22,
    flexWrap: "wrap",
  },
  primaryButton: {
    minHeight: 44,
    padding: "10px 18px",
    border: "none",
    borderRadius: 10,
    background: COLORS.primaryDark,
    color: "white",
    fontWeight: 700,
  },
  secondaryButton: {
    minHeight: 44,
    padding: "10px 18px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    background: COLORS.surface,
    color: COLORS.text,
    fontWeight: 700,
  },
  dangerButton: { background: COLORS.danger },
  snackbar: {
    position: "fixed",
    left: "50%",
    bottom: "calc(76px + env(safe-area-inset-bottom))",
    transform: "translateX(-50%)",
    zIndex: 1100,
    maxWidth: "calc(100% - 32px)",
    padding: "12px 18px",
    borderRadius: 12,
    background: COLORS.dark,
    color: "white",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.25)",
    textAlign: "center",
  },
  warningSnackbar: { background: COLORS.warning },
  infoSnackbar: { background: COLORS.primaryDark },
};

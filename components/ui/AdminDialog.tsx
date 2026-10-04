"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { AlertCircle, CheckCircle2, HelpCircle, X, AlertTriangle } from "lucide-react";

export type DialogType = "alert" | "confirm" | "prompt" | "warning";

export interface DialogOptions {
  title?: string;
  message: string;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  defaultValue?: string;
  inputPlaceholder?: string;
}

interface DialogContextType {
  openDialog: (options: DialogOptions) => Promise<boolean | string | null>;
  alertDialog: (message: string, title?: string) => Promise<boolean>;
  confirmDialog: (message: string, title?: string, isDangerous?: boolean) => Promise<boolean>;
  promptDialog: (message: string, defaultValue?: string, title?: string) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function AdminDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<DialogOptions>({ message: "" });
  const [inputValue, setInputValue] = useState("");
  const [resolver, setResolver] = useState<((val: any) => void) | null>(null);

  const openDialog = useCallback((opts: DialogOptions): Promise<any> => {
    return new Promise((resolve) => {
      setOptions(opts);
      setInputValue(opts.defaultValue || "");
      setResolver(() => resolve);
      setIsOpen(true);
    });
  }, []);

  const alertDialog = useCallback((message: string, title = "Notification"): Promise<boolean> => {
    return openDialog({
      title,
      message,
      type: "alert",
      confirmText: "OK",
    }).then((res) => !!res);
  }, [openDialog]);

  const confirmDialog = useCallback((message: string, title = "Confirmation", isDangerous = false): Promise<boolean> => {
    return openDialog({
      title,
      message,
      type: isDangerous ? "warning" : "confirm",
      confirmText: isDangerous ? "Proceed" : "Confirm",
      cancelText: "Cancel",
      isDangerous,
    }).then((res) => !!res);
  }, [openDialog]);

  const promptDialog = useCallback((message: string, defaultValue = "", title = "Input Required"): Promise<string | null> => {
    return openDialog({
      title,
      message,
      type: "prompt",
      defaultValue,
      confirmText: "Submit",
      cancelText: "Cancel",
    });
  }, [openDialog]);

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolver) {
      if (options.type === "prompt") {
        resolver(inputValue);
      } else {
        resolver(true);
      }
    }
  };

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    if (resolver) {
      if (options.type === "prompt") {
        resolver(null);
      } else {
        resolver(false);
      }
    }
  }, [resolver, options.type]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleCancel]);

  const getIcon = () => {
    switch (options.type) {
      case "warning":
        return <AlertTriangle size={24} color="#ef4444" />;
      case "confirm":
        return <HelpCircle size={24} color="#3b82f6" />;
      case "prompt":
        return <HelpCircle size={24} color="#3b82f6" />;
      default:
        return <CheckCircle2 size={24} color="#10b981" />;
    }
  };

  return (
    <DialogContext.Provider value={{ openDialog, alertDialog, confirmDialog, promptDialog }}>
      {children}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            animation: "fadeIn 0.15s ease-out",
          }}
          onClick={handleCancel}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "460px",
              background: "var(--card-bg, #ffffff)",
              color: "var(--foreground, #000000)",
              border: "1px solid var(--card-border, #e6e5e1)",
              borderRadius: "16px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
              overflow: "hidden",
              animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") handleCancel();
              if (e.key === "Enter" && options.type !== "prompt") handleConfirm();
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: "1px solid var(--card-border, #e6e5e1)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {getIcon()}
                </div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--foreground, #000000)" }}>
                  {options.title || "Notice"}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted, #7a7975)",
                  padding: "4px",
                  display: "flex",
                  borderRadius: "6px",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "20px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  lineHeight: 1.5,
                  color: "var(--foreground, #000000)",
                  whiteSpace: "pre-line",
                }}
              >
                {options.message}
              </p>

              {options.type === "prompt" && (
                <div style={{ marginTop: "16px" }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder={options.inputPlaceholder || "Type here..."}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleConfirm();
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid var(--input-border, #e6e5e1)",
                      background: "var(--input-bg, #ffffff)",
                      color: "var(--foreground, #000000)",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                padding: "14px 20px",
                background: "var(--sidebar-bg, #f4f4f2)",
                borderTop: "1px solid var(--card-border, #e6e5e1)",
              }}
            >
              {(options.type === "confirm" || options.type === "warning" || options.type === "prompt") && (
                <button
                  type="button"
                  onClick={handleCancel}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    background: "var(--card-bg, #ffffff)",
                    border: "1px solid var(--card-border, #e6e5e1)",
                    color: "var(--foreground, #000000)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {options.cancelText || "Cancel"}
                </button>
              )}

              <button
                type="button"
                autoFocus={options.type !== "prompt"}
                onClick={handleConfirm}
                style={{
                  padding: "8px 18px",
                  borderRadius: "8px",
                  background: options.isDangerous
                    ? "#ef4444"
                    : "linear-gradient(135deg, #10b981, #059669)",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: options.isDangerous
                    ? "0 2px 8px rgba(239, 68, 68, 0.3)"
                    : "0 2px 8px rgba(16, 185, 129, 0.3)",
                }}
              >
                {options.confirmText || "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useAdminDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useAdminDialog must be used within an AdminDialogProvider");
  }
  return context;
}

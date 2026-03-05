"use client";

import { useState, useRef, useEffect } from "react";
import type { UiColors } from "@/lib/uiColors";
import type { WorkerState } from "@/lib/protocol";
import { EXAMPLE_GROUPS, STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";
import { getSavedScripts, saveScript, deleteScript } from "@/lib/storage";

interface ToolbarProps {
  code: string;
  setCode: (v: string) => void;
  currentFileName: string;
  setCurrentFileName: (v: string) => void;
  ready: boolean;
  isBusy: boolean;
  isPaused: boolean;
  status: WorkerState;
  ui: UiColors;
  onRun: () => void;
  onStep: () => void;
  onContinue: () => void;
  onStop: () => void;
  onReset: () => void;
  onPaletteOpen: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  speed: number;
  onSpeedChange: (factor: number) => void;
}

export default function Toolbar({
  code,
  setCode,
  currentFileName,
  setCurrentFileName,
  ready,
  isBusy,
  isPaused,
  status,
  ui,
  onRun,
  onStep,
  onContinue,
  onStop,
  onReset,
  onPaletteOpen,
  fileInputRef,
  speed,
  onSpeedChange,
}: ToolbarProps) {
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /* ---- Listen for palette-triggered save ---- */
  useEffect(() => {
    const handler = () => {
      setShowFileMenu(true);
      setSaveDialogOpen(true);
    };
    window.addEventListener("lua-playground:open-save", handler);
    return () => window.removeEventListener("lua-playground:open-save", handler);
  }, []);

  /* ---- Refresh saved list when menu opens ---- */
  useEffect(() => {
    if (showFileMenu) {
      setSavedNames(Object.keys(getSavedScripts()));
    }
  }, [showFileMenu]);

  /* ---- Outside click to close menu ---- */
  useEffect(() => {
    if (!showFileMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowFileMenu(false);
        setSaveDialogOpen(false);
        setOpenGroup(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFileMenu]);

  const handleSave = () => {
    const trimmed = saveName.trim();
    if (!trimmed) return;
    saveScript(trimmed, code);
    setCurrentFileName(trimmed);
    setSavedNames(Object.keys(getSavedScripts()));
    setSaveDialogOpen(false);
    setSaveName("");
    setShowFileMenu(false);
  };

  const handleLoad = (name: string) => {
    const scripts = getSavedScripts();
    if (scripts[name]) {
      setCode(scripts[name]);
      setCurrentFileName(name);
    }
    setShowFileMenu(false);
  };

  const handleDelete = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    deleteScript(name);
    setSavedNames(Object.keys(getSavedScripts()));
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: "text/x-lua" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = currentFileName || "script";
    a.download = baseName.endsWith(".lua") ? baseName : `${baseName}.lua`;
    a.click();
    URL.revokeObjectURL(url);
    setShowFileMenu(false);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
    setShowFileMenu(false);
  };

  const handleLoadExample = async (file: string) => {
    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setCode(text);
    } catch (err) {
      console.error("Failed to load example:", err);
    }
    setShowFileMenu(false);
    setOpenGroup(null);
  };

  return (
    <header
      className="flex items-center gap-3 px-4 py-2 shrink-0 transition-colors duration-200"
      style={{ backgroundColor: ui.surface, borderBottom: `1px solid ${ui.border}` }}
    >
      <h1 className="text-lg font-bold mr-4 select-none">
        <span
          className="cursor-pointer hover:opacity-75 transition-opacity"
          onClick={onPaletteOpen}
          title="Command Palette (Ctrl+Shift+P)"
        >🌙</span>{" "}Lua Playground
      </h1>

      {/* ---- File menu ---- */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => { setShowFileMenu((v) => !v); setSaveDialogOpen(false); }}
          className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 text-sm font-semibold transition-colors"
        >
          📁 File
        </button>

        {showFileMenu && (
          <div
            className="absolute left-0 top-full mt-1 w-72 rounded shadow-xl z-50 text-sm max-h-[80vh] overflow-y-auto"
            style={{ backgroundColor: ui.surface2, border: `1px solid ${ui.border}`, color: ui.fg }}
          >
            {/* New */}
            <button
              onClick={() => { setCode(""); setCurrentFileName(""); setShowFileMenu(false); }}
              className="w-full text-left px-3 py-2 transition-colors"
              style={{ color: ui.fg }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = ui.surface}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              📝 Neu
            </button>

            {/* Save */}
            {!saveDialogOpen ? (
              <button
                onClick={() => setSaveDialogOpen(true)}
                className="w-full text-left px-3 py-2 transition-colors"
                style={{ color: ui.fg }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = ui.surface}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                💾 Speichern…
              </button>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); handleSave(); }}
                className="flex items-center gap-2 px-3 py-2 border-b"
                style={{ borderColor: ui.border }}
              >
                <input
                  autoFocus
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Name eingeben…"
                  className="flex-1 rounded px-2 py-1 text-sm outline-none"
                  style={{ backgroundColor: ui.bg, color: ui.fg }}
                />
                <button
                  type="submit"
                  disabled={!saveName.trim()}
                  className="px-2 py-1 rounded bg-green-700 hover:bg-green-600 disabled:opacity-40 text-xs font-semibold"
                >
                  OK
                </button>
              </form>
            )}

            {/* Download */}
            <button
              onClick={handleDownload}
              className="w-full text-left px-3 py-2 transition-colors"
              style={{ color: ui.fg }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = ui.surface}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              ⬇ Download .lua
            </button>

            {/* Upload */}
            <button
              onClick={handleUploadClick}
              className="w-full text-left px-3 py-2 transition-colors border-b"
              style={{ color: ui.fg, borderColor: ui.border }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = ui.surface}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              ⬆ Datei öffnen…
            </button>

            {/* Saved scripts */}
            {savedNames.length > 0 && (
              <>
                <div
                  className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: ui.muted }}
                >
                  Gespeicherte Skripte
                </div>
                {savedNames.map((name) => (
                  <div
                    key={name}
                    onClick={() => handleLoad(name)}
                    className="flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors"
                    style={{ color: ui.fg }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = ui.surface}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <span className="truncate">{name}</span>
                    <button
                      onClick={(e) => handleDelete(name, e)}
                      className="ml-2 text-red-400 hover:text-red-300 text-xs shrink-0"
                      title="Löschen"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </>
            )}

            {/* Examples */}
            {EXAMPLE_GROUPS.length > 0 && (
              <>
                <div
                  className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide border-t"
                  style={{ color: ui.muted, borderColor: ui.border }}
                >
                  Beispiele
                </div>
                {EXAMPLE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <button
                      className="w-full text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wide flex items-center justify-between transition-colors"
                      style={{ color: ui.muted }}
                      onClick={() => setOpenGroup(openGroup === group.label ? null : group.label)}
                      onMouseEnter={(e) => {
                        if (openGroup !== group.label) setOpenGroup(group.label);
                      }}
                    >
                      <span>{group.label}</span>
                      <span
                        className="text-[10px] transition-transform duration-150"
                        style={{ transform: openGroup === group.label ? "rotate(90deg)" : "rotate(0deg)" }}
                      >
                        ▶
                      </span>
                    </button>
                    {openGroup === group.label && (
                      <div>
                        {group.items.map((ex) => (
                          <button
                            key={ex.file}
                            onClick={() => handleLoadExample(ex.file)}
                            className="w-full text-left px-3 py-1.5 pl-6 transition-colors"
                            style={{ color: ui.fg }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = ui.surface}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                          >
                            📄 {ex.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".lua,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              setCode(reader.result);
              setCurrentFileName(file.name.replace(/\.lua$/, ""));
            }
          };
          reader.readAsText(file);
          e.target.value = "";
        }}
      />

      <button
        onClick={onRun}
        disabled={!ready || isBusy}
        className="px-3 py-1 rounded bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
        title="Run (Ctrl+Enter)"
      >
        ▶ Run
      </button>
      <button
        onClick={onStep}
        disabled={!ready || (isBusy && !isPaused)}
        className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
        title="Step (F10)"
      >
        ⏭ Step
      </button>
      {isPaused && (
        <button
          onClick={onContinue}
          className="px-3 py-1 rounded bg-green-700 hover:bg-green-600 text-sm font-semibold transition-colors"
          title="Continue (F5)"
        >
          ▶▶ Continue
        </button>
      )}
      <button
        onClick={onStop}
        disabled={!isBusy}
        className="px-3 py-1 rounded bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
      >
        ⏹ Stop
      </button>
      <button
        onClick={onReset}
        disabled={!ready}
        className="px-3 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
        style={{ backgroundColor: ui.btnNeutral, color: ui.btnNeutralText }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = ui.btnNeutralHover}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ui.btnNeutral}
      >
        ↻ Reset
      </button>

      {/* Speed slider */}
      <div className="flex items-center gap-1.5 ml-2" title={`Geschwindigkeit: ${speed}×`}>
        <span className="text-xs" style={{ color: ui.muted }}>🐢</span>
        <input
          type="range"
          min={-2}
          max={2}
          step={1}
          value={Math.round(Math.log2(speed))}
          onChange={(e) => onSpeedChange(Math.pow(2, Number(e.target.value)))}
          className="w-16 h-1 accent-blue-500 cursor-pointer"
        />
        <span className="text-xs" style={{ color: ui.muted }}>🐇</span>
        <span className="text-xs tabular-nums w-6 text-center" style={{ color: ui.muted }}>{speed}×</span>
      </div>

      <span
        className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${status !== "idle" ? STATUS_COLORS[status] : ""}`}
        style={{
          color: ui.btnNeutralText,
          ...(status === "idle" ? { backgroundColor: ui.btnNeutral } : {}),
        }}
      >
        {STATUS_LABELS[status]}
      </span>
    </header>
  );
}

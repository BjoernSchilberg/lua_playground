import dynamic from "next/dynamic";
import type { UiColors } from "@/lib/uiColors";
import type { Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#1e1e1e] text-neutral-500">
      Loading editor…
    </div>
  ),
});

interface EditorPanelProps {
  code: string;
  setCode: (v: string) => void;
  editorTheme: string;
  vimEnabled: boolean;
  ui: UiColors;
  onMount: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  vimStatusRef: React.RefObject<HTMLDivElement | null>;
}

export default function EditorPanel({
  code,
  setCode,
  editorTheme,
  vimEnabled,
  ui,
  onMount,
  vimStatusRef,
}: EditorPanelProps) {
  return (
    <>
      <div className="flex-1 min-h-0">
        <MonacoEditor
          language="lua"
          theme={editorTheme}
          defaultValue={code}
          onChange={(v) => setCode(v ?? "")}
          onMount={onMount}
          options={{
            fontSize: 20,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
            tabSize: 2,
            cursorStyle: "block",
            mouseWheelZoom: true,
            glyphMargin: true,
          }}
        />
      </div>
      {vimEnabled && (
        <div
          ref={vimStatusRef}
          className="px-3 py-0.5 text-xs font-mono select-none shrink-0"
          style={{
            backgroundColor: ui.surface,
            color: ui.fg,
            borderTop: `1px solid ${ui.border}`,
          }}
        />
      )}
    </>
  );
}

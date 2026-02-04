import { ChatPanel } from "@/components/ChatPanel";
import { DocumentList } from "@/components/DocumentList";
import { OperationsReport } from "@/components/OperationsReport";
import { PDFAssistantRuntimeProvider } from "@/components/AssistantRuntimeProvider";
import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Key, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [resetKey, setResetKey] = useState(0); // Used to force re-render and reset state
  const [activeTab, setActiveTab] = useState<"logs" | "viewer">("logs");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const clearAllMutation = trpc.pdfAgent.clearAll.useMutation({
    onSuccess: () => {
      toast.success("Session cleared - ready to start fresh");
      utils.pdfAgent.listDocuments.invalidate();
      utils.pdfAgent.getLogs.invalidate();
      setSelectedDocId(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to clear: ${error.message}`);
    }
  });

  const handleReset = useCallback(() => {
    clearAllMutation.mutate();
    setResetKey(prev => prev + 1); // Force re-render to reset chat state
    setActiveTab("logs");
  }, [clearAllMutation]);

  const handleDocumentClick = useCallback((docId: string) => {
    setSelectedDocId(docId);
    setActiveTab("viewer");
  }, []);

  const isDisabled = !apiKey.trim();

  return (
    <PDFAssistantRuntimeProvider key={resetKey} provider="claude" apiKey={apiKey}>
      <div className="h-screen flex flex-col bg-background">
        {/* Compact Header with API Key */}
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-shrink-0">
                <h1 className="text-lg font-semibold">PDF Editor Agent Demo</h1>
                <p className="text-xs text-muted-foreground">
                  Powered by Claude Opus 4.5
                </p>
              </div>
              
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <Key className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <Input
                  type="password"
                  placeholder="Enter Anthropic API Key to enable..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="h-8 gap-1.5"
                disabled={clearAllMutation.isPending}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content - Three Panel Layout */}
        <main className="flex-1 container mx-auto px-4 pt-3 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 h-full">
            {/* Left Panel - Chat */}
            <div className="lg:col-span-1 h-full min-h-[500px]">
              <ChatPanel disabled={isDisabled} />
            </div>

            {/* Middle Panel - Documents (Split: Original + Revised) */}
            <div className="lg:col-span-1 h-full min-h-[500px]">
              <DocumentList 
                disabled={isDisabled} 
                onDocumentClick={handleDocumentClick}
              />
            </div>

            {/* Right Panel - Operations Report (Tabbed: Logs + PDF Viewer) */}
            <div className="lg:col-span-1 h-full min-h-[500px]">
              <OperationsReport 
                activeTab={activeTab}
                onTabChange={setActiveTab}
                selectedDocId={selectedDocId}
                onSelectedDocChange={setSelectedDocId}
              />
            </div>
          </div>
        </main>

        {/* Disclaimer Footer */}
        <footer className="border-t bg-blue-50 dark:bg-blue-950/30">
          <div className="container mx-auto px-4 py-2">
            <p className="text-xs text-blue-800 dark:text-blue-200 text-center font-medium">
              <span className="font-bold">DEMO ONLY</span> — This software is provided "as-is" without warranty of any kind, express or implied.
              Use at your own risk. <span className="font-semibold">Do not upload sensitive, confidential, or personally identifiable information. </span>
              No guarantees are made regarding accuracy, reliability, or fitness for any purpose.
            </p>
          </div>
        </footer>
      </div>
    </PDFAssistantRuntimeProvider>
  );
}

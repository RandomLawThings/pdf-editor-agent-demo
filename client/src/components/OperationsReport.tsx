import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollText, Eye, FileText, CheckCircle2, XCircle, Wrench, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { PDFViewer } from "./PDFViewer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { useOperationLogs } from "./AssistantRuntimeProvider";
import { useEffect, useRef, useState, useMemo } from "react";
import { cn } from "@/lib/utils";

interface LogEntry {
  id?: string;
  timestamp: Date | string;
  type: string;
  tool?: string;
  input?: any;
  output?: any;
  message?: string;
  error?: string;
}

interface CombinedLogEntry {
  id: string;
  timestamp: Date | string;
  tool?: string;
  type: 'pending' | 'success' | 'error' | 'message' | 'thinking';
  input?: any;
  output?: any;
  message?: string;
  error?: string;
}

// Counter for generating unique IDs
let logIdCounter = 0;
const generateUniqueId = (prefix: string) => `${prefix}-${Date.now()}-${++logIdCounter}-${Math.random().toString(36).substr(2, 6)}`;

function CollapsibleLogEntry({ log }: { log: CombinedLogEntry }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const getLogIcon = (type: string) => {
    switch (type) {
      case 'pending':
        return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />;
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />;
      case 'error':
        return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
      case 'thinking':
        return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />;
      case 'message':
        return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />;
      default:
        return <Wrench className="w-3.5 h-3.5 text-gray-500 shrink-0" />;
    }
  };

  const getLogBadge = (type: string) => {
    switch (type) {
      case 'pending':
        return <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-blue-500 border-blue-500">Running</Badge>;
      case 'success':
        return <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-green-500">Done</Badge>;
      case 'error':
        return <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">Error</Badge>;
      case 'thinking':
        return <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-blue-500 border-blue-500 animate-pulse">Processing</Badge>;
      case 'message':
        return <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-green-500">Done</Badge>;
      default:
        return null;
    }
  };

  // Get a one-line summary
  const getSummary = () => {
    if (log.tool) {
      return log.tool;
    }
    if (log.type === 'thinking') {
      return 'Processing request...';
    }
    if (log.type === 'message') {
      return 'Response generated';
    }
    return log.type;
  };

  // Check if there's expandable content
  const hasDetails = log.input || log.output || log.error;

  // Format the full content for expanded view
  const getExpandedContent = () => {
    const parts: { label: string; content: string }[] = [];
    
    if (log.input) {
      parts.push({
        label: 'Input',
        content: typeof log.input === 'string' ? log.input : JSON.stringify(log.input, null, 2)
      });
    }
    
    if (log.output) {
      parts.push({
        label: 'Output',
        content: typeof log.output === 'string' ? log.output : JSON.stringify(log.output, null, 2)
      });
    }
    
    if (log.error) {
      parts.push({
        label: 'Error',
        content: log.error
      });
    }
    
    return parts;
  };

  const formatTime = (timestamp: Date | string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div 
      className={cn(
        "border-b last:border-b-0 transition-colors",
        hasDetails && "cursor-pointer hover:bg-accent/30",
        isExpanded && "bg-accent/20"
      )}
      onClick={() => hasDetails && setIsExpanded(!isExpanded)}
    >
      {/* One-line summary row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {hasDetails ? (
          isExpanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
          )
        ) : (
          <div className="w-3" />
        )}
        
        {getLogIcon(log.type)}
        
        <span className="text-sm font-medium truncate flex-1">
          {getSummary()}
        </span>
        
        {getLogBadge(log.type)}
        
        <span className="text-[10px] text-muted-foreground shrink-0">
          {formatTime(log.timestamp)}
        </span>
      </div>
      
      {/* Expanded details */}
      {isExpanded && hasDetails && (
        <div className="px-3 pb-3 pt-1 ml-8 space-y-2">
          {getExpandedContent().map((part, i) => (
            <div key={i}>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                {part.label}:
              </span>
              <pre className={cn(
                "text-xs mt-1 p-2 rounded bg-muted/50 overflow-x-auto whitespace-pre-wrap break-all",
                part.label === 'Error' && "text-red-500 bg-red-50 dark:bg-red-950/20"
              )}>
                {part.content}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ViewerTabProps {
  selectedDocId: string | null;
  onSelectedDocChange: (id: string | null) => void;
}

function ViewerTab({ selectedDocId, onSelectedDocChange }: ViewerTabProps) {
  
  const { data: documents } = trpc.pdfAgent.listDocuments.useQuery(undefined, {
    refetchInterval: 2000
  });

  // Combine all documents for selection
  const allDocs = useMemo(() => {
    const original = (documents?.original || []).map(d => ({ ...d, section: 'Original' }));
    const revised = (documents?.revised || []).map(d => ({ ...d, section: 'Revised' }));
    return [...original, ...revised];
  }, [documents]);

  // Get selected document
  const selectedDoc = useMemo(() => {
    if (!selectedDocId) return null;
    return allDocs.find(d => d.id === selectedDocId) || null;
  }, [selectedDocId, allDocs]);

  // Auto-select first document if none selected
  useEffect(() => {
    if (!selectedDocId && allDocs.length > 0) {
      onSelectedDocChange(allDocs[0].id);
    }
  }, [allDocs, selectedDocId, onSelectedDocChange]);

  return (
    <div className="h-full flex flex-col">
      {/* Document selector */}
      <div className="px-2 py-1.5 border-b">
        <Select value={selectedDocId || ''} onValueChange={onSelectedDocChange}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Select a document..." />
          </SelectTrigger>
          <SelectContent>
            {allDocs.length === 0 ? (
              <SelectItem value="none" disabled>No documents uploaded</SelectItem>
            ) : (
              allDocs.map(doc => (
                <SelectItem key={doc.id} value={doc.id} className="text-xs">
                  <span className="text-muted-foreground mr-1">[{doc.section}]</span>
                  {doc.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
      
      {/* PDF Viewer */}
      <div className="flex-1 overflow-hidden">
        <PDFViewer 
          url={selectedDoc?.url || null} 
          filename={selectedDoc?.name}
        />
      </div>
    </div>
  );
}

interface OperationsReportProps {
  activeTab?: "logs" | "viewer";
  onTabChange?: (tab: "logs" | "viewer") => void;
  selectedDocId?: string | null;
  onSelectedDocChange?: (id: string | null) => void;
}

export function OperationsReport({ 
  activeTab = "logs", 
  onTabChange,
  selectedDocId = null,
  onSelectedDocChange
}: OperationsReportProps) {
  // Get real-time logs from context (streamed during operations)
  const { logs: localLogs } = useOperationLogs();
  
  // Also fetch persisted logs from server
  const { data: serverLogs = [], isLoading } = trpc.pdfAgent.getLogs.useQuery({}, {
    refetchInterval: 5000 // Refresh every 5 seconds for persisted logs
  });

  // Combine tool_use and tool_result into single entries
  const combinedLogs = useMemo(() => {
    const combined: CombinedLogEntry[] = [];
    
    // Process local logs first (these are from the current session)
    // We need to match tool_use with tool_result by tool name and timing
    const pendingTools = new Map<string, { entry: LogEntry; index: number }>();
    
    for (const log of localLogs) {
      if (log.type === 'thinking') {
        combined.push({
          id: log.id || generateUniqueId('thinking'),
          timestamp: log.timestamp,
          type: 'thinking',
          message: log.message,
        });
      } else if (log.type === 'message') {
        combined.push({
          id: log.id || generateUniqueId('message'),
          timestamp: log.timestamp,
          type: 'message',
          message: log.message,
        });
      } else if (log.type === 'tool_use' && log.tool) {
        // Store this as a pending tool call
        const entryId = log.id || generateUniqueId(`tool-${log.tool}`);
        pendingTools.set(log.tool, { entry: { ...log, id: entryId }, index: combined.length });
        combined.push({
          id: entryId,
          timestamp: log.timestamp,
          tool: log.tool,
          type: 'pending',
          input: log.input,
        });
      } else if (log.type === 'tool_result' && log.tool) {
        // Find the matching pending tool and update it
        const pending = pendingTools.get(log.tool);
        if (pending) {
          // Update the existing entry instead of adding a new one
          combined[pending.index] = {
            id: pending.entry.id || generateUniqueId(`tool-${log.tool}`),
            timestamp: pending.entry.timestamp,
            tool: log.tool,
            type: 'success',
            input: pending.entry.input,
            output: log.output,
          };
          pendingTools.delete(log.tool);
        } else {
          // No matching tool_use found, add as standalone
          combined.push({
            id: log.id || generateUniqueId(`result-${log.tool}`),
            timestamp: log.timestamp,
            tool: log.tool,
            type: 'success',
            output: log.output,
          });
        }
      } else if (log.type === 'error') {
        if (log.tool) {
          const pending = pendingTools.get(log.tool);
          if (pending) {
            combined[pending.index] = {
              id: pending.entry.id || generateUniqueId(`tool-${log.tool}`),
              timestamp: pending.entry.timestamp,
              tool: log.tool,
              type: 'error',
              input: pending.entry.input,
              error: log.error,
            };
            pendingTools.delete(log.tool);
          } else {
            combined.push({
              id: log.id || generateUniqueId('error'),
              timestamp: log.timestamp,
              tool: log.tool,
              type: 'error',
              error: log.error,
            });
          }
        } else {
          combined.push({
            id: log.id || generateUniqueId('error'),
            timestamp: log.timestamp,
            type: 'error',
            error: log.error,
          });
        }
      }
    }
    
    // Remove "thinking" entries if there's a "message" entry after them
    const hasMessageCompletion = combined.some(log => log.type === 'message');
    const filteredCombined = combined.filter(log => {
      if (log.type === 'thinking' && hasMessageCompletion) {
        const thinkingTime = new Date(log.timestamp).getTime();
        const laterMessage = combined.find(
          m => m.type === 'message' && new Date(m.timestamp).getTime() > thinkingTime
        );
        return !laterMessage;
      }
      return true;
    });
    
    // Track which server logs we've already added (by tool + timestamp)
    const addedServerLogs = new Set<string>();
    
    // First pass: collect tool_use logs to get inputs
    const serverToolInputs = new Map<string, any>();
    for (const log of serverLogs) {
      if (log.type === 'tool_use' && log.tool && log.input) {
        // Key by tool name and approximate timestamp (within 10 seconds)
        const timeKey = Math.floor(new Date(log.timestamp).getTime() / 10000);
        serverToolInputs.set(`${log.tool}-${timeKey}`, log.input);
      }
    }
    
    // Process server logs (for historical data)
    for (const log of serverLogs) {
      // Create a unique key for this server log
      const serverLogKey = `${log.tool}-${new Date(log.timestamp).getTime()}`;
      
      // Skip if we already processed this server log
      if (addedServerLogs.has(serverLogKey)) {
        continue;
      }
      
      // Skip if we already have this log from local
      const isDuplicate = filteredCombined.some(
        c => c.tool === log.tool && 
             Math.abs(new Date(c.timestamp).getTime() - new Date(log.timestamp).getTime()) < 1000
      );
      
      if (!isDuplicate && (log.type === 'tool_result' || log.type === 'error')) {
        addedServerLogs.add(serverLogKey);
        
        // Try to find matching input from tool_use log
        const timeKey = Math.floor(new Date(log.timestamp).getTime() / 10000);
        const matchedInput = serverToolInputs.get(`${log.tool}-${timeKey}`) || log.input;
        
        filteredCombined.push({
          id: generateUniqueId(`server-${log.tool || 'unknown'}`),
          timestamp: log.timestamp,
          tool: log.tool,
          type: log.type === 'error' ? 'error' : 'success',
          input: matchedInput,
          output: log.output,
          error: log.error,
        });
      }
    }
    
    // Sort by timestamp descending (newest first)
    return filteredCombined.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [localLogs, serverLogs]);

  // Auto-scroll ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [combinedLogs.length]);

  return (
    <Card className="h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={(v) => onTabChange?.(v as "logs" | "viewer")} className="h-full flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-10 px-2">
          <TabsTrigger value="logs" className="text-sm data-[state=active]:bg-transparent">
            <ScrollText className="w-4 h-4 mr-1.5" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="viewer" className="text-sm data-[state=active]:bg-transparent">
            <Eye className="w-4 h-4 mr-1.5" />
            Viewer
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="flex-1 m-0 overflow-hidden">
          <div 
            ref={scrollContainerRef}
            className="h-full overflow-y-auto"
          >
            {isLoading && combinedLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">Loading logs...</p>
              </div>
            ) : combinedLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <ScrollText className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No operations yet
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {combinedLogs.map((log) => (
                  <CollapsibleLogEntry 
                    key={log.id}
                    log={log}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="viewer" className="flex-1 m-0 overflow-hidden">
          <ViewerTab 
            selectedDocId={selectedDocId} 
            onSelectedDocChange={onSelectedDocChange || (() => {})} 
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Trash2, Loader2, FolderOpen, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

// Bundled demo affidavits
const DEMO_AFFIDAVITS = [
  {
    id: "affidavit-hay",
    name: "Affidavit of Michele Hay (Myra Falls 2024)",
    filename: "Affidavit_Michele_Hay_Myra_Falls_2024.pdf",
    path: "/affidavits/Affidavit_Michele_Hay_Myra_Falls_2024.pdf"
  },
  {
    id: "affidavit-peakhill",
    name: "Petition Peakhill with Affidavit (2023)",
    filename: "Petition_Peakhill_with_Affidavit_2023.pdf",
    path: "/affidavits/Petition_Peakhill_with_Affidavit_2023.pdf"
  },
  {
    id: "affidavit-fraser",
    name: "Affidavit of Linda Fraser (Richardson Hakim 2025)",
    filename: "Affidavit_Linda_Fraser_Richardson_Hakim_2025.pdf",
    path: "/affidavits/Affidavit_Linda_Fraser_Richardson_Hakim_2025.pdf"
  }
];

interface Document {
  id: string;
  name: string;
  url: string;
  type: 'original' | 'revised';
  uploadedAt: Date;
  operation?: string;
  pages?: string;
}

interface DocumentListProps {
  disabled?: boolean;
  onDocumentClick?: (docId: string) => void;
}

export function DocumentList({ disabled = false, onDocumentClick }: DocumentListProps) {
  const [adding, setAdding] = useState(false);
  const utils = trpc.useUtils();

  const { data: documents, isLoading } = trpc.pdfAgent.listDocuments.useQuery(undefined, {
    refetchInterval: 2000 // Refresh every 2 seconds to show new results
  });

  const uploadMutation = trpc.pdfAgent.upload.useMutation({
    onSuccess: () => {
      utils.pdfAgent.listDocuments.invalidate();
    },
    onError: (error: any) => {
      toast.error(`Failed to add: ${error.message}`);
    }
  });

  const deleteMutation = trpc.pdfAgent.deleteDocument.useMutation({
    onSuccess: () => {
      toast.success("Document removed");
      utils.pdfAgent.listDocuments.invalidate();
    },
    onError: (error: any) => {
      toast.error(`Delete failed: ${error.message}`);
    }
  });

  // Check if a document with this filename already exists in originals
  const isAlreadyAdded = (filename: string) => {
    return (documents?.original || []).some(doc => doc.name === filename);
  };

  const handleAddAffidavit = async (affidavit: typeof DEMO_AFFIDAVITS[0]) => {
    // Skip if already present
    if (isAlreadyAdded(affidavit.filename)) {
      toast.info("Document already added");
      return;
    }

    setAdding(true);

    try {
      // Fetch the PDF from public folder
      const response = await fetch(affidavit.path);
      const blob = await response.blob();

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const base64Data = base64.split(',')[1];

        uploadMutation.mutate({
          filename: affidavit.filename,
          fileData: base64Data,
          type: 'original'
        });
      };
      reader.readAsDataURL(blob);

      toast.success(`Added: ${affidavit.name}`);
    } catch (error) {
      toast.error(`Failed to load affidavit`);
    } finally {
      setAdding(false);
    }
  };

  const renderDocumentItem = (doc: Document) => (
    <div 
      key={doc.id} 
      className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent/50 group cursor-pointer"
      onClick={() => onDocumentClick?.(doc.id)}
    >
      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{doc.name}</p>
        {(doc.operation || doc.pages) && (
          <p className="text-[11px] text-muted-foreground truncate">
            {doc.operation && `${doc.operation}`}
            {doc.operation && doc.pages && ' · '}
            {doc.pages && `Pages: ${doc.pages}`}
          </p>
        )}
      </div>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            doc.url && window.open(doc.url, '_blank');
          }}
          disabled={!doc.url}
        >
          <Download className="w-3 h-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            deleteMutation.mutate({ documentId: doc.id });
          }}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );

  return (
    <Card className="h-full flex flex-col">
      {/* Header - h-10 to match other panels */}
      <div className="flex items-center justify-between px-3 border-b h-10">
        <div className="flex items-center gap-1.5">
          <FolderOpen className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Documents</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs"
              disabled={adding || disabled}
            >
              {adding ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <Plus className="w-3 h-3 mr-1" />
                  Select
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Demo Affidavits</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {DEMO_AFFIDAVITS.map((affidavit) => (
              <DropdownMenuItem
                key={affidavit.id}
                onClick={() => handleAddAffidavit(affidavit)}
                className="cursor-pointer"
                disabled={isAlreadyAdded(affidavit.filename)}
              >
                <span className="text-xs">{affidavit.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Original Documents */}
          <div className="flex-1 min-h-0">
            <div className="px-3 py-1.5 bg-muted/30">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Original</span>
            </div>
            <ScrollArea className="h-[calc(100%-28px)]">
              <div className="p-1">
                {(documents?.original || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Click "Select" to add demo affidavits</p>
                ) : (
                  (documents?.original || []).map(renderDocumentItem)
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Revised Documents */}
          <div className="flex-1 min-h-0 border-t">
            <div className="px-3 py-1.5 bg-muted/30">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Revised</span>
            </div>
            <ScrollArea className="h-[calc(100%-28px)]">
              <div className="p-1">
                {(documents?.revised || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No revised documents yet</p>
                ) : (
                  (documents?.revised || []).map(renderDocumentItem)
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </Card>
  );
}

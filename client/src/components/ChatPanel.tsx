import { MessageSquare } from "lucide-react";
import { Card } from "./ui/card";
import { Thread } from "./assistant-ui/Thread";

interface ChatPanelProps {
  disabled?: boolean;
}

export function ChatPanel({ disabled = false }: ChatPanelProps) {
  return (
    <Card className="h-full flex flex-col">
      {/* Header - h-10 to match other panels */}
      <div className="flex items-center justify-between px-3 border-b h-10">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Chat</span>
        </div>
      </div>

      {/* Chat content */}
      <div className="flex-1 overflow-hidden relative">
        {disabled && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center px-4">
              Enter your Anthropic API key above to start
            </p>
          </div>
        )}
        <Thread />
      </div>
    </Card>
  );
}

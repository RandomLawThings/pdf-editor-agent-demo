import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  AssistantIf,
} from "@assistant-ui/react";
import { Button } from "../ui/button";
import { ArrowUpIcon, SquareIcon, ArrowDownIcon, Loader2 } from "lucide-react";
import { FC } from "react";

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col bg-background">
      {/* Scrollable message area - takes remaining space */}
      <ThreadPrimitive.Viewport className="relative flex flex-1 flex-col overflow-y-auto scroll-smooth px-4 pb-2">
        <AssistantIf condition={({ thread }) => thread.isEmpty}>
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold">PDF Editor Agent</h2>
              <p className="text-muted-foreground">
                How can I help you with your PDFs today?
              </p>
            </div>
          </div>
        </AssistantIf>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />

        {/* Loading indicator when agent is processing */}
        <AssistantIf condition={({ thread }) => thread.isRunning}>
          <div className="flex items-center gap-2 py-3 px-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Processing your request...</span>
          </div>
        </AssistantIf>
      </ThreadPrimitive.Viewport>

      {/* Fixed composer at bottom - outside the scrollable viewport */}
      <div className="shrink-0 border-t bg-background px-4 py-3">
        <div className="relative">
          <ThreadScrollToBottom />
          <Composer />
        </div>
      </div>
    </ThreadPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <Button
        variant="outline"
        size="icon"
        className="absolute -top-14 right-2 rounded-full disabled:invisible z-10"
      >
        <ArrowDownIcon className="h-4 w-4" />
      </Button>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col">
      {/* Fixed border styling - ring is now inset to prevent overlap */}
      <div className="flex w-full flex-col rounded-lg border border-input bg-background overflow-hidden transition-shadow focus-within:border-primary focus-within:ring-1 focus-within:ring-primary focus-within:ring-inset">
        <ComposerPrimitive.Input
          placeholder="Ask me to edit your PDFs..."
          className="max-h-32 min-h-10 w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          rows={1}
          autoFocus
        />
        <div className="relative mx-2 mb-2 flex items-center justify-end">
          <AssistantIf condition={({ thread }) => !thread.isRunning}>
            <ComposerPrimitive.Send asChild>
              <Button
                type="submit"
                size="icon"
                className="h-8 w-8 rounded-full"
              >
                <ArrowUpIcon className="h-4 w-4" />
              </Button>
            </ComposerPrimitive.Send>
          </AssistantIf>

          <AssistantIf condition={({ thread }) => thread.isRunning}>
            <ComposerPrimitive.Cancel asChild>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-8 w-8 rounded-full"
              >
                <SquareIcon className="h-3 w-3 fill-current" />
              </Button>
            </ComposerPrimitive.Cancel>
          </AssistantIf>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="relative w-full py-3"
      data-role="assistant"
    >
      <div className="px-2 text-foreground leading-relaxed whitespace-pre-wrap">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="w-full py-3"
      data-role="user"
    >
      <div className="flex justify-end">
        <div className="rounded-lg bg-primary text-primary-foreground px-4 py-2 max-w-[80%]">
          <MessagePrimitive.Parts />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};

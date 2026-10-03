import { SidebarInset, SidebarProvider } from "@allegretto-network/ui/components/sidebar";
import { createFileRoute } from "@tanstack/react-router";
import { RocketIcon, SparklesIcon, TelescopeIcon } from "lucide-react";
import { AppSidebar } from "../components/app-sidebar";
import { ChatComposer } from "../components/chat-composer";
import { ChatWelcome } from "../components/chat-welcome";
import { SuggestionsList } from "../components/suggestions-list";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [{ title: "Allegretto Network - Agent Commerce Protocol" }],
  }),
  component: Chat,
});

function Chat() {
  return (
    <SidebarProvider>
      <AppSidebar
        account={{
          name: "Lucky Ivanius",
          email: "lucky@allegretto.network",
        }}
        activeConversationId="c-1"
        conversationGroups={[
          {
            id: "today",
            label: "Today",
            conversations: [{ id: "c-1", title: "Your First Conversation" }],
          },
        ]}
      />

      <SidebarInset className="min-w-0 border-l border-sidebar-border">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <ChatWelcome greeting="Winding Down?">
            <ChatComposer
              defaultModelId="fast"
              models={[
                {
                  id: "fast",
                  label: "Fast",
                  description: "Quick market reads",
                  icon: RocketIcon,
                },
                {
                  id: "balanced",
                  label: "Balanced",
                  description: "Depth with speed",
                  icon: SparklesIcon,
                },
                {
                  id: "deep",
                  label: "Deep Research",
                  description: "Multi-source analysis",
                  icon: TelescopeIcon,
                },
              ]}
              onSubmit={(message, modelId) => {
                // Integration point for the real send mutation.
                console.info("[composer] submit", { message, modelId });
              }}
              placeholder="Anything on your mind"
            />

            <SuggestionsList
              suggestions={[
                {
                  id: "s-1",
                  prompt:
                    "Which altcoins show the sharpest long and short setups with smart-money inflows?",
                },
                {
                  id: "s-2",
                  prompt: "How will rising Treasury yields and jobs data steer $BTC's next move?",
                },
                {
                  id: "s-3",
                  prompt: "What does the $NEAR exploit mean for its price and privacy narrative?",
                },
                {
                  id: "s-4",
                  prompt: "What's behind $MON's price activity and upcoming Monad catalysts?",
                },
                { id: "s-5", prompt: "Why is $ZEC so volatile and how far can its run extend?" },
                { id: "s-6", prompt: "Why is $LIT in free fall ahead of its token unlock?" },
                {
                  id: "s-7",
                  prompt: "What catalysts and buyback mechanics are driving renewed $ENA interest?",
                },
                {
                  id: "s-8",
                  prompt: "Which chains and tokens benefit if tokenized equities gain traction?",
                },
              ]}
            />
          </ChatWelcome>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

import { ScrollArea } from "@allegretto-network/ui/components/scroll-area";
import { Separator } from "@allegretto-network/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@allegretto-network/ui/components/sidebar";
import { TooltipProvider } from "@allegretto-network/ui/components/tooltip";
import { GlobeIcon, PlusIcon } from "lucide-react";
import type { ConversationGroup } from "./conversation-list";
import { ConversationList } from "./conversation-list";
import { ConversationSearch } from "./conversation-search";
import { SidebarLogo } from "./sidebar-logo";
import type { Account } from "./user-menu";
import { UserMenu } from "./user-menu";

export type { ConversationGroup };

type AppSidebarProps = {
  account: Account;
  conversationGroups: ConversationGroup[];
  activeConversationId?: string;
  onNewConversation?: () => void;
  onExplore?: () => void;
};

export function AppSidebar(props: AppSidebarProps) {
  return (
    <TooltipProvider>
      <Sidebar collapsible="icon">
        {/* ── Header: wordmark + collapse trigger ───────── */}
        <SidebarHeader className="h-12 px-2 py-0">
          <div className="flex h-full items-center justify-between pl-1">
            <SidebarLogo />
            {/* Collapsed rail hides this — SidebarLogo becomes the expand affordance. */}
            <SidebarTrigger className="group-data-[state=collapsed]:hidden shrink-0 text-sidebar-foreground" />
          </div>
        </SidebarHeader>

        <SidebarContent className="gap-0 px-2">
          {/* ── Nav actions ───────────────────────────────── */}
          <div className="flex flex-col gap-0.5 py-1">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="h-9 gap-2 font-medium text-sidebar-foreground"
                  onClick={props.onNewConversation}
                  tooltip="New Conversation"
                >
                  <PlusIcon className="size-4 shrink-0" />
                  <span>New Conversation</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="h-9 gap-2 font-medium text-sidebar-foreground"
                  onClick={props.onExplore}
                  tooltip="Explore"
                >
                  <GlobeIcon className="size-4 shrink-0" />
                  <span>Explore</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>

          {/* ── Search — hidden when icon-collapsed ──────── */}
          <div className="group-data-[state=collapsed]:hidden py-1">
            <ConversationSearch placeholder="Search conversations" />
          </div>

          <Separator className="group-data-[state=collapsed]:hidden my-1 bg-sidebar-border" />

          {/* ── History ───────────────────────────────────── */}
          <div className="group-data-[state=collapsed]:hidden flex min-h-0 flex-1 flex-col">
            <ScrollArea className="h-full">
              <ConversationList
                activeConversationId={props.activeConversationId}
                groups={props.conversationGroups}
              />
            </ScrollArea>
          </div>
        </SidebarContent>

        {/* ── Footer: user + account menu ───────────────── */}
        <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
          <UserMenu account={props.account} />
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  );
}

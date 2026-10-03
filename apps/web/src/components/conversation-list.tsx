import { cn } from "cn";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@allegretto-network/ui/components/sidebar";

export type Conversation = {
  id: string;
  title: string;
};

export type ConversationGroup = {
  id: string;
  label: string;
  conversations: Conversation[];
};

type ConversationListProps = {
  groups: ConversationGroup[];
  activeConversationId?: string;
  onSelect?: (conversation: Conversation) => void;
};

export function ConversationList(props: ConversationListProps) {
  return (
    <>
      {props.groups.map((group) => (
        <SidebarGroup className="p-0" key={group.id}>
          <SidebarGroupLabel className="px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group.label}
          </SidebarGroupLabel>
          <SidebarMenu>
            {group.conversations.map((conversation) => (
              <SidebarMenuItem key={conversation.id}>
                <SidebarMenuButton
                  className="h-9 gap-2 px-3 font-medium"
                  isActive={conversation.id === props.activeConversationId}
                  onClick={() => props.onSelect?.(conversation)}
                >
                  {/* Fixed-width indicator slot keeps titles in one vertical lane. */}
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    <span
                      className={cn(
                        "size-2 rounded-full transition-colors duration-150 ease-out",
                        conversation.id === props.activeConversationId
                          ? "bg-primary"
                          : "bg-transparent",
                      )}
                    />
                  </span>
                  <span className="truncate">{conversation.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}

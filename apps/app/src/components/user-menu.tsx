import { ChevronUpIcon, LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@allegretto-network/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@allegretto-network/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@allegretto-network/ui/components/sidebar";

export type Account = {
  name: string;
  email: string;
  avatarUrl?: string;
};

type UserMenuProps = {
  account: Account;
  onOpenProfile?: () => void;
  onOpenSettings?: () => void;
  onSignOut?: () => void;
};

export function UserMenu(props: UserMenuProps) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton className="h-auto gap-2 py-2" size="lg">
                <Avatar size="sm">
                  <AvatarImage alt={props.account.name} src={props.account.avatarUrl} />
                  <AvatarFallback className="bg-linear-160 from-chart-2 to-chart-5 text-primary-foreground">
                    {initials(props.account.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {props.account.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {props.account.email}
                  </span>
                </span>
                <ChevronUpIcon className="shrink-0 text-muted-foreground" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            align="start"
            className="w-(--anchor-width) min-w-56"
            side="top"
            sideOffset={8}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={props.onOpenProfile}>
                <UserIcon />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={props.onOpenSettings}>
                <SettingsIcon />
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={props.onSignOut} variant="destructive">
                <LogOutIcon />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

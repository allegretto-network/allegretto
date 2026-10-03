import { PanelLeftIcon } from "lucide-react";
import Logo from "../assets/logo.svg?react";
import LogoWordmark from "../assets/logo_wordmark.svg?react";
import { useSidebar } from "@allegretto-network/ui/components/sidebar";

/**
 * Expanded: full wordmark.
 * Collapsed: the logo mark, which blur-crossfades into a panel icon on hover
 * so the only affordance in a 48px rail doubles as the expand control.
 */
export function SidebarLogo() {
  const sidebar = useSidebar();

  if (sidebar.state === "collapsed" && !sidebar.isMobile)
    return (
      <button
        aria-label="Expand sidebar"
        onClick={sidebar.toggleSidebar}
        className="group/logo relative grid size-8 shrink-0 place-items-center rounded-md transition-colors duration-150 ease-out hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none active:scale-97"
      >
        <Logo className="col-start-1 row-start-1 h-5 w-auto transition-[opacity,filter] duration-150 ease-out group-hover/logo:opacity-0 group-hover/logo:blur-[2px] motion-reduce:transition-none" />
        <PanelLeftIcon className="col-start-1 row-start-1 size-4 text-sidebar-foreground opacity-0 blur-[2px] transition-[opacity,filter] duration-150 ease-out group-hover/logo:opacity-100 group-hover/logo:blur-none motion-reduce:transition-none" />
      </button>
    );

  return <LogoWordmark className="h-7 w-auto shrink-0" />;
}

import { ListFilterIcon, SearchIcon } from "lucide-react";
import { Button } from "@allegretto-network/ui/components/button";
import { Input } from "@allegretto-network/ui/components/input";

type ConversationSearchProps = {
  placeholder: string;
  value?: string;
  onValueChange?: (value: string) => void;
  onOpenFilters?: () => void;
};

export function ConversationSearch(props: ConversationSearchProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex min-w-0 flex-1 items-center">
        <SearchIcon className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
        <Input
          aria-label="Search conversations"
          className="h-9 border-transparent bg-muted pl-9 font-medium dark:bg-muted"
          onChange={(event) => props.onValueChange?.(event.target.value)}
          placeholder={props.placeholder}
          value={props.value}
        />
      </div>
      <Button
        aria-label="Filter conversations"
        className="size-9 shrink-0 text-muted-foreground"
        onClick={props.onOpenFilters}
        size="icon"
        variant="ghost"
      >
        <ListFilterIcon />
      </Button>
    </div>
  );
}

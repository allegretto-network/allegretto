import { ArrowUpRightIcon } from "lucide-react";
import { cn } from "cn";

export type Suggestion = {
  id: string;
  prompt: string;
};

type SuggestionsListProps = {
  suggestions: Suggestion[];
  label?: string;
  onSelect?: (suggestion: Suggestion) => void;
};

export function SuggestionsList(props: SuggestionsListProps) {
  return (
    <ul aria-label={props.label ?? "Suggested prompts"} className="flex flex-col px-2">
      {props.suggestions.map((suggestion, index) => (
        <li
          className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out [animation-fill-mode:backwards] motion-reduce:animate-none"
          key={suggestion.id}
          // Short cascade (40ms) so eight rows settle in well under half a second.
          style={{ animationDelay: `${120 + index * 40}ms` }}
        >
          <button
            className={cn(
              "group/suggestion flex w-full items-center gap-4 px-2 py-3.5 text-left",
              "border-b border-border last:border-b-transparent",
              "transition-colors duration-150 ease-out hover:bg-muted/40",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
            onClick={() => props.onSelect?.(suggestion)}
            type="button"
          >
            {/* Fixed-width icon slot so every prompt starts on the same lane. */}
            <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground transition-[color,transform] duration-150 ease-out group-hover/suggestion:-translate-y-px group-hover/suggestion:translate-x-px group-hover/suggestion:text-primary motion-reduce:transition-none" />
            <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
              {suggestion.prompt}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

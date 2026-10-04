import { Button } from "@allegretto-network/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@allegretto-network/ui/components/dropdown-menu";
import { ChevronDownIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

/**
 * `icon` is a component, not an element, so any SVG works: a lucide icon
 * (`icon: ZapIcon`) or an svgr-imported asset (`icon: GoldMarkSvg`).
 */
export type Model = {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

type ModelPickerProps = {
  models: Model[];
  value: string;
  onValueChange: (modelId: string) => void;
};

export function ModelPicker(props: ModelPickerProps) {
  const active = props.models.find((model) => model.id === props.value);
  const ActiveIcon = active?.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="h-9 gap-1.5 rounded-full px-2.5 font-medium text-foreground"
            size="sm"
            type="button"
            variant="ghost"
          >
            {ActiveIcon ? <ActiveIcon className="size-4 text-primary" /> : null}
            {active?.label}
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-auto min-w-60" sideOffset={8}>
        <DropdownMenuRadioGroup
          onValueChange={(value) => props.onValueChange(String(value))}
          value={props.value}
        >
          {props.models.map((model) => (
            <DropdownMenuRadioItem
              className="gap-2.5 py-2"
              // Base UI keeps radio items open by default; a single-select
              // picker should dismiss on choice, otherwise the modal backdrop
              // keeps swallowing clicks on the rest of the page.
              closeOnClick
              key={model.id}
              value={model.id}
            >
              {/* Fixed-width icon slot keeps labels on one vertical lane. */}
              <model.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{model.label}</span>
                <span className="text-xs text-muted-foreground">{model.description}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

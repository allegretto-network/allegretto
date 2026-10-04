import { Button } from "@allegretto-network/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@allegretto-network/ui/components/input-group";
import { useForm } from "@tanstack/react-form";
import { cn } from "cn";
import { ArrowRightIcon, MicIcon, PlusIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import * as z from "zod";
import type { Model } from "./model-picker";
import { ModelPicker } from "./model-picker";

const composerSchema = z.object({
  message: z.string().trim().min(1, "Type a message before sending."),
  modelId: z.string().min(1, "Pick a model."),
});

type ChatComposerProps = {
  models: Model[];
  defaultModelId: string;
  placeholder?: string;
  onSubmit?: (message: string, modelId: string) => void;
  onAttach?: () => void;
  onVoice?: () => void;
};

export function ChatComposer({
  models,
  defaultModelId,
  placeholder = "Anything on your mind",
  onSubmit,
  onAttach,
  onVoice,
}: ChatComposerProps) {
  const form = useForm({
    defaultValues: { message: "", modelId: defaultModelId },
    validators: { onSubmit: composerSchema },
    onSubmit: ({ value }) => {
      onSubmit?.(value.message.trim(), value.modelId);
      // Clear the draft but keep the chosen model for the next turn.
      form.setFieldValue("message", "");
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {/* `has-disabled:opacity-50` on InputGroup would dim the whole composer because the
          send button is disabled while the draft is empty, so opt out of it here. */}
      <InputGroup className="min-h-[108px] rounded-xl border-border bg-card has-disabled:bg-card has-disabled:opacity-100 dark:bg-card">
        <form.Field name="message">
          {(field) => (
            <InputGroupTextarea
              aria-label="Message"
              className="field-sizing-content min-h-6 px-4 pt-4 text-base md:text-base"
              name={field.name}
              onChange={(event) => field.handleChange(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                // Enter sends, Shift+Enter breaks the line.
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                void form.handleSubmit();
              }}
              placeholder={placeholder}
              rows={1}
              value={field.state.value}
            />
          )}
        </form.Field>

        <InputGroupAddon align="block-end" className="justify-between px-3 pb-3">
          <Button
            aria-label="Attach file"
            className="size-9 text-muted-foreground hover:text-foreground"
            onClick={onAttach}
            size="icon"
            type="button"
            variant="ghost"
          >
            <PlusIcon className="size-5" />
          </Button>

          <div className="flex items-center gap-1">
            <form.Field name="modelId">
              {(field) => (
                <ModelPicker
                  models={models}
                  onValueChange={field.handleChange}
                  value={field.state.value}
                />
              )}
            </form.Field>

            <Button
              aria-label="Voice input"
              className="size-9 text-muted-foreground hover:text-foreground"
              onClick={onVoice}
              size="icon"
              type="button"
              variant="ghost"
            >
              <MicIcon className="size-5" />
            </Button>

            <form.Subscribe selector={(state) => state.values.message.trim().length > 0}>
              {(canSubmit) => (
                <Button
                  aria-label="Send"
                  className={cn(
                    "size-9 rounded-full transition-opacity duration-150 ease-out active:scale-97",
                    canSubmit ? "opacity-100" : "opacity-50",
                  )}
                  disabled={!canSubmit}
                  size="icon"
                  type="submit"
                >
                  <ArrowRightIcon className="size-5" />
                </Button>
              )}
            </form.Subscribe>
          </div>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}

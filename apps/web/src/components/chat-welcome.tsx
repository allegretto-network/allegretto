import type { ReactNode } from "react";

type ChatWelcomeProps = {
  greeting: string;
  children: ReactNode;
};

/**
 * Centered empty-state column for a fresh thread: greeting, composer, prompts.
 * Capped at the thread width (720px) so long prompts stay scannable.
 */
export function ChatWelcome(props: ChatWelcomeProps) {
  return (
    <div className="flex min-h-full h-fit w-full flex-col items-center justify-center py-16">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4">
        <h1 className="animate-in fade-in-0 slide-in-from-bottom-2 px-2 text-center text-3xl font-semibold tracking-tight text-foreground duration-500 ease-out motion-reduce:animate-none">
          {props.greeting}
        </h1>
        <div className="flex flex-col gap-3">{props.children}</div>
      </div>
    </div>
  );
}

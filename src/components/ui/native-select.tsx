import type { ComponentProps, Ref } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface NativeSelectProps extends ComponentProps<"select"> {
  ref?: Ref<HTMLSelectElement>;
  wrapperClassName?: string;
}

const NativeSelect = ({ className, wrapperClassName, children, ref, ...props }: NativeSelectProps) => {
  return (
    <div className={cn("relative w-full", wrapperClassName)}>
      <select
        ref={ref}
        className={cn(
          "peer flex h-10 touch:min-h-11 w-full appearance-none rounded-md border border-input bg-background py-2 pl-3 pr-9 text-sm text-foreground ring-offset-background aria-[invalid=true]:border-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-60 peer-disabled:opacity-40"
      />
    </div>
  );
};
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };

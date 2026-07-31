import type { ComponentPropsWithoutRef, ElementRef, Ref } from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = ({ className, ref, ...props }: ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & { ref?: Ref<ElementRef<typeof SwitchPrimitives.Root>> }) => {
  return (
    <SwitchPrimitives.Root
    className={cn(
      // BL-R8-12: hit-area táctil ≥44px vía pseudo-elemento (24+2×10=44px de alto),
      // sin alterar el tamaño visual 44×24 ni el layout de las filas que lo usan.
      "peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors before:absolute before:-inset-y-2.5 before:-inset-x-1 before:content-[''] data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitives.Root>
  );
};
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };

import type { HTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

const Card = ({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) => {
  return (
    <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
  );
};
Card.displayName = "Card";

const CardHeader = ({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) => {
  return (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  );
};
CardHeader.displayName = "CardHeader";

const CardTitle = ({ as: Heading = "h3", className, ref, ...props }: HTMLAttributes<HTMLHeadingElement> & { as?: "h1" | "h2" | "h3"; ref?: Ref<HTMLHeadingElement> }) => {
  return (
    <Heading ref={ref} className={cn("text-base font-semibold leading-none tracking-tight", className)} {...props} />
  );
};
CardTitle.displayName = "CardTitle";

const CardDescription = ({ className, ref, ...props }: HTMLAttributes<HTMLParagraphElement> & { ref?: Ref<HTMLParagraphElement> }) => {
  return (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
};
CardDescription.displayName = "CardDescription";

const CardContent = ({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) => {
  return (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  );
};
CardContent.displayName = "CardContent";

const CardFooter = ({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) => {
  return (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  );
};
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };

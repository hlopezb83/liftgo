import type { ReactNode } from "react";
export function Link({ to, children, ...props }: { to: string; children: ReactNode; [key: string]: unknown }) { return <a href={to} {...props}>{children}</a>; }

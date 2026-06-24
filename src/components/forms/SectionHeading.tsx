/**
 * Section heading shared across form dialogs.
 * Style: small-caps, tracked, muted. Keeps a consistent rhythm
 * between Cliente, Proveedor and other entity dialogs.
 */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
      {children}
    </p>
  );
}

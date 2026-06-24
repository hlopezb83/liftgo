/**
 * Small destructive-colored asterisk for required field labels.
 * Use as: <FormLabel>Nombre <RequiredMark /></FormLabel>
 */
export function RequiredMark() {
  return <span className="text-destructive ml-0.5" aria-hidden="true">*</span>;
}

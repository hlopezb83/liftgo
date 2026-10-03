export function isPlatformEditConflict(error: unknown) {
  return error instanceof Error && /(?:datos|versión) cambi(?:aron|ó)/i.test(error.message);
}

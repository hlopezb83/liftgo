export function notifyWarning(): void { throw new Error("Fixture must not invoke writes or cleanup"); }

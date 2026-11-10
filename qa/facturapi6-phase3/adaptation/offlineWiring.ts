import { prepareOfficialCalls, type CallScope, type OfficialClient } from "./officialCalls";

/** Inyectable sólo en copias QA. No crea SDK, lee llaves ni crea servicio. */
export function offlineSdkFactory(client: OfficialClient, scope: CallScope) {
  return (_unusedApiKey: string) => {
    scope.checkpoint();
    scope.signal.throwIfAborted();
    const calls = prepareOfficialCalls(client, scope);
    const view = Object.create(client) as OfficialClient;
    view.invoices = calls.invoices;
    return view;
  };
}
import type { ParseResult } from "../../lib/bankParseUtils";
import type { StatementProfile } from "../../lib/bankReconciliationConstants";
import type { XmlFieldMapping } from "../../lib/xmlParsers";
import { mappingSignature } from "./analysis";

export interface AnalyzedUpload {
  uploadId: string;
  bankAccountId: string;
  file: File;
  profile: StatementProfile;
  isXml: boolean;
  mappingSignature: string;
  result: ParseResult;
}

interface BuildArgs {
  bankAccountId: string;
  file: File;
  profile: StatementProfile;
  isXml: boolean;
  effectiveMapping: XmlFieldMapping;
  result: ParseResult;
}

export function buildAnalyzedUpload(
  { bankAccountId, file, profile, isXml, effectiveMapping, result }: BuildArgs,
): AnalyzedUpload {
  return {
    uploadId: crypto.randomUUID(),
    bankAccountId,
    file,
    profile,
    isXml,
    mappingSignature: isXml ? mappingSignature(effectiveMapping) : "",
    result,
  };
}

interface IdentityArgs {
  file: File;
  bankAccountId: string;
  profile: StatementProfile;
  mapping: XmlFieldMapping;
}

/** El análisis sólo puede importarse si sigue describiendo el estado actual. */
export function analysisMatchesIdentity(
  analyzed: AnalyzedUpload,
  { file, bankAccountId, profile, mapping }: IdentityArgs,
): boolean {
  return analyzed.file === file
    && analyzed.bankAccountId === bankAccountId
    && analyzed.profile === profile
    && (!analyzed.isXml || analyzed.mappingSignature === mappingSignature(mapping));
}

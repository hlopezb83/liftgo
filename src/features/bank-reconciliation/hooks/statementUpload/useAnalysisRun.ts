import { useCallback, useRef, useState } from "react";

/**
 * Tokens de generación que evitan publicar resultados obsoletos: cada
 * ejecución nueva invalida la anterior y sólo la vigente puede escribir.
 */
export function useAnalysisRun(onStart: () => void) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const generationRef = useRef(0);
  const activeRunRef = useRef<number | null>(null);

  const startRun = useCallback((supersede: boolean): number | null => {
    if (!supersede && activeRunRef.current !== null) return null;
    const runId = generationRef.current + 1;
    generationRef.current = runId;
    activeRunRef.current = runId;
    setIsAnalyzing(true);
    onStart();
    return runId;
  }, [onStart]);

  const finishRun = useCallback((runId: number) => {
    if (activeRunRef.current !== runId) return;
    activeRunRef.current = null;
    setIsAnalyzing(false);
  }, []);

  const isCurrentRun = useCallback((runId: number) => generationRef.current === runId, []);

  const invalidateRuns = useCallback(() => { generationRef.current += 1; }, []);

  return { isAnalyzing, startRun, finishRun, isCurrentRun, invalidateRuns };
}

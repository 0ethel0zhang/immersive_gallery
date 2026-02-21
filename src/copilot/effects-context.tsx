import * as React from "react";
import { createEffectsState } from "./effects-store";
import type { EffectsState } from "./effects-store";

type EffectsContextValue = {
  stateRef: React.RefObject<EffectsState>;
  notify: () => void;
  revision: number;
};

const EffectsContext = React.createContext<EffectsContextValue | null>(null);

export function EffectsProvider({ children }: { children: React.ReactNode }) {
  const stateRef = React.useRef(createEffectsState());
  const [revision, setRevision] = React.useState(0);

  const notify = React.useCallback(() => {
    stateRef.current.revision++;
    setRevision(stateRef.current.revision);
  }, []);

  const value = React.useMemo(() => ({ stateRef, notify, revision }), [notify, revision]);

  return <EffectsContext value={value}>{children}</EffectsContext>;
}

export function useEffects(): EffectsContextValue {
  const ctx = React.useContext(EffectsContext);
  if (!ctx) throw new Error("useEffects must be used within EffectsProvider");
  return ctx;
}

import type { HarnessCorePackageBoundary } from "@seq-star/harness-core";
import type { ReactNode } from "react";

export interface HarnessReactPackageBoundary {
  readonly children?: ReactNode;
  readonly harness: HarnessCorePackageBoundary;
  readonly packageName: "@seq-star/harness-react";
}

import {
  type ComponentContext,
  createEventFabric,
  createMessageSchemaRegistry,
  createTranslatorRegistry,
  type EventFabric,
  type HarnessComponent,
  type HarnessMessage,
  installCoreMessageSchemas,
} from "@seq-star/harness-core";
import { describe, expect, it } from "vitest";

export const uuid = (): string => crypto.randomUUID();

export const message = (
  type: string,
  payload: unknown,
  target?: { readonly component: string },
): HarnessMessage => ({
  id: uuid(),
  type,
  version: "0.1.0",
  source: { plugin: "wrapper-contract" },
  ...(target === undefined ? {} : { target }),
  correlationId: uuid(),
  timestamp: new Date().toISOString(),
  payload: payload as never,
});

export const createHarnessContext = (): {
  readonly fabric: EventFabric & { dispose(): void };
  readonly messages: HarnessMessage[];
  readonly context: ComponentContext;
} => {
  const schemas = createMessageSchemaRegistry();
  installCoreMessageSchemas(schemas);
  const fabric = createEventFabric({ schemas });
  const messages: HarnessMessage[] = [];
  fabric.observe().subscribe((item) => messages.push(item));
  return {
    fabric,
    messages,
    context: {
      fabric,
      translators: createTranslatorRegistry(),
      signal: new AbortController().signal,
      reportCapabilities: () => undefined,
      reportCoordinateSpaces: () => undefined,
    },
  };
};

export interface WrapperConformanceAdapter {
  readonly name: string;
  readonly requestTopic: string;
  create(): {
    readonly wrapper: HarnessComponent;
    readonly driver: {
      listenerCount(): number;
      loadSignal(index: number): AbortSignal | undefined;
      resolveLoad(index: number, generation: number): void;
      emitNative(): void;
      appliedCount(): number;
      clearCount(): number;
    };
  };
  makeValidRequest(id: string): unknown;
  makeApplyMessage(owner: unknown, target: string): HarnessMessage;
  makeClearMessage(owner: unknown, target: string): HarnessMessage;
}

const ticks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

/**
 * Contract suite shared by wrapper adapters. Future visualizers only provide a
 * controlled native driver and request/native factories; the lifecycle and
 * harness-boundary assertions remain implementation-independent.
 */
export const runWrapperConformance = (adapter: WrapperConformanceAdapter): void => {
  describe(`${adapter.name} wrapper conformance`, () => {
    it("supersedes rapid requests and keeps only the final completion visible", async () => {
      const harness = createHarnessContext();
      const { wrapper, driver } = adapter.create();
      await wrapper.start(harness.context);
      harness.fabric.publish(
        message(adapter.requestTopic, adapter.makeValidRequest("first"), {
          component: wrapper.id,
        }),
      );
      harness.fabric.publish(
        message(adapter.requestTopic, adapter.makeValidRequest("last"), {
          component: wrapper.id,
        }),
      );
      expect(driver.loadSignal(0)?.aborted).toBe(true);
      driver.resolveLoad(1, 2);
      driver.resolveLoad(0, 1);
      await ticks();
      expect(harness.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "lifecycle.visualization",
            payload: expect.objectContaining({ requestId: "last", status: "rendered" }),
          }),
          expect.objectContaining({
            type: "lifecycle.visualization",
            payload: expect.objectContaining({ requestId: "first", status: "superseded" }),
          }),
        ]),
      );
      await wrapper.dispose();
    });

    it("keeps target, native/applied, owner-clear, and listener boundaries isolated", async () => {
      const harness = createHarnessContext();
      const { wrapper, driver } = adapter.create();
      await wrapper.start(harness.context);
      expect(driver.listenerCount()).toBe(1);
      harness.fabric.publish(
        message(adapter.requestTopic, adapter.makeValidRequest("active"), {
          component: wrapper.id,
        }),
      );
      driver.resolveLoad(0, 1);
      await ticks();
      driver.emitNative();
      const nativeCount = harness.messages.filter(
        (item) => item.type === "interaction.native",
      ).length;
      const owner = { correlationId: uuid(), sourceComponent: "contract-source" };
      harness.fabric.publish(adapter.makeApplyMessage(owner, wrapper.id));
      harness.fabric.publish(adapter.makeApplyMessage(owner, "another-wrapper"));
      expect(driver.appliedCount()).toBe(1);
      expect(harness.messages.filter((item) => item.type === "interaction.native")).toHaveLength(
        nativeCount,
      );
      harness.fabric.publish(adapter.makeClearMessage(owner, wrapper.id));
      expect(driver.clearCount()).toBe(1);
      await wrapper.dispose();
      expect(driver.listenerCount()).toBe(0);
      driver.emitNative();
      expect(harness.messages.filter((item) => item.type === "interaction.native")).toHaveLength(
        nativeCount,
      );
    });
  });
};

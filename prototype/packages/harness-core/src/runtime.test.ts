import type { CoordinateSpace, CoordinateTranslator } from "@seq-star/seq-coords";
import { createTableTranslator } from "@seq-star/seq-coords";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import type { HarnessMessage } from "./index.js";
import {
  createApplicationHarness,
  createEventFabric,
  createMessageSchemaRegistry,
  createTranslatorRegistry,
  installCoreMessageSchemas,
  payloadSchema,
} from "./index.js";

const ids = [
  "4fbc14d0-3adb-4e6f-a8c7-4cbd3067a42d",
  "5fbc14d0-3adb-4e6f-a8c7-4cbd3067a42d",
  "6fbc14d0-3adb-4e6f-a8c7-4cbd3067a42d",
  "7fbc14d0-3adb-4e6f-a8c7-4cbd3067a42d",
];
let next = 0;
const fallbackId = "4fbc14d0-3adb-4e6f-a8c7-4cbd3067a42d";
const message = (
  type: string,
  payload: object,
  target?: HarnessMessage["target"],
): HarnessMessage => ({
  id: ids[next++ % ids.length] ?? fallbackId,
  type,
  version: "0.1.0",
  source: { component: "source" },
  correlationId: ids[next++ % ids.length] ?? fallbackId,
  timestamp: "2026-08-19T00:00:00.000Z",
  payload: payload as HarnessMessage["payload"],
  ...(target === undefined ? {} : { target }),
});

describe("harness runtime", () => {
  it("rejects malformed input without terminating a FIFO fabric", () => {
    const schemas = createMessageSchemaRegistry();
    schemas.register("test", "0.1.0", payloadSchema(Type.Object({ value: Type.String() })));
    installCoreMessageSchemas(schemas);
    const fabric = createEventFabric({
      schemas,
      id: () => ids[next++ % ids.length] ?? fallbackId,
      clock: () => "2026-08-19T00:00:00.000Z",
    });
    const received: string[] = [];
    fabric.observe().subscribe((entry) => {
      received.push(entry.type);
      if (entry.type === "test" && (entry.payload as { value: string }).value === "first")
        fabric.publish(message("test", { value: "derived" }));
    });
    fabric.publish(message("test", { value: "first" }));
    fabric.publish({
      ...message("test", { value: "bad" }),
      payload: { value: undefined },
    } as unknown as HarnessMessage);
    fabric.publish(message("test", { value: "last" }));
    expect(received).toEqual(["test", "test", "harness.diagnostic", "test"]);
    let completed = false;
    fabric.observe().subscribe({
      complete: () => {
        completed = true;
      },
    });
    fabric.dispose();
    expect(received).toHaveLength(4);
    expect(completed).toBe(true);
  });

  it("orders translator paths and never guesses across an unmatched space", async () => {
    const a: CoordinateSpace = { id: "a", kind: "index", length: 10 };
    const b: CoordinateSpace = { id: "b", kind: "index", length: 10, context: { name: "b" } };
    const c: CoordinateSpace = { id: "c", kind: "index", length: 10, context: { name: "c" } };
    const translate = (
      id: string,
      source: CoordinateSpace,
      target: CoordinateSpace,
      cost = 1,
    ): CoordinateTranslator => ({
      id,
      source: { kind: source.kind, context: { name: source.id } },
      target: { kind: target.kind, context: { name: target.id } },
      cost,
      async map(request) {
        return {
          translatorIds: [id],
          diagnostics: [],
          associations: request.loci.map((locus) => ({
            source: locus,
            targets: [{ ...locus, space: target }],
            status: "exact" as const,
          })),
        };
      },
    });
    const registry = createTranslatorRegistry();
    registry.register(translate("z", a, b));
    registry.register(translate("a", a, b));
    registry.register(translate("to-c", b, c));
    const source = {
      kind: "point" as const,
      space: { ...a, context: { name: "a" } },
      position: { kind: "index" as const, value: 1 },
    };
    const target = { ...c, context: { name: "c" } };
    expect(registry.findPaths(source.space, target)[0]?.translatorIds).toEqual(["a", "to-c"]);
    const mapped = await registry.map({ loci: [source], target });
    expect(mapped.associations[0]?.targets[0]?.space.id).toBe("c");
    const controller = new AbortController();
    controller.abort();
    expect(
      (await registry.map({ loci: [source], target }, controller.signal)).associations[0]?.status,
    ).toBe("unmapped");
  });

  it("passes an immediate target through target-sensitive multi-hop translators", async () => {
    const a: CoordinateSpace = { id: "a", kind: "index", context: { name: "a" } };
    const b: CoordinateSpace = { id: "b", kind: "index", context: { name: "b" } };
    const c: CoordinateSpace = { id: "c", kind: "index", context: { name: "c" } };
    const seen: string[] = [];
    const registry = createTranslatorRegistry();
    registry.register({
      id: "a-b",
      source: { kind: "index", context: { name: "a" } },
      target: { kind: "index", context: { name: "b" } },
      async map(request) {
        seen.push(request.target?.context?.name ?? "none");
        return {
          translatorIds: ["a-b"],
          diagnostics: [],
          associations: request.loci.map((source) => ({
            source,
            targets: [{ ...source, space: b }],
            status: "exact" as const,
          })),
        };
      },
    });
    registry.register({
      id: "b-c",
      source: { kind: "index", context: { name: "b" } },
      target: { kind: "index", context: { name: "c" } },
      async map(request) {
        seen.push(request.target?.context?.name ?? "none");
        return {
          translatorIds: ["b-c"],
          diagnostics: [],
          associations: request.loci.map((source) => ({
            source,
            targets: [{ ...source, space: c }],
            status: "exact" as const,
          })),
        };
      },
    });
    const source = {
      kind: "point" as const,
      space: a,
      position: { kind: "index" as const, value: 1 },
    };
    const mapped = await registry.map({ loci: [source], target: c });
    expect(seen).toEqual(["none", "c"]);
    expect(mapped.associations[0]).toMatchObject({ source, status: "exact" });
  });

  it("composes real table translators without imposing the final target on an intermediate hop", async () => {
    const a: CoordinateSpace = { id: "a", kind: "index", context: { name: "a" } };
    const b: CoordinateSpace = { id: "b", kind: "index", context: { name: "b" } };
    const c: CoordinateSpace = { id: "c", kind: "index", context: { name: "c" } };
    const locus = (space: CoordinateSpace) => ({
      kind: "point" as const,
      space,
      position: { kind: "index" as const, value: 1 },
    });
    const registry = createTranslatorRegistry();
    registry.register(
      createTableTranslator(
        "a-b",
        { kind: "index", context: { name: "a" } },
        { kind: "index", context: { name: "b" } },
        [{ source: locus(a), target: locus(b) }],
      ),
    );
    registry.register(
      createTableTranslator(
        "b-c",
        { kind: "index", context: { name: "b" } },
        { kind: "index", context: { name: "c" } },
        [{ source: locus(b), target: locus(c) }],
      ),
    );
    expect((await registry.map({ loci: [locus(a)], target: c })).associations[0]?.targets).toEqual([
      locus(c),
    ]);
  });

  it("isolates a throwing observer and reports it as a diagnostic", async () => {
    const schemas = createMessageSchemaRegistry();
    schemas.register("test", "0.1.0", payloadSchema(Type.Object({ value: Type.String() })));
    installCoreMessageSchemas(schemas);
    const fabric = createEventFabric({ schemas });
    const received: HarnessMessage[] = [];
    fabric.observe().subscribe((entry) => {
      if (entry.type === "test") throw new Error("hostile observer");
    });
    fabric.observe().subscribe((entry) => received.push(entry));
    const root = message("test", { value: "still works" });
    fabric.publish(root);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received.map((entry) => entry.type)).toEqual(["test", "harness.diagnostic"]);
    expect(received[1]).toMatchObject({ correlationId: root.correlationId, causationId: root.id });
    fabric.dispose();
  });

  it("accepts focus clear as a core owner-scoped command", () => {
    const schemas = createMessageSchemaRegistry();
    installCoreMessageSchemas(schemas);
    const fabric = createEventFabric({ schemas });
    const received: string[] = [];
    fabric.observe().subscribe((entry) => received.push(entry.type));
    fabric.publish(
      message("interaction.focus.clear", {
        interactionId: "focus-1",
        owner: { correlationId: fallbackId, sourceComponent: "source" },
      }),
    );
    expect(received).toEqual(["interaction.focus.clear"]);
    fabric.dispose();
  });

  it("rolls back component setup and disposes in reverse order", async () => {
    const log: string[] = [];
    const make = (type: string, fails = false) => ({
      type,
      create: ({ id }: { id: string }) => ({
        id,
        capabilities: [],
        async start() {
          log.push(`start:${id}`);
          if (fails) throw new Error("boom");
        },
        dispose() {
          log.push(`dispose:${id}`);
        },
      }),
    });
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [
          { id: "one", type: "one" },
          { id: "two", type: "two" },
        ],
      },
      { componentFactories: [make("one"), make("two", true)] },
    );
    await expect(harness.start()).rejects.toThrow("boom");
    expect(log).toEqual(["start:one", "start:two", "dispose:two", "dispose:one"]);
    harness.dispose();
  });

  it("rolls back every registration made by a failing plugin setup", async () => {
    const source: CoordinateSpace = { id: "source", kind: "index" };
    const target: CoordinateSpace = { id: "target", kind: "index" };
    const harness = createApplicationHarness(
      { id: "app", components: [], plugins: [{ id: "broken", plugin: "broken" }] },
      {
        componentFactories: [],
        pluginFactories: [
          {
            plugin: "broken",
            create: () => ({
              id: "broken",
              async setup(context) {
                context.messageSchemas.register(
                  "plugin.message",
                  "0.1.0",
                  payloadSchema(Type.Object({ ok: Type.Boolean() })),
                );
                context.addProcessor({ id: "processor", types: ["plugin.message"], process() {} });
                context.addRoute({ id: "route", type: "plugin.message", to: { broadcast: true } });
                context.translators.register({
                  id: "temporary",
                  source: { kind: "index" },
                  target: { kind: "index" },
                  async map(request) {
                    return {
                      translatorIds: ["temporary"],
                      diagnostics: [],
                      associations: request.loci.map((locus) => ({
                        source: locus,
                        targets: [{ ...locus, space: target }],
                        status: "exact" as const,
                      })),
                    };
                  },
                });
                throw new Error("rollback");
              },
            }),
          },
        ],
      },
    );
    await expect(harness.start()).rejects.toThrow("rollback");
    expect(harness.translators.findPaths(source, target)).toEqual([]);
  });

  it("applies unhandled and stop-harness processor policies", async () => {
    const pluginFactory = {
      plugin: "policy",
      create: () => ({
        id: "policy",
        setup(context: import("./index.js").HarnessPluginContext) {
          context.messageSchemas.register(
            "plugin.message",
            "0.1.0",
            payloadSchema(Type.Object({ ok: Type.Boolean() })),
          );
          context.addProcessor({
            id: "explode",
            types: ["plugin.message"],
            process() {
              throw new Error("processor");
            },
          });
          return undefined;
        },
      }),
    };
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [],
        plugins: [{ id: "policy", plugin: "policy" }],
        policies: { processorFailure: "stop-harness", unhandledMessage: "diagnostic" },
      },
      { componentFactories: [], pluginFactories: [pluginFactory] },
    );
    await harness.start();
    expect(harness.policies).toEqual({
      partialRendering: "reject",
      unhandledMessage: "diagnostic",
      processorFailure: "stop-harness",
    });
    const observed: string[] = [];
    let completed = false;
    harness.fabric.observe().subscribe({
      next: (entry) => observed.push(entry.type),
      complete: () => {
        completed = true;
      },
    });
    harness.fabric.publish(message("plugin.message", { ok: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(observed).toContain("harness.diagnostic");
    expect(completed).toBe(true);
    await harness.disposeAsync();
  });

  it("coalesces hover routes to the final event in a frame", async () => {
    let release: (() => void) | undefined;
    const delivered: string[] = [];
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [{ id: "target", type: "mock" }],
        routes: [
          {
            id: "hover",
            type: "interaction.native",
            to: { capability: "mock:format/view" },
            policy: "animation-frame-latest",
          },
        ],
      },
      {
        componentFactories: [
          {
            type: "mock",
            create: ({ id }) => ({
              id,
              capabilities: ["mock:format/view"],
              async start(context) {
                context.fabric
                  .observe({ targetComponent: id })
                  .subscribe((entry) =>
                    delivered.push((entry.payload as { interactionId: string }).interactionId),
                  );
              },
              dispose() {},
            }),
          },
        ],
        frame: (callback) => {
          release = callback;
          return { dispose() {} };
        },
      },
    );
    await harness.start();
    const native = (interactionId: string): HarnessMessage =>
      message("interaction.native", {
        interactionId,
        interaction: "hover",
        phase: "set",
        origin: { componentId: "source" },
        loci: [],
      });
    harness.fabric.publish(native("one"));
    harness.fabric.publish(native("two"));
    release?.();
    expect(delivered).toEqual(["two"]);
    harness.dispose();
  });

  it("synchronizes selection in both directions without command echo", async () => {
    const space: CoordinateSpace = { id: "shared", kind: "index", length: 4 };
    const commands: string[] = [];
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [
          { id: "a", type: "mock" },
          { id: "b", type: "mock" },
        ],
        synchronization: [{ id: "select", interaction: "select", between: ["a", "b"] }],
      },
      {
        componentFactories: [
          {
            type: "mock",
            create: ({ id }) => ({
              id,
              capabilities: [],
              async start(context) {
                context.reportCoordinateSpaces([space]);
                context.fabric
                  .observe({ targetComponent: id })
                  .subscribe((entry) => commands.push(`${id}:${entry.type}`));
              },
              dispose() {},
            }),
          },
        ],
      },
    );
    await harness.start();
    const native = (origin: string): HarnessMessage =>
      message("interaction.native", {
        interactionId: `select-${origin}`,
        interaction: "select",
        phase: "set",
        origin: { componentId: origin },
        loci: [{ kind: "point", space, position: { kind: "index", value: 1 } }],
      });
    harness.fabric.publish(native("a"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(commands).toEqual(["b:interaction.selection.apply"]);
    harness.fabric.publish(native("b"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(commands).toEqual(["b:interaction.selection.apply", "a:interaction.selection.apply"]);
    harness.dispose();
  });

  it("retains only the newest visualization request while a component is starting", async () => {
    let ready: (() => void) | undefined;
    const received: string[] = [];
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [{ id: "target", type: "mock" }],
        routes: [
          {
            id: "view",
            type: "visualization.seqviewspec.request",
            to: { capability: "mock:format/view" },
            policy: "latest",
          },
        ],
      },
      {
        componentFactories: [
          {
            type: "mock",
            create: ({ id }) => ({
              id,
              capabilities: ["mock:format/view"],
              async start(context) {
                context.fabric
                  .observe({ targetComponent: id })
                  .subscribe((entry) =>
                    received.push((entry.payload as { requestId: string }).requestId),
                  );
                await new Promise<void>((resolve) => {
                  ready = resolve;
                });
              },
              dispose() {},
            }),
          },
        ],
      },
    );
    const start = harness.start();
    harness.fabric.publish(
      message("visualization.seqviewspec.request", {
        format: "seqviewspec",
        requestId: "first",
        mode: "replace",
        document: {},
      }),
    );
    harness.fabric.publish(
      message("visualization.seqviewspec.request", {
        format: "seqviewspec",
        requestId: "second",
        mode: "replace",
        document: {},
      }),
    );
    await Promise.resolve();
    ready?.();
    await start;
    expect(received).toEqual(["second"]);
    harness.dispose();
  });

  it("accepts a third visualizer exclusively through a public component factory", async () => {
    const started: string[] = [];
    const factory = (type: string) => ({
      type,
      create: ({ id }: { id: string }) => ({
        id,
        capabilities: [],
        async start() {
          started.push(`${type}:${id}`);
        },
        dispose() {},
      }),
    });
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [
          { id: "sequence", type: "sequence" },
          { id: "structure", type: "structure" },
          { id: "third", type: "third-party" },
        ],
      },
      { componentFactories: [factory("sequence"), factory("structure"), factory("third-party")] },
    );
    await harness.start();
    expect(started).toEqual(["sequence:sequence", "structure:structure", "third-party:third"]);
    await harness.disposeAsync();
  });

  it("installs dependent plugins in capability order and disposes them in reverse", async () => {
    const log: string[] = [];
    const factory = (plugin: string, requires: string[] = [], provides: string[] = []) => ({
      plugin,
      create: () => ({
        id: plugin,
        requires,
        provides,
        setup() {
          log.push(`setup:${plugin}`);
          return { dispose: () => log.push(`dispose:${plugin}`) };
        },
      }),
    });
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [],
        plugins: [
          { id: "b", plugin: "b" },
          { id: "a", plugin: "a" },
        ],
      },
      {
        componentFactories: [],
        pluginFactories: [factory("a", [], ["test:cap/a"]), factory("b", ["test:cap/a"])],
      },
    );
    await harness.start();
    await harness.disposeAsync();
    expect(log).toEqual(["setup:a", "setup:b", "dispose:b", "dispose:a"]);
  });

  it("returns a per-locus timeout diagnostic and clears timeout work on settle or caller abort", async () => {
    vi.useFakeTimers();
    try {
      const a: CoordinateSpace = { id: "a", kind: "index" };
      const b: CoordinateSpace = { id: "b", kind: "index" };
      const locus = {
        kind: "point" as const,
        space: a,
        position: { kind: "index" as const, value: 1 },
      };
      const registry = createTranslatorRegistry();
      registry.register({
        id: "slow",
        source: { kind: "index" },
        target: { kind: "index" },
        async map() {
          return await new Promise(() => undefined);
        },
      });
      const timed = registry.map({ loci: [locus], target: b });
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await timed).diagnostics.map((item) => item.code)).toContain(
        "harness.translation.timeout",
      );
      const normal = createTranslatorRegistry();
      normal.register({
        id: "fast",
        source: { kind: "index" },
        target: { kind: "index" },
        async map(request) {
          return {
            translatorIds: ["fast"],
            diagnostics: [],
            associations: request.loci.map((source) => ({
              source,
              targets: [{ ...source, space: b }],
              status: "exact" as const,
            })),
          };
        },
      });
      await normal.map({ loci: [locus], target: b });
      expect(vi.getTimerCount()).toBe(0);
      const controller = new AbortController();
      controller.abort();
      await normal.map({ loci: [locus], target: b }, controller.signal);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cleans timeout state when a translator throws synchronously", async () => {
    vi.useFakeTimers();
    try {
      const source: CoordinateSpace = { id: "source", kind: "index" };
      const target: CoordinateSpace = { id: "target", kind: "index" };
      const locus = {
        kind: "point" as const,
        space: source,
        position: { kind: "index" as const, value: 0 },
      };
      const registry = createTranslatorRegistry();
      registry.register({
        id: "throws-synchronously",
        source: { kind: "index" },
        target: { kind: "index" },
        map() {
          throw new Error("synchronous failure");
        },
      });

      const mapped = await registry.map({ loci: [locus], target });

      expect(mapped.associations[0]?.status).toBe("unmapped");
      expect(mapped.diagnostics.map((item) => item.code)).toContain("harness.translation.failure");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a stale hover translation before it can apply after a newer hover", async () => {
    const source: CoordinateSpace = { id: "source", kind: "index", context: { name: "source" } };
    const target: CoordinateSpace = { id: "target", kind: "index", context: { name: "target" } };
    let resolveFirst: ((value: import("@seq-star/seq-coords").MappingResult) => void) | undefined;
    let firstSignal: AbortSignal | undefined;
    let firstStartedResolve: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      firstStartedResolve = resolve;
    });
    let appliedResolve: (() => void) | undefined;
    const applied = new Promise<void>((resolve) => {
      appliedResolve = resolve;
    });
    const appliedPositions: number[] = [];
    const result = (request: {
      readonly loci: readonly import("@seq-star/seq-coords").CoordinateLocus[];
    }) => ({
      translatorIds: ["source-target"],
      diagnostics: [],
      associations: request.loci.map((locus) => ({
        source: locus,
        targets: [{ ...locus, space: target }],
        status: "exact" as const,
      })),
    });
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [
          { id: "source", type: "mock" },
          { id: "target", type: "mock" },
        ],
        synchronization: [{ id: "hover", interaction: "hover", between: ["source", "target"] }],
      },
      {
        componentFactories: [
          {
            type: "mock",
            create: ({ id }) => ({
              id,
              capabilities: [],
              async start(context) {
                if (id === "source") {
                  context.translators.register({
                    id: "source-target",
                    source: { kind: "index", context: { name: "source" } },
                    target: { kind: "index", context: { name: "target" } },
                    map(request, signal) {
                      const position = (request.loci[0] as { position: { value: number } }).position
                        .value;
                      if (position !== 1) return Promise.resolve(result(request));
                      firstSignal = signal;
                      firstStartedResolve?.();
                      return new Promise((resolve) => {
                        resolveFirst = resolve;
                      });
                    },
                  });
                  return;
                }
                context.reportCoordinateSpaces([target]);
                context.fabric.observe({ targetComponent: id }).subscribe((entry) => {
                  if (entry.type !== "interaction.highlight.apply") return;
                  const locus = (
                    entry.payload as { loci: readonly { position: { value: number } }[] }
                  ).loci[0];
                  if (locus !== undefined) appliedPositions.push(locus.position.value);
                  appliedResolve?.();
                });
              },
              dispose() {},
            }),
          },
        ],
      },
    );
    await harness.start();
    const hover = (position: number): HarnessMessage =>
      message("interaction.native", {
        interactionId: `hover-${position}`,
        interaction: "hover",
        phase: "set",
        origin: { componentId: "source" },
        loci: [{ kind: "point", space: source, position: { kind: "index", value: position } }],
      });
    harness.fabric.publish(hover(1));
    await firstStarted;
    harness.fabric.publish(hover(2));
    expect(firstSignal?.aborted).toBe(true);
    await applied;
    resolveFirst?.(
      result({ loci: [{ kind: "point", space: source, position: { kind: "index", value: 1 } }] }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(appliedPositions).toEqual([2]);
    await harness.disposeAsync();
  });

  it("chooses a destination space from all loci and retains the mapped subset", async () => {
    const unmappable: CoordinateSpace = {
      id: "unmappable",
      kind: "index",
      context: { name: "unmappable" },
    };
    const mappable: CoordinateSpace = {
      id: "mappable",
      kind: "index",
      context: { name: "mappable" },
    };
    const target: CoordinateSpace = { id: "target", kind: "index", context: { name: "target" } };
    const diagnostics: string[] = [];
    let appliedResolve: (() => void) | undefined;
    const applied = new Promise<void>((resolve) => {
      appliedResolve = resolve;
    });
    const received: import("@seq-star/seq-coords").CoordinateLocus[][] = [];
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [
          { id: "source", type: "mock" },
          { id: "target", type: "mock" },
        ],
        synchronization: [{ id: "select", interaction: "select", between: ["source", "target"] }],
      },
      {
        componentFactories: [
          {
            type: "mock",
            create: ({ id }) => ({
              id,
              capabilities: [],
              async start(context) {
                if (id === "source") {
                  context.translators.register({
                    id: "mappable-target",
                    source: { kind: "index", context: { name: "mappable" } },
                    target: { kind: "index", context: { name: "target" } },
                    async map(request) {
                      return {
                        translatorIds: ["mappable-target"],
                        diagnostics: [],
                        associations: request.loci.map((locus) => ({
                          source: locus,
                          targets: [{ ...locus, space: target }],
                          status: "exact" as const,
                        })),
                      };
                    },
                  });
                  return;
                }
                context.reportCoordinateSpaces([target]);
                context.fabric.observe({ targetComponent: id }).subscribe((entry) => {
                  if (entry.type !== "interaction.selection.apply") return;
                  received.push(
                    (entry.payload as { loci: import("@seq-star/seq-coords").CoordinateLocus[] })
                      .loci,
                  );
                  appliedResolve?.();
                });
              },
              dispose() {},
            }),
          },
        ],
      },
    );
    await harness.start();
    harness.fabric.observe({ types: ["harness.diagnostic"] }).subscribe((entry) => {
      diagnostics.push(JSON.stringify(entry.payload));
    });
    harness.fabric.publish(
      message("interaction.native", {
        interactionId: "mixed-loci",
        interaction: "select",
        phase: "set",
        origin: { componentId: "source" },
        loci: [
          { kind: "point", space: unmappable, position: { kind: "index", value: 0 } },
          { kind: "point", space: mappable, position: { kind: "index", value: 3 } },
        ],
      }),
    );
    await applied;
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual([
      { kind: "point", space: target, position: { kind: "index", value: 3 } },
    ]);
    expect(diagnostics.join("\n")).toContain("harness.translation.unmapped");
    await harness.disposeAsync();
  });

  it("retires synchronization reflection keys after clear, map, failure, ambiguity, and no-space exits", async () => {
    const source: CoordinateSpace = { id: "source", kind: "index", context: { name: "source" } };
    const target: CoordinateSpace = { id: "target", kind: "index", context: { name: "target" } };
    const alternate: CoordinateSpace = {
      id: "alternate",
      kind: "index",
      context: { name: "alternate" },
    };
    const correlationId = "4fbc14d0-3adb-4e6f-a8c7-4cbd3067a42d";
    const run = async (
      initialSpaces: readonly CoordinateSpace[],
      mapper: CoordinateTranslator["map"],
    ): Promise<{
      readonly commands: string[];
      readonly setSpaces: (spaces: readonly CoordinateSpace[]) => void;
      readonly nextCommand: () => Promise<void>;
      readonly nextDiagnostic: () => Promise<void>;
      readonly publish: (phase?: "set" | "clear") => void;
      readonly dispose: () => Promise<void>;
    }> => {
      const commands: string[] = [];
      const commandWaiters: (() => void)[] = [];
      const diagnosticWaiters: (() => void)[] = [];
      let setSpaces: (spaces: readonly CoordinateSpace[]) => void = () => undefined;
      const harness = createApplicationHarness(
        {
          id: "app",
          components: [
            { id: "source", type: "mock" },
            { id: "target", type: "mock" },
          ],
          synchronization: [{ id: "select", interaction: "select", between: ["source", "target"] }],
        },
        {
          componentFactories: [
            {
              type: "mock",
              create: ({ id }) => ({
                id,
                capabilities: [],
                async start(context) {
                  if (id === "source") {
                    context.translators.register({
                      id: "source-target",
                      source: { kind: "index", context: { name: "source" } },
                      target: { kind: "index" },
                      map: mapper,
                    });
                    return;
                  }
                  setSpaces = context.reportCoordinateSpaces;
                  setSpaces(initialSpaces);
                  context.fabric.observe({ targetComponent: id }).subscribe((entry) => {
                    if (!entry.type.startsWith("interaction.selection.")) return;
                    commands.push(entry.type);
                    commandWaiters.shift()?.();
                  });
                },
                dispose() {},
              }),
            },
          ],
        },
      );
      await harness.start();
      harness.fabric.observe({ types: ["harness.diagnostic"] }).subscribe(() => {
        diagnosticWaiters.shift()?.();
      });
      return {
        commands,
        setSpaces,
        nextCommand: () => new Promise<void>((resolve) => commandWaiters.push(resolve)),
        nextDiagnostic: () => new Promise<void>((resolve) => diagnosticWaiters.push(resolve)),
        publish: (phase = "set") => {
          harness.fabric.publish({
            id: "5fbc14d0-3adb-4e6f-a8c7-4cbd3067a42d",
            type: "interaction.native",
            version: "0.1.0",
            source: { component: "source" },
            correlationId,
            timestamp: "2026-08-19T00:00:00.000Z",
            payload: {
              interactionId: "same-correlation",
              interaction: "select",
              phase,
              origin: { componentId: "source" },
              loci: [{ kind: "point", space: source, position: { kind: "index", value: 1 } }],
            },
          });
        },
        dispose: () => harness.disposeAsync(),
      };
    };
    const mapped = async (request: {
      readonly loci: readonly import("@seq-star/seq-coords").CoordinateLocus[];
      readonly target?: CoordinateSpace;
    }) => ({
      translatorIds: ["source-target"],
      diagnostics: [],
      associations: request.loci.map((locus) => ({
        source: locus,
        targets: [{ ...locus, space: request.target ?? target }],
        status: "exact" as const,
      })),
    });

    const cleared = await run([target], mapped);
    const clearCommand = cleared.nextCommand();
    cleared.publish("clear");
    await clearCommand;
    const clearRetry = cleared.nextCommand();
    cleared.publish();
    await clearRetry;
    expect(cleared.commands).toEqual([
      "interaction.selection.clear",
      "interaction.selection.apply",
    ]);
    await cleared.dispose();

    const succeeded = await run([target], mapped);
    const firstSuccess = succeeded.nextCommand();
    succeeded.publish();
    await firstSuccess;
    await Promise.resolve();
    await Promise.resolve();
    const secondSuccess = succeeded.nextCommand();
    succeeded.publish();
    await secondSuccess;
    expect(succeeded.commands).toEqual([
      "interaction.selection.apply",
      "interaction.selection.apply",
    ]);
    await succeeded.dispose();

    let attempts = 0;
    const failed = await run([target], async (request) => {
      attempts += 1;
      if (attempts === 1) throw new Error("expected failure");
      return mapped(request);
    });
    const failureDiagnostic = failed.nextDiagnostic();
    failed.publish();
    await failureDiagnostic;
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const failureRetry = failed.nextCommand();
    failed.publish();
    await failureRetry;
    expect(failed.commands).toEqual(["interaction.selection.apply"]);
    await failed.dispose();

    const ambiguous = await run([target, alternate], mapped);
    const ambiguityDiagnostic = ambiguous.nextDiagnostic();
    ambiguous.publish();
    await ambiguityDiagnostic;
    ambiguous.setSpaces([target]);
    const ambiguityRetry = ambiguous.nextCommand();
    ambiguous.publish();
    await ambiguityRetry;
    expect(ambiguous.commands).toEqual(["interaction.selection.apply"]);
    await ambiguous.dispose();

    const noSpace = await run([], mapped);
    const noSpaceDiagnostic = noSpace.nextDiagnostic();
    noSpace.publish();
    await noSpaceDiagnostic;
    noSpace.setSpaces([target]);
    const noSpaceRetry = noSpace.nextCommand();
    noSpace.publish();
    await noSpaceRetry;
    expect(noSpace.commands).toEqual(["interaction.selection.apply"]);
    await noSpace.dispose();
  });
});

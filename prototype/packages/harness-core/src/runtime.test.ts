import type { CoordinateSpace, CoordinateTranslator } from "@seq-star/seq-coords";
import { createTableTranslator } from "@seq-star/seq-coords";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import type { ComponentInstanceSpec, HarnessMessage } from "./index.js";
import {
  createApplicationHarness,
  createEventFabric,
  createMessageSchemaRegistry,
  createTranslatorRegistry,
  InteractionEventSchema,
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

  it("does not connect incompatible exact pattern IDs or choose their cheaper path", async () => {
    const source: CoordinateSpace = {
      id: "source",
      kind: "sequence",
      context: { step: "source" },
    };
    const middle: CoordinateSpace = {
      id: "middle-a",
      kind: "sequence",
      context: { step: "middle" },
    };
    const target: CoordinateSpace = { id: "target", kind: "sequence" };
    const translator = (
      id: string,
      input: CoordinateTranslator["source"],
      output: CoordinateTranslator["target"],
      outputSpace: CoordinateSpace,
      cost: number,
    ): CoordinateTranslator => ({
      id,
      source: input,
      target: output,
      cost,
      async map(request) {
        return {
          translatorIds: [id],
          diagnostics: [],
          associations: request.loci.map((locus) => ({
            source: locus,
            targets: [{ ...locus, space: outputSpace }],
            status: "exact" as const,
          })),
        };
      },
    });
    const registry = createTranslatorRegistry();
    registry.register(
      translator(
        "source-middle",
        { id: "source", kind: "sequence", context: { step: "source" } },
        { id: "middle-a", kind: "sequence", context: { step: "middle" } },
        middle,
        1,
      ),
    );
    registry.register(
      translator(
        "wrong-cheap",
        { id: "middle-b", kind: "sequence", context: { step: "middle" } },
        { id: "target", kind: "sequence" },
        target,
        0,
      ),
    );
    registry.register(
      translator(
        "right-expensive",
        { id: "middle-a", kind: "sequence", context: { step: "middle" } },
        { id: "target", kind: "sequence" },
        target,
        5,
      ),
    );
    const paths = registry.findPaths(source, target);
    expect(paths.map((path) => path.translatorIds)).toEqual([["source-middle", "right-expensive"]]);
    const locus = {
      kind: "point" as const,
      space: source,
      position: { kind: "index" as const, value: 0 },
    };
    expect((await registry.map({ loci: [locus], target })).paths[0]?.translatorIds).toEqual([
      "source-middle",
      "right-expensive",
    ]);

    const wildcard = createTranslatorRegistry();
    wildcard.register(
      translator(
        "source-middle",
        { id: "source", kind: "sequence", context: { step: "source" } },
        { id: "middle-a", kind: "sequence", context: { step: "middle" } },
        middle,
        1,
      ),
    );
    wildcard.register(
      translator(
        "unspecified-input",
        { kind: "sequence", context: { step: "middle" } },
        { id: "target", kind: "sequence" },
        target,
        1,
      ),
    );
    expect(wildcard.findPaths(source, target)[0]?.translatorIds).toEqual([
      "source-middle",
      "unspecified-input",
    ]);
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

  it("lets disposal win a deferred initial start without ready or plugin resurrection", async () => {
    let release: (() => void) | undefined;
    let capturedContext: import("./index.js").ComponentContext | undefined;
    let pluginSetups = 0;
    let disposals = 0;
    const states: string[] = [];
    const harness = createApplicationHarness(
      {
        id: "initial-disposal-race",
        components: [{ id: "slow", type: "slow" }],
        plugins: [{ id: "must-not-start", plugin: "must-not-start" }],
      },
      {
        componentFactories: [
          {
            type: "slow",
            create: ({ id }) => ({
              id,
              capabilities: [],
              async start(context) {
                capturedContext = context;
                await new Promise<void>((resolve) => {
                  release = resolve;
                });
              },
              dispose() {
                disposals += 1;
              },
            }),
          },
        ],
        pluginFactories: [
          {
            plugin: "must-not-start",
            create: () => ({
              id: "must-not-start",
              setup() {
                pluginSetups += 1;
              },
            }),
          },
        ],
      },
    );
    harness.components.changes.subscribe((change) => states.push(change.component.status));
    const received: HarnessMessage[] = [];
    harness.fabric.observe().subscribe((entry) => received.push(entry));
    const startup = harness.start();
    await vi.waitFor(() => expect(capturedContext).toBeDefined());
    await harness.disposeAsync();
    const receivedAtDisposal = received.length;
    capturedContext?.reportCapabilities(["late:capability"]);
    capturedContext?.fabric.publish(
      message("lifecycle.visualization", {
        requestId: "late",
        generation: 1,
        componentId: "slow",
        status: "rendered",
        visibleRequestId: "late",
        diagnostics: [],
      }),
    );
    release?.();
    await expect(startup).rejects.toThrow("Harness disposal interrupted startup");
    expect(states).not.toContain("ready");
    expect(harness.components.get("slow")).toBeUndefined();
    expect(pluginSetups).toBe(0);
    expect(disposals).toBe(1);
    expect(received).toHaveLength(receivedAtDisposal);
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
    const space: CoordinateSpace = { id: "shared", kind: "index", length: 6 };
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

  it("replaces components serially without restarting installed plugins", async () => {
    const log: string[] = [];
    let pluginSetups = 0;
    const factory = (type: string) => ({
      type,
      create: ({ id }: { id: string }) => ({
        id,
        capabilities: [],
        async start() {
          log.push(`start:${type}:${id}`);
        },
        async dispose() {
          log.push(`dispose:${type}:${id}`);
        },
      }),
    });
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [{ id: "sequence", type: "reference" }],
        plugins: [{ id: "stable", plugin: "stable" }],
      },
      {
        componentFactories: [factory("reference"), factory("nightingale"), factory("latest")],
        pluginFactories: [
          {
            plugin: "stable",
            create: () => ({
              id: "stable",
              setup() {
                pluginSetups += 1;
              },
            }),
          },
        ],
      },
    );
    await harness.start();
    const outdated = harness.replaceComponents([{ id: "sequence", type: "nightingale" }]);
    const latest = harness.replaceComponents([{ id: "sequence", type: "latest" }]);
    await Promise.all([outdated, latest]);
    expect(log).toEqual([
      "start:reference:sequence",
      "dispose:reference:sequence",
      "start:latest:sequence",
    ]);
    expect(pluginSetups).toBe(1);
    expect(harness.components.get("sequence")).toMatchObject({ type: "latest", status: "ready" });
    await harness.disposeAsync();
  });

  it("rejects malformed replacement descriptors before touching the active component", async () => {
    const log: string[] = [];
    const harness = createApplicationHarness(
      { id: "app", components: [{ id: "sequence", type: "reference" }] },
      {
        componentFactories: [
          {
            type: "reference",
            create: ({ id }) => ({
              id,
              capabilities: [],
              async start() {
                log.push("start:reference");
              },
              dispose() {
                log.push("dispose:reference");
              },
            }),
          },
        ],
      },
    );
    await harness.start();
    const malformed = Object.assign(Object.create(null) as object, {
      id: "sequence",
      type: "reference",
    });
    await expect(
      harness.replaceComponents([malformed as unknown as ComponentInstanceSpec]),
    ).rejects.toThrow("Invalid replacement component specification");
    await expect(
      harness.replaceComponents([
        { id: "sequence", type: "reference", extra: true } as unknown as ComponentInstanceSpec,
      ]),
    ).rejects.toThrow("Invalid replacement component specification");
    expect(log).toEqual(["start:reference"]);
    expect(harness.components.get("sequence")).toMatchObject({ status: "ready" });
    await harness.disposeAsync();
  });

  it("retires the whole outgoing batch and starts nothing when one disposal fails", async () => {
    const log: string[] = [];
    const factory = (type: string, failDispose = false) => ({
      type,
      create: ({ id }: { id: string }) => ({
        id,
        capabilities: [],
        async start() {
          log.push(`start:${type}:${id}`);
        },
        dispose() {
          log.push(`dispose:${type}:${id}`);
          if (failDispose) throw new Error(`dispose failed:${id}`);
        },
      }),
    });
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [
          { id: "left", type: "broken-dispose" },
          { id: "right", type: "reference" },
        ],
      },
      {
        componentFactories: [
          factory("broken-dispose", true),
          factory("reference"),
          factory("nightingale"),
        ],
      },
    );
    await harness.start();
    await expect(
      harness.replaceComponents([
        { id: "left", type: "nightingale" },
        { id: "right", type: "nightingale" },
      ]),
    ).rejects.toThrow("replacement was not started");
    expect(log).toEqual([
      "start:broken-dispose:left",
      "start:reference:right",
      "dispose:broken-dispose:left",
      "dispose:reference:right",
    ]);
    expect(harness.components.get("left")).toBeUndefined();
    expect(harness.components.get("right")).toBeUndefined();
    await harness.disposeAsync();
  });

  it("cleans every partially started batch member when a later replacement start fails", async () => {
    const log: string[] = [];
    const factory = (type: string, failStart = false) => ({
      type,
      create: ({ id }: { id: string }) => ({
        id,
        capabilities: [],
        async start() {
          log.push(`start:${type}:${id}`);
          if (failStart) throw new Error(`start failed:${id}`);
        },
        dispose() {
          log.push(`dispose:${type}:${id}`);
        },
      }),
    });
    const harness = createApplicationHarness(
      { id: "app", components: [] },
      {
        componentFactories: [factory("good"), factory("broken", true)],
      },
    );
    await harness.start();
    await expect(
      harness.replaceComponents([
        { id: "left", type: "good" },
        { id: "right", type: "broken" },
      ]),
    ).rejects.toThrow("Component replacement failed");
    expect(log).toEqual([
      "start:good:left",
      "start:broken:right",
      "dispose:broken:right",
      "dispose:good:left",
    ]);
    expect(harness.components.get("left")).toBeUndefined();
    expect(harness.components.get("right")).toBeUndefined();
    await harness.disposeAsync();
  });

  it("never reports a replacement ready when harness disposal races its start", async () => {
    let release: (() => void) | undefined;
    const log: string[] = [];
    const harness = createApplicationHarness(
      { id: "app", components: [] },
      {
        componentFactories: [
          {
            type: "slow",
            create: ({ id }) => ({
              id,
              capabilities: [],
              async start() {
                log.push("start");
                await new Promise<void>((resolve) => {
                  release = resolve;
                });
                log.push("start-resolved");
              },
              dispose() {
                log.push("dispose");
              },
            }),
          },
        ],
      },
    );
    await harness.start();
    const states: string[] = [];
    harness.components.changes.subscribe((change) => states.push(change.component.status));
    const replacement = harness.replaceComponents([{ id: "sequence", type: "slow" }]);
    await vi.waitFor(() => expect(log).toContain("start"));
    const disposal = harness.disposeAsync();
    release?.();
    await expect(replacement).rejects.toThrow("Component replacement failed");
    await disposal;
    expect(states).not.toContain("ready");
    expect(log).toEqual(["start", "start-resolved", "dispose"]);
  });

  it("clears only reflected selection ownership when its source is replaced", async () => {
    const space: CoordinateSpace = { id: "shared", kind: "index", length: 6 };
    const commands: string[] = [];
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [
          { id: "source", type: "mock" },
          { id: "peer", type: "mock" },
        ],
        synchronization: [{ id: "select", interaction: "select", between: ["source", "peer"] }],
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
    harness.fabric.publish(
      message("interaction.native", {
        interactionId: "selection-source",
        interaction: "select",
        phase: "set",
        origin: { componentId: "source" },
        loci: [{ kind: "point", space, position: { kind: "index", value: 1 } }],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await harness.replaceComponents([{ id: "source", type: "mock" }]);
    expect(commands).toEqual([
      "peer:interaction.selection.apply",
      "peer:interaction.selection.clear",
    ]);
    await harness.disposeAsync();
  });

  it("retires an exact selection lease when its reflected destination is replaced", async () => {
    const space: CoordinateSpace = { id: "shared", kind: "index", length: 6 };
    const applied = new Map<string, Set<string>>();
    const nativeSelected = new Map([
      ["source", true],
      ["other-source", true],
    ]);
    const clears: Array<{ readonly target: string; readonly owner: string }> = [];
    let nativeMessages = 0;
    const ownerKey = (owner: {
      readonly correlationId: string;
      readonly sourceComponent: string;
    }) => `${owner.sourceComponent}:${owner.correlationId}`;
    const harness = createApplicationHarness(
      {
        id: "destination-retirement",
        components: [
          { id: "source", type: "mock" },
          { id: "destination", type: "mock" },
          { id: "peer", type: "mock" },
          { id: "other-source", type: "mock" },
        ],
        synchronization: [
          {
            id: "main-selection",
            interaction: "select",
            between: ["source", "destination", "peer"],
          },
          {
            id: "unrelated-selection",
            interaction: "select",
            between: ["other-source", "peer"],
          },
        ],
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
                context.fabric.observe({ targetComponent: id }).subscribe((entry) => {
                  const payload = entry.payload as unknown as {
                    readonly interactionId?: string;
                    readonly owner?: {
                      readonly correlationId: string;
                      readonly sourceComponent: string;
                    };
                  };
                  if (payload.owner === undefined) return;
                  const key = ownerKey(payload.owner);
                  const owners = applied.get(id) ?? new Set<string>();
                  if (entry.type === "interaction.selection.apply") owners.add(key);
                  if (entry.type === "interaction.selection.clear") {
                    owners.delete(key);
                    clears.push({ target: id, owner: key });
                    if (payload.owner.sourceComponent === id) nativeSelected.set(id, false);
                  }
                  applied.set(id, owners);
                });
              },
              dispose() {},
            }),
          },
        ],
      },
    );
    harness.fabric
      .messages("interaction.native", payloadSchema(InteractionEventSchema))
      .subscribe(() => nativeMessages++);
    await harness.start();
    const publishNativeSelection = (source: string, interactionId: string): void =>
      harness.fabric.publish(
        message("interaction.native", {
          interactionId,
          interaction: "select",
          phase: "set",
          origin: { componentId: source },
          loci: [{ kind: "point", space, position: { kind: "index", value: 1 } }],
        }),
      );
    publishNativeSelection("other-source", "unrelated");
    publishNativeSelection("source", "main");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const unrelatedOwner = [...(applied.get("peer") ?? [])].find((key) =>
      key.startsWith("other-source:"),
    );
    expect(unrelatedOwner).toBeDefined();
    await harness.replaceComponents([{ id: "destination", type: "mock" }]);
    expect(nativeSelected.get("source")).toBe(false);
    expect(nativeSelected.get("other-source")).toBe(true);
    expect(applied.get("peer")).toEqual(new Set([unrelatedOwner]));
    expect(clears.map((entry) => entry.target).sort()).toEqual(["peer", "source"]);
    expect(nativeMessages).toBe(2);
    await harness.disposeAsync();
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

  it("replaces one synchronized native hover lease without disturbing unrelated owners", async () => {
    const space: CoordinateSpace = { id: "shared", kind: "index", length: 4 };
    type OwnedState = {
      readonly interactionId: string;
      readonly positions: readonly number[];
    };
    const highlights = new Map<string, OwnedState>();
    const selections = new Map<string, OwnedState>();
    const received: HarnessMessage[] = [];
    const ownerKey = (owner: { correlationId: string; sourceComponent: string }): string =>
      `${owner.correlationId}\u0000${owner.sourceComponent}`;
    const applyCommand = (entry: HarnessMessage): void => {
      const command = entry.payload as unknown as {
        interactionId: string;
        owner: { correlationId: string; sourceComponent: string };
        mode: "replace" | "add" | "remove" | "toggle";
        loci: readonly { position: { value: number } }[];
      };
      const state = entry.type.startsWith("interaction.highlight") ? highlights : selections;
      const key = ownerKey(command.owner);
      const previous = state.get(key);
      const incoming = command.loci.map((locus) => locus.position.value);
      if (command.mode === "replace")
        state.set(key, { interactionId: command.interactionId, positions: incoming });
      else if (command.mode === "add")
        state.set(key, {
          interactionId: command.interactionId,
          positions: [...new Set([...(previous?.positions ?? []), ...incoming])],
        });
      else if (command.mode === "remove") {
        const positions = (previous?.positions ?? []).filter(
          (position) => !incoming.includes(position),
        );
        if (positions.length === 0) state.delete(key);
        else state.set(key, { interactionId: command.interactionId, positions });
      }
    };
    const clearCommand = (entry: HarnessMessage): void => {
      const command = entry.payload as unknown as {
        interactionId?: string;
        owner: { correlationId: string; sourceComponent: string };
      };
      const state = entry.type.startsWith("interaction.highlight") ? highlights : selections;
      const key = ownerKey(command.owner);
      const current = state.get(key);
      if (
        current !== undefined &&
        (command.interactionId === undefined || command.interactionId === current.interactionId)
      )
        state.delete(key);
    };
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [
          { id: "molstar", type: "mock" },
          { id: "sequence", type: "mock" },
        ],
        synchronization: [
          { id: "hover", interaction: "hover", between: ["molstar", "sequence"] },
          { id: "select", interaction: "select", between: ["molstar", "sequence"] },
        ],
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
                if (id !== "sequence") return;
                context.fabric.observe({ targetComponent: id }).subscribe((entry) => {
                  if (!entry.type.startsWith("interaction.")) return;
                  received.push(entry);
                  if (entry.type.endsWith(".apply")) applyCommand(entry);
                  else if (entry.type.endsWith(".clear")) clearCommand(entry);
                });
              },
              dispose() {},
            }),
          },
        ],
      },
    );
    await harness.start();
    const point = (position: number) => ({
      kind: "point" as const,
      space,
      position: { kind: "index" as const, value: position },
    });
    const unrelatedOwner = {
      correlationId: crypto.randomUUID(),
      sourceComponent: "external",
    };
    harness.fabric.publish(
      message(
        "interaction.highlight.apply",
        {
          interactionId: "external-highlight",
          owner: unrelatedOwner,
          mode: "replace",
          loci: [point(5)],
        },
        { component: "sequence" },
      ),
    );
    const native = (
      interaction: "hover" | "select",
      phase: "set" | "clear",
      positions: readonly number[],
      options: {
        readonly correlationId: string;
        readonly interactionId: string;
        readonly mode?: "replace" | "add" | "remove";
      },
    ): void => {
      const id = crypto.randomUUID();
      harness.fabric.publish({
        id,
        type: "interaction.native",
        version: "0.1.0",
        source: { component: "molstar" },
        correlationId: options.correlationId,
        timestamp: "2026-08-20T00:00:00.000Z",
        payload: {
          interactionId: options.interactionId,
          interaction,
          phase,
          ...(options.mode === undefined ? {} : { mode: options.mode }),
          origin: { componentId: "molstar" },
          loci: positions.map(point),
        },
      });
    };
    const hoverLease = {
      correlationId: crypto.randomUUID(),
      interactionId: crypto.randomUUID(),
    };
    native("hover", "set", [0], hoverLease);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...highlights.values()].map((state) => state.positions)).toEqual([[5], [0]]);

    native("hover", "set", [2], hoverLease);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...highlights.values()].map((state) => state.positions)).toEqual([[5], [2]]);

    const replacementHoverLease = {
      correlationId: crypto.randomUUID(),
      interactionId: crypto.randomUUID(),
    };
    native("hover", "set", [1], replacementHoverLease);
    const currentHoverLease = {
      correlationId: crypto.randomUUID(),
      interactionId: crypto.randomUUID(),
    };
    native("hover", "set", [4], currentHoverLease);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect([...highlights.values()].map((state) => state.positions)).toEqual([[5], [4]]);
    const reflectedHighlights = received.filter(
      (entry) =>
        entry.type === "interaction.highlight.apply" &&
        (entry.payload as unknown as { owner: { sourceComponent: string } }).owner
          .sourceComponent === "molstar",
    );
    expect(reflectedHighlights).toHaveLength(3);
    expect(
      new Set(
        reflectedHighlights.map(
          (entry) =>
            (entry.payload as unknown as { owner: { correlationId: string } }).owner.correlationId,
        ),
      ).size,
    ).toBe(1);
    expect(
      new Set(
        reflectedHighlights.map(
          (entry) => (entry.payload as unknown as { interactionId: string }).interactionId,
        ),
      ).size,
    ).toBe(1);

    native("hover", "clear", [], {
      correlationId: crypto.randomUUID(),
      interactionId: crypto.randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    // An older source's clear is not allowed to erase the later resident hover.
    expect([...highlights.values()].map((state) => state.positions)).toEqual([[5], [4]]);

    native("hover", "clear", [], currentHoverLease);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...highlights.values()].map((state) => state.positions)).toEqual([[5]]);

    const selectionLease = {
      correlationId: crypto.randomUUID(),
      interactionId: crypto.randomUUID(),
    };
    native("select", "set", [0], { ...selectionLease, mode: "replace" });
    native("select", "set", [1], { ...selectionLease, mode: "add" });
    native("select", "set", [0], { ...selectionLease, mode: "remove" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...selections.values()].map((state) => state.positions)).toEqual([[1]]);
    expect(
      received
        .filter((entry) => entry.type === "interaction.selection.apply")
        .map((entry) => (entry.payload as unknown as { mode: string }).mode),
    ).toEqual(["replace", "add", "remove"]);

    native("select", "clear", [], selectionLease);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(selections.size).toBe(0);
    await harness.disposeAsync();
  });

  it("retires the resident hover when ownership transfers between renderers", async () => {
    const space: CoordinateSpace = { id: "shared", kind: "index", length: 4 };
    const marks = new Map<string, number>();
    const commands: string[] = [];
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [
          { id: "molstar", type: "mock" },
          { id: "sequence", type: "mock" },
        ],
        synchronization: [{ id: "hover", interaction: "hover", between: ["molstar", "sequence"] }],
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
                context.fabric.observe({ targetComponent: id }).subscribe((entry) => {
                  if (!entry.type.startsWith("interaction.highlight")) return;
                  const payload = entry.payload as unknown as {
                    readonly loci?: readonly { readonly position: { readonly value: number } }[];
                  };
                  commands.push(`${id}:${entry.type}`);
                  if (entry.type.endsWith(".clear")) marks.delete(id);
                  else if (payload.loci?.[0]) marks.set(id, payload.loci[0].position.value);
                });
              },
              dispose() {},
            }),
          },
        ],
      },
    );
    await harness.start();
    const publish = (origin: "molstar" | "sequence", position: number, interactionId: string) =>
      harness.fabric.publish(
        message("interaction.native", {
          interactionId,
          interaction: "hover",
          phase: "set",
          origin: { componentId: origin },
          loci: [{ kind: "point", space, position: { kind: "index", value: position } }],
        }),
      );
    publish("molstar", 0, "molstar-a");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(marks).toEqual(new Map([["sequence", 0]]));
    publish("sequence", 2, "sequence-b");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(marks).toEqual(new Map([["molstar", 2]]));
    expect(commands).toEqual([
      "sequence:interaction.highlight.apply",
      "sequence:interaction.highlight.clear",
      "molstar:interaction.highlight.apply",
    ]);
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

  it("unions independently resolved barnase and barstar loci into one destination command", async () => {
    const barnase: CoordinateSpace = {
      id: "P00648",
      kind: "sequence",
      context: { role: "barnase" },
    };
    const barstar: CoordinateSpace = {
      id: "P11540",
      kind: "sequence",
      context: { role: "barstar" },
    };
    const missing: CoordinateSpace = { id: "missing", kind: "sequence" };
    const chainA: CoordinateSpace = {
      id: "1BRS-A",
      kind: "structure",
      context: { chain: "A" },
    };
    const chainD: CoordinateSpace = {
      id: "1BRS-D",
      kind: "structure",
      context: { chain: "D" },
    };
    const commands: HarnessMessage[] = [];
    const diagnostics: string[] = [];
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [
          { id: "sequence", type: "mock" },
          { id: "structure", type: "mock" },
        ],
        synchronization: [
          { id: "contact", interaction: "select", between: ["sequence", "structure"] },
        ],
      },
      {
        componentFactories: [
          {
            type: "mock",
            create: ({ id }) => ({
              id,
              capabilities: [],
              async start(context) {
                if (id === "sequence") {
                  for (const [translatorId, source, target] of [
                    ["barnase-to-a", barnase, chainA],
                    ["barstar-to-d", barstar, chainD],
                  ] as const)
                    context.translators.register({
                      id: translatorId,
                      source: { kind: "sequence", context: { role: source.context?.role ?? "" } },
                      target: {
                        kind: "structure",
                        context: { chain: target.context?.chain ?? "" },
                      },
                      async map(request) {
                        return {
                          translatorIds: [translatorId],
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
                context.reportCoordinateSpaces([chainA, chainD]);
                context.fabric.observe({ targetComponent: id }).subscribe((entry) => {
                  if (entry.type === "interaction.selection.apply") commands.push(entry);
                });
              },
              dispose() {},
            }),
          },
        ],
      },
    );
    await harness.start();
    harness.fabric
      .observe({ types: ["harness.diagnostic"] })
      .subscribe((entry) => diagnostics.push(JSON.stringify(entry.payload)));
    harness.fabric.publish(
      message("interaction.native", {
        interactionId: "barnase-barstar-contact",
        interaction: "select",
        phase: "set",
        origin: { componentId: "sequence" },
        loci: [
          { kind: "point", space: barnase, position: { kind: "index", value: 39 } },
          { kind: "point", space: barstar, position: { kind: "index", value: 27 } },
          { kind: "point", space: missing, position: { kind: "index", value: 1 } },
        ],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(commands).toHaveLength(1);
    const firstCommand = commands[0];
    if (firstCommand === undefined) throw new Error("Expected a synchronized selection command.");
    expect(
      (firstCommand.payload as { loci: readonly { space: CoordinateSpace }[] }).loci.map(
        (locus) => locus.space.id,
      ),
    ).toEqual(["1BRS-A", "1BRS-D"]);
    expect(diagnostics.join("\n")).toContain("harness.translation.unmapped");
    await harness.disposeAsync();
  });

  it("diagnoses one ambiguous locus without dropping a separately resolvable contact endpoint", async () => {
    const unique: CoordinateSpace = { id: "unique", kind: "sequence", context: { role: "unique" } };
    const ambiguous: CoordinateSpace = {
      id: "ambiguous",
      kind: "sequence",
      context: { role: "ambiguous" },
    };
    const chainA: CoordinateSpace = { id: "A", kind: "structure", context: { chain: "A" } };
    const chainD: CoordinateSpace = { id: "D", kind: "structure", context: { chain: "D" } };
    const commands: HarnessMessage[] = [];
    const diagnostics: string[] = [];
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [
          { id: "sequence", type: "mock" },
          { id: "structure", type: "mock" },
        ],
        synchronization: [
          { id: "select", interaction: "select", between: ["sequence", "structure"] },
        ],
      },
      {
        componentFactories: [
          {
            type: "mock",
            create: ({ id }) => ({
              id,
              capabilities: [],
              async start(context) {
                if (id === "sequence") {
                  const register = (
                    translatorId: string,
                    source: CoordinateSpace,
                    target: CoordinateSpace,
                  ) =>
                    context.translators.register({
                      id: translatorId,
                      source: { kind: "sequence", context: { role: source.context?.role ?? "" } },
                      target: {
                        kind: "structure",
                        context: { chain: target.context?.chain ?? "" },
                      },
                      async map(request) {
                        return {
                          translatorIds: [translatorId],
                          diagnostics: [],
                          associations: request.loci.map((locus) => ({
                            source: locus,
                            targets: [{ ...locus, space: target }],
                            status: "exact" as const,
                          })),
                        };
                      },
                    });
                  register("unique-a", unique, chainA);
                  register("ambiguous-a", ambiguous, chainA);
                  register("ambiguous-d", ambiguous, chainD);
                  return;
                }
                context.reportCoordinateSpaces([chainA, chainD]);
                context.fabric.observe({ targetComponent: id }).subscribe((entry) => {
                  if (entry.type === "interaction.selection.apply") commands.push(entry);
                });
              },
              dispose() {},
            }),
          },
        ],
      },
    );
    await harness.start();
    harness.fabric
      .observe({ types: ["harness.diagnostic"] })
      .subscribe((entry) => diagnostics.push(JSON.stringify(entry.payload)));
    harness.fabric.publish(
      message("interaction.native", {
        interactionId: "partially-ambiguous-contact",
        interaction: "select",
        phase: "set",
        origin: { componentId: "sequence" },
        loci: [
          { kind: "point", space: unique, position: { kind: "index", value: 2 } },
          { kind: "point", space: ambiguous, position: { kind: "index", value: 4 } },
        ],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(commands).toHaveLength(1);
    const firstCommand = commands[0];
    if (firstCommand === undefined) throw new Error("Expected a synchronized selection command.");
    expect(
      (firstCommand.payload as { loci: readonly { space: CoordinateSpace }[] }).loci.map(
        (locus) => locus.space.id,
      ),
    ).toEqual(["A"]);
    expect(diagnostics.join("\n")).toContain("harness.translation.ambiguous");
    await harness.disposeAsync();
  });

  it("aborts every grouped hover mapper on disposal and never publishes their late union", async () => {
    const barnase: CoordinateSpace = {
      id: "barnase",
      kind: "sequence",
      context: { role: "barnase" },
    };
    const barstar: CoordinateSpace = {
      id: "barstar",
      kind: "sequence",
      context: { role: "barstar" },
    };
    const chainA: CoordinateSpace = { id: "A", kind: "structure", context: { chain: "A" } };
    const chainD: CoordinateSpace = { id: "D", kind: "structure", context: { chain: "D" } };
    const signals: AbortSignal[] = [];
    const deferred: (() => void)[] = [];
    const commands: string[] = [];
    let startedResolve: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    const harness = createApplicationHarness(
      {
        id: "app",
        components: [
          { id: "sequence", type: "mock" },
          { id: "structure", type: "mock" },
        ],
        synchronization: [
          { id: "hover", interaction: "hover", between: ["sequence", "structure"] },
        ],
      },
      {
        componentFactories: [
          {
            type: "mock",
            create: ({ id }) => ({
              id,
              capabilities: [],
              async start(context) {
                if (id === "sequence") {
                  for (const [translatorId, source, target] of [
                    ["barnase-a", barnase, chainA],
                    ["barstar-d", barstar, chainD],
                  ] as const)
                    context.translators.register({
                      id: translatorId,
                      source: { kind: "sequence", context: { role: source.context?.role ?? "" } },
                      target: {
                        kind: "structure",
                        context: { chain: target.context?.chain ?? "" },
                      },
                      map(request, signal) {
                        signals.push(signal);
                        if (signals.length === 2) startedResolve?.();
                        return new Promise((resolve) => {
                          deferred.push(() =>
                            resolve({
                              translatorIds: [translatorId],
                              diagnostics: [],
                              associations: request.loci.map((locus) => ({
                                source: locus,
                                targets: [{ ...locus, space: target }],
                                status: "exact" as const,
                              })),
                            }),
                          );
                        });
                      },
                    });
                  return;
                }
                context.reportCoordinateSpaces([chainA, chainD]);
                context.fabric.observe({ targetComponent: id }).subscribe((entry) => {
                  if (entry.type.startsWith("interaction.highlight.")) commands.push(entry.type);
                });
              },
              dispose() {},
            }),
          },
        ],
      },
    );
    await harness.start();
    harness.fabric.publish(
      message("interaction.native", {
        interactionId: "slow-contact",
        interaction: "hover",
        phase: "set",
        origin: { componentId: "sequence" },
        loci: [
          { kind: "point", space: barnase, position: { kind: "index", value: 10 } },
          { kind: "point", space: barstar, position: { kind: "index", value: 11 } },
        ],
      }),
    );
    await started;
    await harness.disposeAsync();
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    for (const resolve of deferred) resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(commands).toEqual([]);
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

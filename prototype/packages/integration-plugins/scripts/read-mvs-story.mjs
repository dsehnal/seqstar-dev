#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeMsgPack } from "molstar/lib/mol-io/common/msgpack/decode.js";
import { Task } from "molstar/lib/mol-task/index.js";
import { inflate } from "molstar/lib/mol-util/zip/zip.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultInput = resolve(scriptDirectory, "../../../spec/mvs-features.msgpack");

const usage = `Usage: pnpm run inspect:mvs-story -- [options] [input]

Decode a deflated MolViewStory MessagePack container with the pinned Mol* package.

Options:
  --scene <key|index>  Print one scene, including its Markdown and JavaScript.
  --json               Print the complete decoded container as JSON.
                       Embedded Uint8Array assets are encoded as base64.
  --output <path>      Write output to a file instead of stdout.
  --help               Show this help.

The default input is prototype/spec/mvs-features.msgpack.
`;

const parseArguments = (values) => {
  const result = { input: defaultInput, json: false, output: undefined, scene: undefined };
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (value === "--") continue;
    if (value === "--help") return { ...result, help: true };
    if (value === "--json") {
      result.json = true;
      continue;
    }
    if (value === "--scene" || value === "--output") {
      const argument = values[++index];
      if (argument === undefined) throw new Error(`${value} requires an argument.`);
      if (value === "--scene") result.scene = argument;
      else result.output = resolve(process.cwd(), argument);
      continue;
    }
    if (value.startsWith("-")) throw new Error(`Unknown option '${value}'.`);
    result.input = resolve(process.cwd(), value);
  }
  return result;
};

const isRecord = (value) => typeof value === "object" && value !== null;

export const decodeMvsStory = async (input) => {
  const compressed = new Uint8Array(await readFile(input));
  const inflated = await Task.create("Inflate Story Data", async (context) =>
    inflate(
      context,
      new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength),
    ),
  ).run();
  const decoded = decodeMsgPack(
    new Uint8Array(inflated.buffer, inflated.byteOffset, inflated.byteLength),
  );
  if (!isRecord(decoded)) throw new Error("Decoded story container is not an object.");
  if (decoded.version !== 1) throw new Error(`Unsupported story version: ${decoded.version}`);
  if (!isRecord(decoded.story) || !Array.isArray(decoded.story.scenes))
    throw new Error("Decoded version 1 container has no story scenes.");
  return {
    compressedBytes: compressed.byteLength,
    container: decoded,
    inflatedBytes: inflated.byteLength,
  };
};

const bytes = (value) => `${new Intl.NumberFormat("en").format(value)} bytes`;
const firstHeading = (description) =>
  typeof description === "string" ? /^#{1,6}\s+(.+)$/mu.exec(description)?.[1] : undefined;

const summary = ({ compressedBytes, container, inflatedBytes }, input) => {
  const story = container.story;
  const title = isRecord(story.metadata) ? story.metadata.title : undefined;
  const lines = [
    `# ${typeof title === "string" ? title : "MolViewStory"}`,
    "",
    `- Source: ${input}`,
    `- Container version: ${container.version}`,
    `- Compressed: ${bytes(compressedBytes)}`,
    `- Inflated: ${bytes(inflatedBytes)}`,
    `- Scenes: ${story.scenes.length}`,
    `- Assets: ${Array.isArray(story.assets) ? story.assets.length : 0}`,
    "",
    "## Scenes",
    "",
  ];
  story.scenes.forEach((scene, index) => {
    if (!isRecord(scene)) return;
    const key = typeof scene.key === "string" && scene.key.length > 0 ? scene.key : "(no key)";
    const header =
      typeof scene.header === "string"
        ? scene.header
        : (firstHeading(scene.description) ?? "Untitled scene");
    lines.push(`- ${index}: \`${key}\` — ${header}`);
  });
  if (Array.isArray(story.assets) && story.assets.length > 0) {
    lines.push("", "## Embedded assets", "");
    for (const asset of story.assets) {
      if (!isRecord(asset)) continue;
      const size = asset.content instanceof Uint8Array ? asset.content.byteLength : 0;
      lines.push(`- ${String(asset.name ?? "unnamed")} — ${bytes(size)}`);
    }
  }
  return `${lines.join("\n")}\n`;
};

const json = (value) =>
  `${JSON.stringify(
    value,
    (_key, nested) =>
      nested instanceof Uint8Array
        ? {
            type: "Uint8Array",
            encoding: "base64",
            byteLength: nested.byteLength,
            data: Buffer.from(nested).toString("base64"),
          }
        : nested,
    2,
  )}\n`;

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage);
    return;
  }
  const decoded = await decodeMvsStory(options.input);
  let output;
  if (options.scene !== undefined) {
    const scenes = decoded.container.story.scenes;
    const numeric = /^\d+$/u.test(options.scene) ? Number(options.scene) : undefined;
    const scene =
      numeric === undefined
        ? scenes.find((candidate) => isRecord(candidate) && candidate.key === options.scene)
        : scenes[numeric];
    if (scene === undefined) throw new Error(`Unknown scene '${options.scene}'.`);
    output = json(scene);
  } else if (options.json) {
    output = json(decoded.container);
  } else {
    output = summary(decoded, options.input);
  }
  if (options.output === undefined) process.stdout.write(output);
  else await writeFile(options.output, output, "utf8");
};

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((reason) => {
    process.stderr.write(`${reason instanceof Error ? reason.message : String(reason)}\n`);
    process.exitCode = 1;
  });

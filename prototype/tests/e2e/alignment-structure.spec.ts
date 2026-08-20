import { expect, type Locator, test } from "@playwright/test";

test("loads the offline PF00042.29 alignment / 1A3N structure case", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/alignment-structure");
  await expect(page).toHaveURL(/#\/alignment-structure$/u);
  await expect(page.getByTestId("p60-harness-status")).toContainText("ready", { timeout: 20_000 });
  await expect(
    page.getByTestId("pf00042-alignment-host").locator('[data-seq-viewer="canvas"]'),
  ).toBeVisible();
  await expect(page.getByTestId("p69905-structure-host").getByRole("combobox")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("p60-mapping-summary")).toContainText("118 columns");
  expect(external).toEqual([]);
});

test("keeps the query member identity stable while its row scrolls out and back in", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/alignment-structure");
  await expect(page.getByTestId("p60-harness-status")).toContainText("ready", { timeout: 20_000 });
  await expect(page.getByTestId("p69905-structure-host").getByRole("combobox")).toBeVisible({
    timeout: 20_000,
  });

  const host = page.getByTestId("pf00042-alignment-host");
  await host.evaluate((element) => {
    Object.assign((element as HTMLElement).style, {
      height: "240px",
      minHeight: "240px",
      maxHeight: "240px",
    });
  });
  const root = host.locator('[data-seq-viewer="root"]');
  const canvas = host.locator('[data-seq-viewer="canvas"]');
  await expect.poll(() => root.evaluate((element) => element.clientHeight)).toBeLessThan(300);
  const queryMember = host.getByRole("button", {
    name: "Activate track PF00042.29 members · HBA_HUMAN-27-137:member",
  });
  await expect(queryMember).toBeInViewport();
  const stableLabel = await queryMember.getAttribute("aria-label");

  await canvas.evaluate((element) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: box.left + 160,
        clientY: box.top + 34,
      }),
    );
  });
  const paths = page.getByTestId("p60-composed-paths");
  await expect(paths).toContainText("PF00042.29 · HBA_HUMAN-27-137:member");
  await expect(paths).toContainText("alignment-to-structure · hover · exact");
  await expect(paths).toContainText(
    "p60.PF00042.29.column-to-HBA_HUMAN-27-137:member -> p60.P69905.sequence-to-1A3N-chain-A",
  );

  const scrollMetrics = await root.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return { top: element.scrollTop, height: element.clientHeight, total: element.scrollHeight };
  });
  expect(scrollMetrics.total).toBeGreaterThan(scrollMetrics.height);
  expect(scrollMetrics.top).toBeGreaterThan(0);
  await expect(queryMember).not.toBeInViewport();

  await root.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(queryMember).toBeInViewport();
  await expect(queryMember).toHaveAttribute("aria-label", stableLabel ?? "");
  await canvas.evaluate((element) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: box.left + 160,
        clientY: box.top + 34,
      }),
    );
  });
  await expect(
    paths.locator("li").filter({
      hasText: /PF00042\.29 · HBA_HUMAN-27-137:member .* hover · exact/u,
    }),
  ).toHaveCount(3);
  expect(external).toEqual([]);
});

test("renders the checked 32×118 fixture faithfully in Nightingale mode", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/alignment-structure?renderer=nightingale");
  await expect(page.getByTestId("renderer-chooser-status")).toContainText(
    "nightingale renderer ready",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("p60-harness-status")).toContainText("ready", { timeout: 20_000 });

  const host = page.getByTestId("pf00042-alignment-host");
  const root = host.locator('[data-seqstar-nightingale="root"]');
  await expect(root).toBeVisible();
  const queryId = "HBA_HUMAN-27-137:member";
  const nonQueryId = "A0A010R001_9PEZI-27-134:member";
  const query = root.locator(`section[data-seqstar-alignment-member="${queryId}"]`);
  const nonQuery = root.locator(`section[data-seqstar-alignment-member="${nonQueryId}"]`);
  await expect(root.locator("section[data-seqstar-alignment-member]")).toHaveCount(32);
  await expect(query).toHaveCount(1);
  await expect(nonQuery).toHaveCount(1);
  await expect(query.getByRole("button", { name: "Show P69905 / 1A3N chain A in 3D" })).toHaveCount(
    1,
  );
  await expect(nonQuery.getByRole("button", { name: /Show .* in 3D/u })).toHaveCount(0);
  await expect(
    root
      .locator("section[data-seqstar-alignment-member]")
      .getByRole("button", { name: /Show .* in 3D/u }),
  ).toHaveCount(4);

  const rows = await root
    .locator("nightingale-sequence[data-seqstar-alignment]")
    .evaluateAll((elements) =>
      elements.map((element) => ({
        member: (element as HTMLElement).dataset.seqstarAlignmentMember,
        alignment: (element as HTMLElement).dataset.seqstarAlignment,
        sequence: (element as HTMLElement & { sequence?: string }).sequence,
      })),
    );
  expect(rows).toHaveLength(32);
  expect(rows.every((row) => row.alignment === "PF00042.29" && row.sequence?.length === 118)).toBe(
    true,
  );
  expect(rows.find((row) => row.member === queryId)?.sequence).toBe(
    "AEALERMFLSFPTTKTYFPHF----DLSHGSAQVKGHGKKVADALTNAVAHVDDMP---NALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVL",
  );
  expect(rows.find((row) => row.member === nonQueryId)?.sequence).toBe(
    "--FYANMLRAHPELHDHFNK-----VNQANGRQPRALTGVILSF----AANLNHISELIPKLERMCNKHC-SLGILPEHYDIVGKYLIQAFGQVLGPAMTPEIREAWTKAYWILAK--",
  );

  const emit = async (row: Locator, column: number) =>
    row.locator("nightingale-sequence").evaluate(
      (element, start) =>
        (
          element as HTMLElement & {
            emitSeqstarInteraction(value: {
              kind: "hover";
              phase: "set";
              regions: readonly { start: number; end: number }[];
            }): void;
          }
        ).emitSeqstarInteraction({
          kind: "hover",
          phase: "set",
          regions: [{ start, end: start }],
        }),
      column,
    );
  const paths = page.getByTestId("p60-composed-paths");
  await emit(query, 1);
  await expect(paths).toContainText(
    "HBA_HUMAN-27-137:member · alignment-to-structure · hover · exact",
  );
  await emit(query, 22); // Checked query gap column: it has no member or structure locus.
  await expect(paths).toContainText(
    "HBA_HUMAN-27-137:member · alignment-to-structure · hover · unmapped · 0 targets",
  );
  await emit(nonQuery, 1);
  await expect(paths).toContainText(
    "A0A010R001_9PEZI-27-134:member · alignment-to-structure · hover · unmapped · 0 targets",
  );
  expect(external).toEqual([]);
});

test("profile tracks, member actions, and show-all publish checked local structure states", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/alignment-structure");
  await expect(page.getByTestId("p60-harness-status")).toContainText("ready", { timeout: 20_000 });
  const referenceHost = page.getByTestId("pf00042-alignment-host");
  await expect(
    referenceHost.locator("button[data-seq-viewer-alignment-member]:not(:disabled)"),
  ).toHaveCount(4);
  await expect(
    referenceHost.locator("button[data-seq-viewer-alignment-member]:disabled"),
  ).toHaveCount(28);
  const referenceMemberAction = referenceHost.getByRole("button", {
    name: "Show P02197 AlphaFold DB v6 in 3D",
  });
  await expect(referenceMemberAction).toHaveAttribute(
    "data-seq-viewer-alignment-member",
    "MYG_CHICK-27-143:member",
  );
  await referenceMemberAction.click();
  await expect(page.getByTestId("m50-action-payload")).toHaveText(
    '{"kind":"member","memberId":"MYG_CHICK-27-143:member","requestId":"M50-member-1"}',
  );
  await expect(page.getByTestId("m50-structure-state")).toHaveText("M50-member-1");
  const profile = page.getByRole("button", { name: "Activate track Consensus" });
  await profile.click();
  await expect(page.getByTestId("m50-action-summary")).toHaveText("Profile: consensus");
  await expect(page.getByTestId("m50-structure-state")).toHaveText("M50-profile-2");
  await page.getByRole("button", { name: "Activate track Conservation" }).click();
  await expect(page.getByTestId("m50-action-summary")).toHaveText("Profile: conservation");
  await expect(page.getByTestId("m50-structure-state")).toHaveText("M50-profile-3");
  await page.getByRole("button", { name: "Activate track Subgroup annotations" }).click();
  await expect(page.getByTestId("m50-action-summary")).toHaveText("Profile: subgroup");
  await expect(page.getByTestId("m50-structure-state")).toHaveText("M50-profile-4");
  await page.getByRole("button", { name: "Show all checked structures" }).click();
  await expect(page.getByTestId("m50-action-summary")).toHaveText("All four checked structures");
  await expect(page.getByTestId("m50-structure-state")).toHaveText("M50-show-all-5");
  expect(external).toEqual([]);
});

test("Nightingale member interactions fail closed, then target the loaded predicted model", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && !["127.0.0.1", "localhost"].includes(url.hostname))
      external.push(request.url());
  });
  await page.goto("/#/alignment-structure?renderer=nightingale");
  await expect(page.getByTestId("renderer-chooser-status")).toContainText(
    "nightingale renderer ready",
    { timeout: 20_000 },
  );
  const predictedRow = page
    .getByTestId("pf00042-alignment-host")
    .locator(
      'section[data-seqstar-alignment-member="MYG_CHICK-27-143:member"] nightingale-sequence',
    );
  const emitPredicted = async (kind: "hover" | "select", phase: "set" | "clear", start: number) =>
    predictedRow.evaluate(
      (element, interaction) =>
        (
          element as HTMLElement & {
            emitSeqstarInteraction(value: {
              kind: "hover" | "select";
              phase: "set" | "clear";
              regions: readonly { start: number; end: number }[];
            }): void;
          }
        ).emitSeqstarInteraction({
          kind: interaction.kind,
          phase: interaction.phase,
          regions:
            interaction.phase === "clear"
              ? []
              : [{ start: interaction.start, end: interaction.start }],
        }),
      { kind, phase, start },
    );
  await emitPredicted("hover", "set", 2);
  await expect(page.getByTestId("p60-composed-paths")).toContainText(
    "MYG_CHICK-27-143:member · alignment-to-structure · hover · unmapped · 0 targets",
  );
  await page.getByRole("button", { name: "Show P02197 AlphaFold DB v6 in 3D" }).click();
  await expect(page.getByTestId("m50-action-summary")).toHaveText(
    "Member: MYG_CHICK-27-143:member",
  );
  await expect(page.getByTestId("m50-action-payload")).toHaveText(
    '{"kind":"member","memberId":"MYG_CHICK-27-143:member","requestId":"M50-member-1"}',
  );
  await expect(page.getByTestId("m50-structure-state")).toHaveText("M50-member-1");
  await emitPredicted("hover", "set", 2);
  await expect(page.getByTestId("p60-composed-paths")).toContainText(
    "MYG_CHICK-27-143:member · alignment-to-structure · hover · exact",
  );
  await emitPredicted("select", "set", 2);
  await expect(page.getByTestId("p60-composed-paths")).toContainText(
    "MYG_CHICK-27-143:member · alignment-to-structure · select · exact · 1 targets",
  );
  await emitPredicted("select", "clear", 2);
  await expect(page.getByTestId("p60-composed-paths")).toContainText(
    "MYG_CHICK-27-143:member · alignment-to-structure · select · exact · 0 targets",
  );
  await emitPredicted("hover", "set", 1);
  await expect(page.getByTestId("p60-composed-paths")).toContainText(
    "MYG_CHICK-27-143:member · alignment-to-structure · hover · unmapped · 0 targets",
  );
  expect(external).toEqual([]);
});

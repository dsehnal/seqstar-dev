import type { Viewer } from "molstar/lib/apps/viewer/app.js";
import { StructureElement, StructureProperties, Unit } from "molstar/lib/mol-model/structure.js";
import { PluginStateObject } from "molstar/lib/mol-plugin-state/objects.js";
import type { Representation } from "molstar/lib/mol-repr/representation.js";

export interface ResidueIdentity {
  /** Active Mol* structure-state identity, scoped to the rendered generation. */
  readonly structureId: string;
  readonly modelEntryId: string;
  readonly modelId: string;
  readonly modelIndex: number;
  readonly modelNumber: number;
  readonly unitId: number;
  readonly operatorName: string;
  readonly instanceId: string;
  readonly entityId: string;
  readonly labelAsymId: string;
  readonly authAsymId: string;
  readonly labelSeqId: number;
  readonly authSeqId: number;
  readonly insertionCode: string;
  readonly componentId: string;
}

export interface NativeResidueEvent {
  readonly kind: "hover" | "selection-add" | "selection-remove" | "selection-clear";
  readonly residues: readonly ResidueIdentity[];
  /** True when Mol* supplied a non-atomic/coarse/foreign locus, not a clear. */
  readonly unsupported?: boolean;
}

const normalizeNativeLoci = (
  loci: unknown,
): Pick<NativeResidueEvent, "residues" | "unsupported"> => {
  const residues = extractResidues(loci);
  return {
    residues,
    ...(!StructureElement.Loci.is(loci) ||
    (!StructureElement.Loci.isEmpty(loci) && residues.length === 0)
      ? { unsupported: true }
      : {}),
  };
};

function residueKey(residue: ResidueIdentity): string {
  return [
    residue.structureId,
    residue.modelEntryId,
    residue.modelId,
    residue.modelIndex,
    residue.modelNumber,
    residue.unitId,
    residue.operatorName,
    residue.instanceId,
    residue.entityId,
    residue.labelAsymId,
    residue.authAsymId,
    residue.labelSeqId,
    residue.authSeqId,
    residue.insertionCode,
  ].join("|");
}

/** Convert native atomic StructureElement loci into JSON-safe residue identities. */
export function extractResidues(loci: unknown, structureId?: string): readonly ResidueIdentity[] {
  if (!StructureElement.Loci.is(loci)) return [];

  const residues = new Map<string, ResidueIdentity>();
  StructureElement.Loci.forEachLocation(loci, (location) => {
    if (!Unit.isAtomic(location.unit)) return;
    const residue: ResidueIdentity = {
      structureId:
        structureId ??
        `structure-${loci.structure.hashCode}-${loci.structure.transformHash}-${loci.structure.label}`,
      modelEntryId: location.unit.model.entryId,
      modelId: location.unit.model.id,
      modelIndex: loci.structure.getModelIndex(location.unit.model),
      modelNumber: location.unit.model.modelNum,
      unitId: location.unit.id,
      operatorName: location.unit.conformation.operator.name,
      instanceId: location.unit.conformation.operator.instanceId,
      entityId: StructureProperties.chain.label_entity_id(location),
      labelAsymId: StructureProperties.chain.label_asym_id(location),
      authAsymId: StructureProperties.chain.auth_asym_id(location),
      labelSeqId: StructureProperties.residue.label_seq_id(location),
      authSeqId: StructureProperties.residue.auth_seq_id(location),
      insertionCode: StructureProperties.residue.pdbx_PDB_ins_code(location),
      componentId: StructureProperties.residue.label_comp_id(location),
    };
    residues.set(residueKey(residue), residue);
  });
  return [...residues.values()];
}

/** Resolve a supported StructureElement schema against the active structures. */
export function findStructureLoci(
  viewer: Viewer,
  elements: StructureElement.Schema,
): StructureElement.Loci[] {
  const structures = viewer.plugin.state.data.selectQ((query) =>
    query.rootsOfType(PluginStateObject.Molecule.Structure),
  );
  const result: StructureElement.Loci[] = [];
  for (const structure of structures) {
    const data = structure.obj?.data;
    if (data) result.push(StructureElement.Loci.fromSchema(data, elements));
  }
  return result;
}

/** Subscribe to the native Mol* hover behavior and immediately normalize loci. */
export function subscribeNativeResidueHover(
  viewer: Viewer,
  receive: (event: NativeResidueEvent) => void,
): { unsubscribe(): void } {
  return viewer.subscribe(viewer.plugin.behaviors.interaction.hover, (event) => {
    receive({ kind: "hover", ...normalizeNativeLoci(event.current.loci) });
  });
}

/** Subscribe to Mol*'s persistent native structure-selection locus events. */
export function subscribeNativeResidueSelection(
  viewer: Viewer,
  receive: (event: NativeResidueEvent) => void,
): { unsubscribe(): void } {
  const subscriptions = [
    viewer.subscribe(viewer.plugin.managers.structure.selection.events.loci.add, (loci) => {
      receive({ kind: "selection-add", ...normalizeNativeLoci(loci) });
    }),
    viewer.subscribe(viewer.plugin.managers.structure.selection.events.loci.remove, (loci) => {
      receive({ kind: "selection-remove", ...normalizeNativeLoci(loci) });
    }),
    viewer.subscribe(viewer.plugin.managers.structure.selection.events.loci.clear, () => {
      receive({ kind: "selection-clear", residues: [] });
    }),
  ];
  return {
    unsubscribe() {
      for (const subscription of subscriptions) subscription.unsubscribe();
    },
  };
}

export type NativeRepresentationLoci = Representation.Loci;

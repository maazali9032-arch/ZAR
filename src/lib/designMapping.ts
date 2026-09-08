import type { DesignMappingEntry } from '@/types';

export const DESIGN_TABLE_MAP: Record<string, DesignMappingEntry> = {
  design_01: { table: 'design_01_invitations', suffix: '_01' },
  design_02: { table: 'design_02_invitations', suffix: '_02' },
  design_03: { table: 'design_03_invitations', suffix: '_03' },
  design_04: { table: 'design_04_invitations', suffix: '_04' },
  design_05: { table: 'design_05_invitations', suffix: '_05' },
  design_06: { table: 'design_06_invitations', suffix: '_06' },
  design_07: { table: 'design_07_invitations', suffix: '_07' },
  design_08: { table: 'design_08_invitations', suffix: '_08' },
  design_09: { table: 'design_09_invitations', suffix: '_09' },
  design_10: { table: 'design_10_invitations', suffix: '_10' },
  design_11: { table: 'design_11_invitations', suffix: '_11' },
  design_12: { table: 'design_12_invitations', suffix: '_12' },
  design_13: { table: 'design_13_invitations', suffix: '_13' },
  design_14: { table: 'design_14_invitations', suffix: '_14' },
  design_15: { table: 'design_15_invitations', suffix: '_15' },
  design_16: { table: 'design_16_invitations', suffix: '_16' },
  design_17: { table: 'design_17_invitations', suffix: '_17' },
  design_18: { table: 'design_18_invitations', suffix: '_18' },
  design_19: { table: 'design_19_invitations', suffix: '_19' },
  design_20: { table: 'design_20_invitations', suffix: '_20' },
};

export function resolveDesignTarget(designCode: string): DesignMappingEntry {
  const key = designCode.trim();
  const entry = DESIGN_TABLE_MAP[key];
  if (!entry) {
    throw new RangeError(
      `Design code "${designCode}" is not in the supported design mapping. ` +
        `Supported codes: ${Object.keys(DESIGN_TABLE_MAP).join(', ')}.`
    );
  }
  return entry;
}

export function isSupportedDesignCode(designCode: string): boolean {
  return designCode.trim() in DESIGN_TABLE_MAP;
}

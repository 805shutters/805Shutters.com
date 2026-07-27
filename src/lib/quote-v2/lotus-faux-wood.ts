export const LOTUS_FAUX_WOOD_PRODUCT_ID = "lotus_faux_wood_blinds" as const;

export type LotusFauxWoodProgramProfile = Readonly<{
  programId: string;
  programCode: string;
  slatSize: string;
  color: string;
  finish: string;
  sourcePage: number;
  maxWidth: number;
}>;

const LOTUS_FAUX_WOOD_PROGRAM_PROFILES = Object.freeze({
  lotus_flx_2in_bright_white_custom: {
    programId: "lotus_flx_2in_bright_white_custom",
    programCode: "FLX",
    slatSize: '2"',
    color: "Bright White",
    finish: "Smooth",
    sourcePage: 99,
    maxWidth: 95,
  },
  lotus_flxe_2in_embossed_bright_white_custom: {
    programId: "lotus_flxe_2in_embossed_bright_white_custom",
    programCode: "FLXE",
    slatSize: '2"',
    color: "Bright White",
    finish: "Embossed",
    sourcePage: 100,
    maxWidth: 95,
  },
  lotus_ftx_2in_snow_white_custom: {
    programId: "lotus_ftx_2in_snow_white_custom",
    programCode: "FTX",
    slatSize: '2"',
    color: "Snow White",
    finish: "Smooth",
    sourcePage: 101,
    maxWidth: 72,
  },
  lotus_ftxlg_2in_light_gray_custom: {
    programId: "lotus_ftxlg_2in_light_gray_custom",
    programCode: "FTXLG",
    slatSize: '2"',
    color: "Light Gray",
    finish: "Smooth",
    sourcePage: 101,
    maxWidth: 72,
  },
  lotus_fcx_2in_soft_white_custom: {
    programId: "lotus_fcx_2in_soft_white_custom",
    programCode: "FCX",
    slatSize: '2"',
    color: "Soft White",
    finish: "Smooth",
    sourcePage: 102,
    maxWidth: 95,
  },
  lotus_fpx_2in_privacy_bright_white_custom: {
    programId: "lotus_fpx_2in_privacy_bright_white_custom",
    programCode: "FPX",
    slatSize: '2"',
    color: "Bright White",
    finish: "Privacy",
    sourcePage: 103,
    maxWidth: 95,
  },
  lotus_fgx_2_5in_bright_white_custom: {
    programId: "lotus_fgx_2_5in_bright_white_custom",
    programCode: "FGX",
    slatSize: '2 1/2"',
    color: "Bright White",
    finish: "Smooth",
    sourcePage: 104,
    maxWidth: 72,
  },
} satisfies Record<string, LotusFauxWoodProgramProfile>);

export function lotusFauxWoodProgramProfile(
  programId: string | null | undefined,
): LotusFauxWoodProgramProfile | null {
  if (!programId) return null;
  return (
    LOTUS_FAUX_WOOD_PROGRAM_PROFILES[
      programId as keyof typeof LOTUS_FAUX_WOOD_PROGRAM_PROFILES
    ] ?? null
  );
}

export function lotusFauxWoodConfigurationForProgram(
  programId: string | null | undefined,
): Record<string, unknown> {
  const profile = lotusFauxWoodProgramProfile(programId);
  if (!profile) return {};
  return {
    lotus_configuration_version: "lotus-faux-v2",
    lotus_program_code: profile.programCode,
    product_line: profile.programCode,
    slat_size: profile.slatSize,
    color: profile.color,
    lotus_finish: profile.finish,
    lotus_source_page: profile.sourcePage,
    lotus_blind_count: 1,
    lotus_blind_1_width_inches: null,
    lotus_blind_2_width_inches: null,
    lotus_blind_3_width_inches: null,
  };
}

export function isLotusFauxWoodProductId(
  productId: unknown,
): productId is typeof LOTUS_FAUX_WOOD_PRODUCT_ID {
  return productId === LOTUS_FAUX_WOOD_PRODUCT_ID;
}

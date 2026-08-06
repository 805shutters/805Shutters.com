import { describe, expect, it } from "vitest";
import {
  lotusFauxWoodConfigurationForProgram,
  lotusFauxWoodProgramProfileForCode,
  lotusFauxWoodProgramProfiles,
} from "./lotus-faux-wood";

describe("Lotus faux wood program selection", () => {
  it("exposes every independent Lotus program before a program is selected", () => {
    expect(lotusFauxWoodProgramProfiles().map((profile) => profile.programCode)).toEqual([
      "FLX",
      "FLXE",
      "FTX",
      "FTXLG",
      "FCX",
      "FPX",
      "FGX",
    ]);
  });

  it("resolves FTX to its exact source-backed catalog program and configuration", () => {
    const profile = lotusFauxWoodProgramProfileForCode("FTX");
    expect(profile).toMatchObject({
      programId: "lotus_ftx_2in_snow_white_custom",
      programCode: "FTX",
      slatSize: '2"',
      color: "Snow White",
      finish: "Smooth",
      sourcePage: 101,
      maxWidth: 72,
    });
    expect(lotusFauxWoodConfigurationForProgram(profile?.programId)).toMatchObject({
      lotus_program_code: "FTX",
      product_line: "FTX",
      slat_size: '2"',
      color: "Snow White",
      lotus_finish: "Smooth",
    });
  });
});

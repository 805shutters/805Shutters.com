import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourceDir = path.join(root, "public/images/portfolio-originals");
const outputDir = path.join(root, "public/images/portfolio-enhanced");

const photos = [
  {
    base: "bedroom-sliding-door-shutters",
    source: "ventura-county-bedroom-sliding-door-shutters-jpg.jpg",
    category: "Shutters",
    title: "Bedroom Sliding Door Shutters",
    alt: "Custom shutters installed on a Ventura County bedroom sliding door",
    position: "attention",
    grade: "bright"
  },
  {
    base: "roller-shade-large-window",
    source: "ventura-county-roller-shade-large-window-jpg.jpg",
    category: "Shades",
    title: "Large Window Roller Shade",
    alt: "Roller shade covering a large Ventura County window",
    position: "center",
    grade: "bright"
  },
  {
    base: "layered-shades-bedroom-window",
    source: "ventura-county-layered-shades-bedroom-window-jpg.jpg",
    category: "Shades",
    title: "Layered Bedroom Shades",
    alt: "Layered window shades installed on a Ventura County bedroom window",
    position: "attention",
    grade: "bright"
  },
  {
    base: "bedroom-horizontal-blinds-before",
    source: "2026-07-10-bedroom-horizontal-blinds-before.jpg",
    category: "Blinds",
    title: "Bedroom Blinds Before",
    alt: "Before view of horizontal blinds on a Ventura County bedroom window",
    position: "center",
    grade: "phone",
    fullFrame: true,
    socialLabel: "BEFORE"
  },
  {
    base: "bedroom-plantation-shutters-after-front",
    source: "2026-07-10-bedroom-plantation-shutters-after-front.jpg",
    category: "Shutters",
    title: "Bedroom Plantation Shutters After",
    alt: "After view of white plantation shutters on a Ventura County bedroom window",
    position: "center",
    grade: "phone",
    fullFrame: true,
    socialLabel: "AFTER"
  },
  {
    base: "bedroom-plantation-shutters-after-room",
    source: "2026-07-10-bedroom-plantation-shutters-after-room.jpg",
    category: "Shutters",
    title: "Bedroom Plantation Shutters Room View",
    alt: "Room-angle after view of white plantation shutters in a Ventura County bedroom",
    position: "attention",
    grade: "phone",
    fullFrame: true,
    socialLabel: "AFTER"
  },
  {
    base: "skylight-plantation-shutters-open",
    source: "2026-07-13-skylight-plantation-shutters-open.jpg",
    category: "Shutters",
    title: "Skylight Plantation Shutters",
    alt: "Custom white plantation shutters installed over a Ventura County skylight with the louvers open",
    position: "center",
    grade: "phone",
    fullFrame: true
  },
  {
    base: "skylight-plantation-shutters-closed",
    source: "2026-07-13-skylight-plantation-shutters-closed.jpg",
    category: "Shutters",
    title: "Skylight Plantation Shutters Closed",
    alt: "Custom white plantation shutters closed over a Ventura County skylight for light control",
    position: "center",
    grade: "phone",
    fullFrame: true
  },
  {
    base: "top-down-bottom-up-shades-bedroom-angle",
    source: "2026-07-14-top-down-bottom-up-shades-bedroom-angle.jpg",
    category: "Shades",
    title: "Top-Down Bottom-Up Bedroom Shade",
    alt: "Top-down bottom-up cellular shade installed in a Ventura County bedroom remodel",
    position: "center",
    grade: "phone",
    fullFrame: true
  },
  {
    base: "top-down-bottom-up-shades-bedroom-front",
    source: "2026-07-14-top-down-bottom-up-shades-bedroom-front.jpg",
    category: "Shades",
    title: "Top-Down Bottom-Up Bedroom Privacy",
    alt: "Top-down bottom-up cellular shade balancing daylight and privacy in a Ventura County bedroom",
    position: "center",
    grade: "phone",
    fullFrame: true
  },
  {
    base: "top-down-bottom-up-shades-bedroom-detail",
    source: "2026-07-14-top-down-bottom-up-shades-bedroom-detail.jpg",
    category: "Shades",
    title: "Top-Down Bottom-Up Shade Detail",
    alt: "Close view of a top-down bottom-up cellular shade installed in a Ventura County remodel",
    position: "center",
    grade: "phone",
    fullFrame: true
  },
  {
    base: "top-down-bottom-up-shades-office-pair",
    source: "2026-07-14-top-down-bottom-up-shades-office-pair.jpg",
    category: "Shades",
    title: "Top-Down Bottom-Up Office Shades",
    alt: "Paired top-down bottom-up cellular shades installed in a Ventura County home office",
    position: "center",
    grade: "phone",
    fullFrame: true
  },
  {
    base: "top-down-bottom-up-shades-bathroom-detail",
    source: "2026-07-14-top-down-bottom-up-shades-bathroom-detail.jpg",
    category: "Shades",
    title: "Top-Down Bottom-Up Bathroom Shades",
    alt: "Top-down bottom-up cellular shades providing privacy in a Ventura County bathroom remodel",
    position: "center",
    grade: "phone",
    fullFrame: true
  },
  {
    base: "top-down-bottom-up-shades-bathroom-wide",
    source: "2026-07-14-top-down-bottom-up-shades-bathroom-wide.jpg",
    category: "Shades",
    title: "Top-Down Bottom-Up Bath Remodel",
    alt: "Top-down bottom-up cellular shades bringing privacy and daylight control to a Ventura County bathroom remodel",
    position: "center",
    grade: "phone",
    fullFrame: true
  },
  {
    base: "split-tilt-shutters-living-room",
    source: "2026-07-21-split-tilt-shutters-living-room.jpg",
    category: "Shutters",
    title: "Split Tilt Shutters Living Room",
    alt: "White split tilt plantation shutters installed across a Ventura County living room",
    position: "center",
    grade: "phone",
    fullFrame: true
  },
  {
    base: "split-tilt-shutters-open",
    source: "2026-07-21-split-tilt-shutters-open.jpg",
    category: "Shutters",
    title: "Split Tilt Shutters Open",
    alt: "Custom split tilt plantation shutters with the upper louvers open for daylight",
    position: "center",
    grade: "phone",
    fullFrame: true
  },
  {
    base: "split-tilt-shutters-light-control",
    source: "2026-07-21-split-tilt-shutters-light-control.jpg",
    category: "Shutters",
    title: "Split Tilt Shutter Light Control",
    alt: "Split tilt plantation shutters showing independent upper and lower louver control",
    position: "center",
    grade: "phone",
    fullFrame: true
  },
  {
    base: "split-tilt-shutters-detail",
    source: "2026-07-21-split-tilt-shutters-detail.jpg",
    category: "Shutters",
    title: "Split Tilt Shutter Detail",
    alt: "Close view of white split tilt plantation shutters with independently controlled louvers",
    position: "center",
    grade: "phone",
    fullFrame: true
  },
  {
    base: "kitchen-roman-shade-lowered",
    source: "2026-07-08-kitchen-roman-shade-lowered.jpg",
    category: "Shades",
    title: "Kitchen Roman Shade Lowered",
    alt: "Textured Roman shade lowered over a Ventura County kitchen sink window",
    position: "center",
    grade: "phone"
  },
  {
    base: "kitchen-roman-shade-raised",
    source: "2026-07-08-kitchen-roman-shade-raised.jpg",
    category: "Shades",
    title: "Kitchen Roman Shade Raised",
    alt: "Textured Roman shade raised above a Ventura County kitchen sink window",
    position: "center",
    grade: "phone"
  },
  {
    base: "arched-bedroom-plantation-shutters-room",
    source: "2026-07-09-arched-bedroom-plantation-shutters-room.jpg",
    category: "Shutters",
    title: "Arched Bedroom Plantation Shutters",
    alt: "White plantation shutters with an arched center bedroom window in Ventura County",
    position: "attention",
    grade: "phone"
  },
  {
    base: "arched-bedroom-plantation-shutters-detail",
    source: "2026-07-09-arched-bedroom-plantation-shutters-detail.jpg",
    category: "Shutters",
    title: "Arched Shutter Detail",
    alt: "Custom arched plantation shutters with side bedroom shutters in Ventura County",
    position: "center",
    grade: "phone"
  },
  {
    base: "bedroom-plantation-shutters-single-window",
    source: "2026-07-09-bedroom-plantation-shutters-single-window.jpg",
    category: "Shutters",
    title: "Bedroom Plantation Shutters",
    alt: "White plantation shutters installed on a Ventura County bedroom window",
    position: "attention",
    grade: "phone"
  },
  {
    base: "specialty-arch-window-shutters",
    source: "ventura-county-specialty-arch-window-shutters-jpg.jpg",
    category: "Shutters",
    title: "Specialty Arch Shutters",
    alt: "Specialty arch window shutters custom fit in a Ventura County home",
    position: "attention",
    grade: "editorial"
  },
  {
    base: "arched-window-custom-shutters",
    source: "ventura-county-arched-window-custom-shutters-jpg.jpg",
    category: "Shutters",
    title: "Arched Window Shutters",
    alt: "Custom arched plantation shutters in a Ventura County living room",
    position: "attention",
    grade: "editorial"
  },
  {
    base: "dark-wood-plantation-shutters-living-room",
    source: "ventura-county-dark-wood-plantation-shutters-living-room-jpg.jpg",
    category: "Shutters",
    title: "Dark Wood Living Room Shutters",
    alt: "Dark wood plantation shutters across living room windows in Ventura County",
    position: "attention",
    grade: "warmWood"
  },
  {
    base: "dark-wood-plantation-shutters-reading-room",
    source: "ventura-county-dark-wood-plantation-shutters-reading-room-jpg.jpg",
    category: "Shutters",
    title: "Dark Wood Reading Room Shutters",
    alt: "Dark wood plantation shutters in a Ventura County reading room",
    position: "attention",
    grade: "warmWood"
  },
  {
    base: "arched-plantation-shutters-living-room",
    source: "ventura-county-arched-plantation-shutters-living-room-jpg.jpg",
    category: "Shutters",
    title: "Arched Plantation Shutters",
    alt: "Arched plantation shutters installed in a Ventura County living room",
    position: "attention",
    grade: "editorial"
  },
  {
    base: "plantation-shutters-dining-room",
    source: "ventura-county-plantation-shutters-dining-room-jpg.jpg",
    category: "Shutters",
    title: "Dining Room Plantation Shutters",
    alt: "White plantation shutters installed in a Ventura County dining room",
    position: "attention",
    grade: "editorial"
  },
  {
    base: "fabric-roller-shade-valance-detail",
    source: "2026-07-02-fabric-roller-shade-valance-detail.jpg",
    category: "Shades",
    title: "Fabric Roller Shade Detail",
    alt: "Fabric roller shade with a matching valance installed over a Ventura County window",
    position: "center",
    grade: "shade"
  },
  {
    base: "bedroom-plantation-shutters-angle",
    source: "2026-07-02-bedroom-plantation-shutters-angle.jpg",
    category: "Shutters",
    title: "Bedroom Plantation Shutters",
    alt: "White plantation shutters installed on a Ventura County bedroom window",
    position: "center",
    grade: "phone"
  },
  {
    base: "bedroom-plantation-shutters-straight",
    source: "2026-07-02-bedroom-plantation-shutters-straight.jpg",
    category: "Shutters",
    title: "Straight-On Bedroom Shutters",
    alt: "Straight-on view of white plantation shutters in a Ventura County bedroom",
    position: "center",
    grade: "phone"
  },
  {
    base: "bedroom-plantation-shutters-wide-angle",
    source: "2026-07-02-bedroom-plantation-shutters-wide-angle.jpg",
    category: "Shutters",
    title: "Bedroom Shutters Wide Angle",
    alt: "Wide angle view of white plantation shutters in a Ventura County bedroom",
    position: "center",
    grade: "phone"
  },
  {
    base: "bay-window-plantation-shutters-front",
    source: "2026-07-01-bay-window-plantation-shutters-front.jpg",
    category: "Shutters",
    title: "Bay Window Plantation Shutters",
    alt: "White plantation shutters installed across a Ventura County bay window",
    position: "center",
    grade: "phone"
  },
  {
    base: "bay-window-plantation-shutters-angle",
    source: "2026-07-01-bay-window-plantation-shutters-angle.jpg",
    category: "Shutters",
    title: "Angled Bay Window Plantation Shutters",
    alt: "White plantation shutters installed on an angled Ventura County bay window",
    position: "center",
    grade: "phone"
  },
  {
    base: "two-story-shutter-installation-detail",
    source: "2026-07-01-two-story-shutter-installation-detail.jpg",
    category: "Shutters",
    title: "Tall Window Shutter Detail",
    alt: "Custom plantation shutter detail on tall angled Ventura County windows",
    position: "attention",
    grade: "detail"
  },
  {
    base: "uploaded-arched-shutter-detail",
    source: "uploaded-portfolio-0631.jpg",
    category: "Shutters",
    title: "Arched Shutter Detail",
    alt: "Custom arched shutter installed in a Ventura County room",
    position: "attention",
    grade: "phone"
  },
  {
    base: "uploaded-single-arch-shutter",
    source: "uploaded-portfolio-0630.jpg",
    category: "Shutters",
    title: "Single Arch Shutter",
    alt: "Single arched plantation shutter installed in a Ventura County home",
    position: "attention",
    grade: "phone"
  },
  {
    base: "uploaded-shutter-panel-detail",
    source: "uploaded-portfolio-0756.jpg",
    category: "Shutters",
    title: "Shutter Panel Detail",
    alt: "Close detail of a custom shutter panel beside a door in a Ventura County home",
    position: "attention",
    grade: "detail"
  },
  {
    base: "uploaded-two-story-living-room-shutters",
    source: "uploaded-portfolio-0608.jpg",
    category: "Shutters",
    title: "Two-Story Living Room Shutters",
    alt: "Two-story living room windows fitted with custom plantation shutters",
    position: "attention",
    grade: "phone"
  },
  {
    base: "uploaded-stacked-arch-shutters",
    source: "uploaded-portfolio-0605.jpg",
    category: "Shutters",
    title: "Stacked Arch Shutters",
    alt: "Stacked arched and rectangular shutters installed on tall living room windows",
    position: "attention",
    grade: "phone"
  },
  {
    base: "uploaded-corner-cellular-shades",
    source: "uploaded-portfolio-9238.jpg",
    category: "Shades",
    title: "Corner Cellular Shades",
    alt: "Cellular shades installed on two corner windows in a Ventura County home",
    position: "attention",
    grade: "phone"
  },
  {
    base: "uploaded-bedroom-cellular-shades",
    source: "uploaded-portfolio-9225.jpg",
    category: "Shades",
    title: "Bedroom Cellular Shades",
    alt: "Cellular shades installed on two bedroom windows beside a door",
    position: "attention",
    grade: "phone"
  },
  {
    base: "uploaded-twin-cellular-shades",
    source: "uploaded-portfolio-9224.jpg",
    category: "Shades",
    title: "Twin Cellular Shades",
    alt: "Twin cellular shades installed on side-by-side bedroom windows",
    position: "attention",
    grade: "phone"
  },
  {
    base: "uploaded-office-plantation-shutters",
    source: "uploaded-portfolio-9222.jpg",
    category: "Shutters",
    title: "Office Plantation Shutters",
    alt: "White plantation shutters installed over office corner windows",
    position: "attention",
    grade: "phone"
  },
  {
    base: "uploaded-corner-room-cellular-shades",
    source: "uploaded-portfolio-9215.jpg",
    category: "Shades",
    title: "Corner Room Cellular Shades",
    alt: "Cellular shades installed across a corner room window grouping",
    position: "attention",
    grade: "phone"
  },
  {
    base: "uploaded-full-height-cellular-shades",
    source: "uploaded-portfolio-9211.jpg",
    category: "Shades",
    title: "Full-Height Cellular Shades",
    alt: "Full-height cellular shades installed on corner room windows",
    position: "attention",
    grade: "detail"
  }
];

const gradePresets = {
  editorial: {
    normaliseLower: 0.4,
    normaliseUpper: 99.45,
    brightness: 1.06,
    saturation: 1.03,
    contrast: 1.04,
    clahe: { width: 96, height: 96, maxSlope: 2 },
    sharpen: { sigma: 0.72, m1: 1.14, m2: 1.5 }
  },
  bright: {
    normaliseLower: 0.25,
    normaliseUpper: 99.55,
    brightness: 1.07,
    saturation: 1.02,
    contrast: 1.03,
    clahe: { width: 96, height: 96, maxSlope: 2 },
    sharpen: { sigma: 0.68, m1: 1.08, m2: 1.42 }
  },
  warmWood: {
    normaliseLower: 0.5,
    normaliseUpper: 99.3,
    brightness: 1.04,
    saturation: 1.01,
    contrast: 1.04,
    clahe: { width: 112, height: 112, maxSlope: 2 },
    sharpen: { sigma: 0.68, m1: 1.08, m2: 1.42 }
  },
  shade: {
    normaliseLower: 0.2,
    normaliseUpper: 99.6,
    brightness: 1.07,
    saturation: 1.01,
    contrast: 1.04,
    clahe: { width: 96, height: 96, maxSlope: 2 },
    sharpen: { sigma: 0.7, m1: 1.12, m2: 1.48 }
  },
  phone: {
    normaliseLower: 0.15,
    normaliseUpper: 99.7,
    brightness: 1.12,
    saturation: 1.02,
    contrast: 1.05,
    clahe: { width: 80, height: 80, maxSlope: 2 },
    median: 1,
    sharpen: { sigma: 0.75, m1: 1.18, m2: 1.55 }
  },
  detail: {
    normaliseLower: 0.2,
    normaliseUpper: 99.65,
    brightness: 1.08,
    saturation: 1.03,
    contrast: 1.06,
    clahe: { width: 72, height: 72, maxSlope: 2 },
    sharpen: { sigma: 0.76, m1: 1.18, m2: 1.58 }
  }
};

const contrastOffset = (contrast) => 128 - 128 * contrast;

const tune = (pipeline, photo) => {
  const oriented = pipeline.rotate();
  const corrected = photo.rotate ? oriented.rotate(photo.rotate) : oriented;
  const grade = gradePresets[photo.grade] || gradePresets.editorial;
  const graded = corrected
    .toColourspace("srgb")
    .normalise({ lower: grade.normaliseLower, upper: grade.normaliseUpper })
    .clahe(grade.clahe)
    .modulate({ brightness: grade.brightness, saturation: grade.saturation })
    .linear(grade.contrast, contrastOffset(grade.contrast));

  return (grade.median ? graded.median(grade.median) : graded).sharpen(grade.sharpen);
};

const renderFullFrame = async ({ sourcePath, photo, width, height, outputPath }) => {
  await tune(sharp(sourcePath), photo)
    .resize({ width, height, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 91, mozjpeg: true })
    .toFile(outputPath);
};

await fs.mkdir(outputDir, { recursive: true });

const manifest = [];

for (const photo of photos) {
  const sourcePath = path.join(sourceDir, photo.source);
  const widePath = path.join(outputDir, `${photo.base}-wide.jpg`);
  const cardPath = path.join(outputDir, `${photo.base}-card.jpg`);
  const naturalPath = path.join(outputDir, `${photo.base}-natural.jpg`);
  const socialPath = path.join(outputDir, `${photo.base}-social-square.jpg`);

  if (photo.fullFrame) {
    await renderFullFrame({ sourcePath, photo, width: 1600, height: 900, outputPath: widePath });
    await renderFullFrame({ sourcePath, photo, width: 900, height: 1125, outputPath: cardPath });
    await renderFullFrame({ sourcePath, photo, width: 1080, height: 1080, outputPath: socialPath });
  } else {
    await tune(sharp(sourcePath), photo)
      .resize({ width: 1600, height: 900, fit: "cover", position: photo.position })
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(widePath);

    await tune(sharp(sourcePath), photo)
      .resize({ width: 900, height: 1125, fit: "cover", position: photo.position })
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(cardPath);
  }

  await tune(sharp(sourcePath), photo)
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 91, mozjpeg: true })
    .toFile(naturalPath);

  manifest.push({
    ...photo,
    wide: `/images/portfolio-enhanced/${photo.base}-wide.jpg`,
    card: `/images/portfolio-enhanced/${photo.base}-card.jpg`,
    natural: `/images/portfolio-enhanced/${photo.base}-natural.jpg`,
    ...(photo.fullFrame
      ? { social: `/images/portfolio-enhanced/${photo.base}-social-square.jpg` }
      : {})
  });
}

await fs.writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Enhanced ${manifest.length} portfolio photos into ${path.relative(root, outputDir)}`);

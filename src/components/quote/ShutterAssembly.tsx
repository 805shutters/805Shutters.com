import type { ShutterFrameProfile } from '@/lib/quote/shutter-frame-profiles';
import { useId } from "react";
import type { ShutterIllustrationGeometry } from "@/lib/quote/shutter-illustration-geometry";
import styles from "./ContractProductIllustration.module.css";

/** One opening: align the original pencil panels, frame them, then angle the whole unit. */
export function ShutterAssembly({ src, alt, panels, layout, geometry, frameProfile }: {
  src: string; alt: string; panels: number; layout: string; geometry?: ShutterIllustrationGeometry; frameProfile?: ShutterFrameProfile | null;
}) {
  const grainId = `shutter-grain-${useId().replace(/:/g, "")}`;
  const panelHeight = 320;
  const bullnose = /bullnose-z/.test(frameProfile?.id ?? '');
  const frame = bullnose ? 16 : 12;
  const postWidth = 9;
  const tokens = /^[LRT]+$/.test(layout) ? [...layout] : Array<string>(panels).fill("?");
  const height = panelHeight + frame * 2;
  const postCount = tokens.filter(token => token === "T").length;
  const measuredWidth = geometry && Number.isFinite(geometry.aspectRatio)
    ? height * geometry.aspectRatio : 0;
  const panelWidth = measuredWidth > 2 * frame + postCount * postWidth + panels
    ? (measuredWidth - 2 * frame - postCount * postWidth) / panels : 100;
  let cursor = frame;
  const pieces = tokens.map((token, index) => {
    const x = cursor;
    cursor += token === "T" ? postWidth : panelWidth;
    return { token, index, x };
  });
  const width = cursor + frame;
  const rise = width * 0.045;
  const hingePositions = [...new Set(pieces.flatMap(({ token, x }) => token === "L" ? [x] : token === "R" ? [x + panelWidth] : []))];
  return <svg className={styles.shutterAssembly} width={width + 15} height={height + rise + 8} style={{aspectRatio: `${width + 15} / ${height + rise + 8}`}}
    viewBox={`-3 -3 ${width + 15} ${height + rise + 8}`}
    role="img" aria-label={alt} data-shutter-assembly="shared-frame" data-shutter-reference="configured-v1"
    data-selected-frame={frameProfile?.id} data-frame-face={bullnose ? "bullnose-z" : undefined}
    data-panel-count={panels} data-shutter-layout={layout} data-opening-aspect-ratio={width / height}>
    <defs>
      <pattern id={grainId} width="19" height="11" patternUnits="userSpaceOnUse">
        <rect width="19" height="11" fill="#e9e8e5" />
        <path d="M0 2L19 1M2 5L16 4M0 9L13 8M9 11L19 10" stroke="#b5b3ae" strokeWidth=".35" opacity=".55" />
      </pattern>
    </defs>
    <g transform={`translate(0 ${rise}) matrix(1 -.045 0 1 0 0)`}>
      <path d={`M${width} 0l8 4v${height}l-8 -4Z`} fill="#bdbcb8" stroke="#777570" strokeWidth=".8" />
      <rect data-shutter-frame="outer" data-shutter-outline="true" width={width} height={height} fill={`url(#${grainId})`} stroke="#777570" strokeWidth="1.2" />
      {bullnose && <>
        <rect x={2.5} y={2.5} width={width-5} height={height-5} rx={3} fill="none" stroke="#c7c5bf" strokeWidth={2.5}/>
        <rect x={frame-3} y={frame-3} width={width-2*frame+6} height={height-2*frame+6} fill="none" stroke="#99968e" strokeWidth={1.1}/>
      </>}
      <path d={`M0 0l${frame} ${frame}M${width} 0l-${frame} ${frame}M0 ${height}l${frame} -${frame}M${width} ${height}l-${frame} -${frame}`} stroke="#999791" strokeWidth=".7" />
      {pieces.map(({ token, index, x }) => token === "T"
        ? <rect key={index} data-shutter-post="true" x={x} y={frame} width={postWidth} height={panelHeight} fill={`url(#${grainId})`} stroke="#8d8b85" strokeWidth=".7" />
        : <image key={index} data-shutter-panel={token} href={src} x={x} y={frame} width={panelWidth} height={panelHeight} preserveAspectRatio="none" />)}
      {(['left', 'right'] as const).map(side => {
        const selectedPanels = pieces.filter(piece => piece.token !== 'T');
        const panel = selectedPanels[side === 'left' ? 0 : selectedPanels.length - 1];
        const x = panel.x;
        const targets: Record<string, [number, number, number, number]> = {
          finish: [x + panelWidth * .22, frame + 6, panelWidth * .56, 5],
          louver: [x + panelWidth * .22, frame + panelHeight * .30, panelWidth * .56, 5],
          stile: [x + (side === 'left' ? .025 : .91) * panelWidth, frame + panelHeight * .40, panelWidth * .065, 12],
          frame: [side === 'left' ? 1 : width - frame + 1, height * .66, frame - 2, 12],
          panel: [x + panelWidth * .22, frame + panelHeight * .96, panelWidth * .56, 5],
        };
        // Hinge labels attach to actual saved hinge positions, including a single
        // left-opening panel when its description happens to sit on the right.
        if (hingePositions.length) {
          const hinge = hingePositions[side === 'left' ? 0 : hingePositions.length - 1];
          targets.hinge = [hinge - 1.8, 62, 3.6, 13];
        }
        if (selectedPanels.length > 1) targets.astragal = [selectedPanels[1].x - 2, height * .55, 4, 12];
        return Object.entries(targets).map(([name, [tx, ty, tw, th]]) =>
          <rect key={`${name}-${side}`} data-shutter-target={`${name}-${side}`} x={tx} y={ty} width={tw} height={th} fill="transparent" pointerEvents="none" aria-hidden="true" />);
      })}
      {src.includes('shutter-center-') && <rect data-shutter-target="tilt-detail" x={frame + panelWidth * .48} y={frame + panelHeight * .22} width={panelWidth * .04} height={panelHeight * .08} fill="transparent" pointerEvents="none" aria-hidden="true" />}
      {src.includes('divider') && <rect data-shutter-target="divider-detail" x={frame + panelWidth * .2} y={frame + panelHeight * .49} width={panelWidth * .6} height={panelHeight * .02} fill="transparent" pointerEvents="none" aria-hidden="true" />}
      <rect x={frame} y={frame} width={width - 2 * frame} height={panelHeight} fill="none" stroke="#777570" strokeWidth="1" />
      {hingePositions.flatMap(x => [62, height - 62].map(y =>
        <g key={`${x}-${y}`} data-shutter-hinge={x}>
          <rect x={x - 1.8} y={y} width={3.6} height={13} rx="1" fill="#c4c2bc" stroke="#696761" strokeWidth=".7" />
          <path d={`M${x} ${y + 1}v11`} stroke="#efeeea" strokeWidth=".8" />
        </g>))}
    </g>
  </svg>;
}

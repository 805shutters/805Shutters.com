import { useId } from "react";
import styles from "./ContractProductIllustration.module.css";

/** One opening: align the original pencil panels, frame them, then angle the whole unit. */
export function ShutterAssembly({ src, alt, panels, layout }: {
  src: string; alt: string; panels: number; layout: string;
}) {
  const grainId = `shutter-grain-${useId().replace(/:/g, "")}`;
  const panelWidth = 100;
  const panelHeight = 320;
  const frame = 12;
  const postWidth = 9;
  const tokens = /^[LRT]+$/.test(layout) ? [...layout] : Array<string>(panels).fill("?");
  let cursor = frame;
  const pieces = tokens.map((token, index) => {
    const x = cursor;
    cursor += token === "T" ? postWidth : panelWidth;
    return { token, index, x };
  });
  const width = cursor + frame;
  const height = panelHeight + frame * 2;
  const rise = width * 0.045;
  const hingePositions = [...new Set(pieces.flatMap(({ token, x }) => token === "L" ? [x] : token === "R" ? [x + panelWidth] : []))];
  return <svg className={styles.shutterAssembly} width={160} height={160}
    viewBox={`-3 -3 ${width + 15} ${height + rise + 8}`}
    role="img" aria-label={alt} data-shutter-assembly="shared-frame"
    data-panel-count={panels} data-shutter-layout={layout}>
    <defs>
      <pattern id={grainId} width="19" height="11" patternUnits="userSpaceOnUse">
        <rect width="19" height="11" fill="#e9e8e5" />
        <path d="M0 2L19 1M2 5L16 4M0 9L13 8M9 11L19 10" stroke="#b5b3ae" strokeWidth=".35" opacity=".55" />
      </pattern>
    </defs>
    <g transform={`translate(0 ${rise}) matrix(1 -.045 0 1 0 0)`}>
      <path d={`M${width} 0l8 4v${height}l-8 -4Z`} fill="#bdbcb8" stroke="#777570" strokeWidth=".8" />
      <rect data-shutter-frame="outer" width={width} height={height} fill={`url(#${grainId})`} stroke="#777570" strokeWidth="1.2" />
      <path d={`M0 0l${frame} ${frame}M${width} 0l-${frame} ${frame}M0 ${height}l${frame} -${frame}M${width} ${height}l-${frame} -${frame}`} stroke="#999791" strokeWidth=".7" />
      {pieces.map(({ token, index, x }) => token === "T"
        ? <rect key={index} data-shutter-post="true" x={x} y={frame} width={postWidth} height={panelHeight} fill={`url(#${grainId})`} stroke="#8d8b85" strokeWidth=".7" />
        : <image key={index} data-shutter-panel={token} href={src} x={x} y={frame} width={panelWidth} height={panelHeight} preserveAspectRatio="none" />)}
      <rect x={frame} y={frame} width={width - 2 * frame} height={panelHeight} fill="none" stroke="#777570" strokeWidth="1" />
      {hingePositions.flatMap(x => [62, height - 62].map(y =>
        <g key={`${x}-${y}`} data-shutter-hinge={x}>
          <rect x={x - 1.8} y={y} width={3.6} height={13} rx="1" fill="#c4c2bc" stroke="#696761" strokeWidth=".7" />
          <path d={`M${x} ${y + 1}v11`} stroke="#efeeea" strokeWidth=".8" />
        </g>))}
    </g>
  </svg>;
}

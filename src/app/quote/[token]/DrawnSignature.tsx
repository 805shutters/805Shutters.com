"use client";

import { useEffect, useRef, type PointerEvent } from "react";

/** Fixed backing dimensions keep ink intact when a phone or iPad rotates. */
export function DrawnSignature({ disabled, onChange }: { disabled: boolean; onChange: (signature: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<number | null>(null);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (context) { context.fillStyle = "#fff"; context.fillRect(0, 0, 1000, 300); }
  }, []);

  function position(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * 1000 / rect.width, y: (event.clientY - rect.top) * 300 / rect.height };
  }
  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled || pointer.current !== null || !event.isPrimary || event.button !== 0) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = event.pointerId;
    const point = position(event);
    context.strokeStyle = "#111";
    context.fillStyle = "#111";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath(); context.arc(point.x, point.y, 2, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.moveTo(point.x, point.y);
    onChange(event.currentTarget.toDataURL("image/png"));
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled || pointer.current !== event.pointerId) return;
    event.preventDefault();
    const context = event.currentTarget.getContext("2d");
    const point = position(event);
    context?.lineTo(point.x, point.y); context?.stroke();
  }
  function end(event: PointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    onChange(event.currentTarget.toDataURL("image/png"));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function clear() {
    const context = canvas.current?.getContext("2d");
    if (context) { context.fillStyle = "#fff"; context.fillRect(0, 0, 1000, 300); }
    pointer.current = null;
    onChange(null);
  }
  return <div style={{ marginBottom: 16 }}>
    <p style={{ fontSize: 13 }}>Draw your signature with your finger, stylus, or mouse.</p>
    <canvas ref={canvas} width={1000} height={300} aria-label="Draw your signature" aria-disabled={disabled}
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
      style={{ display: "block", width: "100%", height: 180, background: "#fff", border: "2px dashed #888", borderRadius: 8, touchAction: "none", opacity: disabled ? 0.6 : 1 }} />
    <button type="button" disabled={disabled} onClick={clear} style={{ marginTop: 8, padding: "8px 14px", background: "white", border: "1px solid #888", borderRadius: 6 }}>Clear signature</button>
  </div>;
}

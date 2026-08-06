import { useState, useRef, useEffect, useCallback } from 'react';

interface UseSignatureCanvasOptions {
  /** When true, the canvas initializes and becomes interactive */
  active: boolean;
  /** Fixed height in pixels (used by inline variant). If omitted, uses parent height. */
  fixedHeight?: number;
  /** Width offset subtracted from parent width (e.g. 4 for border padding) */
  widthOffset?: number;
}

export function useSignatureCanvas(options: UseSignatureCanvasOptions) {
  const { active, fixedHeight, widthOffset = 0 } = options;
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    if (active && canvasRef.current) {
      const canvas = canvasRef.current;
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth - widthOffset;
        canvas.height = fixedHeight ?? container.clientHeight;
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctxRef.current = ctx;
      }
    }
  }, [active, fixedHeight, widthOffset]);

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const handleStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    ctxRef.current?.beginPath();
    ctxRef.current?.moveTo(pos.x, pos.y);
  }, [getPos]);

  const handleMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    ctxRef.current?.lineTo(pos.x, pos.y);
    ctxRef.current?.stroke();
  }, [isDrawing, getPos]);

  const handleEnd = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (canvas && ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const isCanvasEmpty = useCallback((): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return true;

    const ctx = canvas.getContext('2d');
    if (!ctx) return true;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) {
        return false;
      }
    }
    return true;
  }, []);

  const toDataURL = useCallback((): string => {
    return canvasRef.current?.toDataURL('image/png') || '';
  }, []);

  const canvasProps = {
    ref: canvasRef,
    onMouseDown: handleStart,
    onMouseMove: handleMove,
    onMouseUp: handleEnd,
    onMouseLeave: handleEnd,
    onTouchStart: handleStart,
    onTouchMove: handleMove,
    onTouchEnd: handleEnd,
  };

  return {
    canvasRef,
    canvasProps,
    clearSignature,
    isCanvasEmpty,
    toDataURL,
  };
}

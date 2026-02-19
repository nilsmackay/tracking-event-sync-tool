import { useState, useCallback, useRef, useEffect } from 'react';

interface FrameSliderProps {
  frameOffset: number;
  onOffsetChange: (offset: number) => void;
  disabled?: boolean;
  // Range in frames (e.g., -250 to +250 for ~10 seconds at 25fps)
  minOffset?: number;
  maxOffset?: number;
}

export function FrameSlider({
  frameOffset,
  onOffsetChange,
  disabled = false,
  minOffset = -250,
  maxOffset = 250,
}: FrameSliderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  // Calculate slider position from offset
  const getPositionFromOffset = useCallback((offset: number) => {
    const range = maxOffset - minOffset;
    return ((offset - minOffset) / range) * 100;
  }, [minOffset, maxOffset]);

  // Calculate offset from mouse position on the slider
  const getOffsetFromClientX = useCallback((clientX: number) => {
    if (!sliderRef.current) return frameOffset;

    const rect = sliderRef.current.getBoundingClientRect();
    const positionPercent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const range = maxOffset - minOffset;
    return Math.round(minOffset + (positionPercent / 100) * range);
  }, [minOffset, maxOffset, frameOffset]);

  // Handle mouse/touch down
  const handleDragStart = useCallback((clientX: number) => {
    if (disabled) return;
    setIsDragging(true);
    // Immediately update to the clicked position
    const newOffset = getOffsetFromClientX(clientX);
    if (newOffset !== frameOffset) {
      onOffsetChange(newOffset);
    }
  }, [disabled, frameOffset, getOffsetFromClientX, onOffsetChange]);

  // Handle mouse/touch move - directly track mouse position
  const handleDragMove = useCallback((clientX: number) => {
    if (!isDragging || !sliderRef.current) return;

    const newOffset = getOffsetFromClientX(clientX);
    if (newOffset !== frameOffset) {
      onOffsetChange(newOffset);
    }
  }, [isDragging, frameOffset, getOffsetFromClientX, onOffsetChange]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX);
  }, [handleDragStart]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleDragMove(e.clientX);
    const handleMouseUp = () => handleDragEnd();

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Touch events
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientX);
  }, [handleDragStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientX);
  }, [handleDragMove]);

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Click on track to jump
  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (!sliderRef.current || isDragging) return;

    const newOffset = getOffsetFromClientX(e.clientX);
    onOffsetChange(newOffset);
  }, [isDragging, getOffsetFromClientX, onOffsetChange]);

  // Keyboard support
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;

    let delta = 0;
    switch (e.key) {
      case 'ArrowLeft':
        delta = e.shiftKey ? -10 : -1;
        break;
      case 'ArrowRight':
        delta = e.shiftKey ? 10 : 1;
        break;
      case 'Home':
        onOffsetChange(minOffset);
        return;
      case 'End':
        onOffsetChange(maxOffset);
        return;
      default:
        return;
    }

    e.preventDefault();
    const newOffset = Math.max(minOffset, Math.min(maxOffset, frameOffset + delta));
    onOffsetChange(newOffset);
  }, [disabled, frameOffset, minOffset, maxOffset, onOffsetChange]);


  const position = getPositionFromOffset(frameOffset);
  const isNegative = frameOffset < 0;
  const isPositive = frameOffset > 0;

  // Calculate time offset (assuming 25 fps)
  const timeOffsetMs = Math.round(frameOffset * 40); // 1000ms / 25fps = 40ms per frame
  const timeOffsetSec = (timeOffsetMs / 1000).toFixed(1);

  return (
    <div className={`frame-slider ${disabled ? 'disabled' : ''}`}>
      <div className="slider-labels">
        <span className="slider-label-left">-10s</span>
        <span className="slider-label-center">
          {frameOffset >= 0 ? '+' : ''}{frameOffset} frames ({frameOffset >= 0 ? '+' : ''}{timeOffsetSec}s)
        </span>
        <span className="slider-label-right">+10s</span>
      </div>

      <div
        ref={sliderRef}
        className="slider-track"
        onClick={handleTrackClick}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="slider"
        aria-valuemin={minOffset}
        aria-valuemax={maxOffset}
        aria-valuenow={frameOffset}
        aria-disabled={disabled}
      >
        {/* Center marker */}
        <div className="slider-center-mark" />

        {/* Fill from center */}
        <div
          className={`slider-fill ${isNegative ? 'negative' : ''} ${isPositive ? 'positive' : ''}`}
          style={{
            left: isNegative ? `${position}%` : '50%',
            width: `${Math.abs(position - 50)}%`,
          }}
        />

        {/* Thumb */}
        <div
          className={`slider-thumb ${isDragging ? 'dragging' : ''}`}
          style={{ left: `${position}%` }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="thumb-indicator" />
        </div>

        {/* Tick marks */}
        <div className="slider-ticks">
          {[-200, -150, -100, -50, 0, 50, 100, 150, 200].map(tick => (
            <div
              key={tick}
              className={`slider-tick ${tick === 0 ? 'center' : ''}`}
              style={{ left: `${getPositionFromOffset(tick)}%` }}
            />
          ))}
        </div>
      </div>

      <div className="slider-hint">
        Drag slowly for precise control, quickly for fast seeking
      </div>
    </div>
  );
}

// Convert real-world coordinates to Opta coordinate system
// Based on VectorizedOptaConverter from Python

const PITCH_LENGTH = 105.0;
const PITCH_WIDTH = 68.0;

const PITCH_X_HALF = PITCH_LENGTH / 2.0;
const PITCH_Y_HALF = PITCH_WIDTH / 2.0;

// Breakpoints for piecewise linear interpolation
const X_BREAKS_OPTA = [0, 5.8, 11.5, 17, 20.4, 41, 50];
const X_BREAKS_REAL = [0, 5.5, 11, 16.5, 20.15, 43.35, 52.5];

const Y_BREAKS_OPTA = [0, 21.1, 36.8, 40, 44.2, 45.2, 50];
const Y_BREAKS_REAL = [0, 13.84, 24.84, 26.69, 30.22, 30.34, 34];

const REAL_X_MID = 52.5;
const REAL_Y_MID = 34.0;

// Linear interpolation between breakpoints
function interp(value: number, sourceBreaks: number[], targetBreaks: number[]): number {
  // Find the interval
  let i = 0;
  while (i < sourceBreaks.length - 1 && value > sourceBreaks[i + 1]) {
    i++;
  }

  // Clamp to range
  if (i >= sourceBreaks.length - 1) {
    i = sourceBreaks.length - 2;
  }

  // Linear interpolation
  const t = (value - sourceBreaks[i]) / (sourceBreaks[i + 1] - sourceBreaks[i]);
  return targetBreaks[i] + t * (targetBreaks[i + 1] - targetBreaks[i]);
}

// Convert with mirroring for values > midpoint
function convertWithMirror(
  value: number,
  sourceBreaks: number[],
  targetBreaks: number[],
  sourceMid: number
): number {
  const isMirrored = value > sourceMid;
  const adjValue = isMirrored ? 2 * sourceMid - value : value;
  const targetMid = targetBreaks[targetBreaks.length - 1];
  const converted = interp(adjValue, sourceBreaks, targetBreaks);
  return isMirrored ? 2 * targetMid - converted : converted;
}

// Convert a single point from real coordinates to Opta
export function realToOpta(x: number, y: number): { x: number; y: number } {
  // Normalize to positive quadrant
  const normX = (x * REAL_X_MID / PITCH_X_HALF) + REAL_X_MID;
  const normY = (y * REAL_Y_MID / PITCH_Y_HALF) + REAL_Y_MID;

  // Convert using piecewise linear interpolation
  const optaX = convertWithMirror(normX, X_BREAKS_REAL, X_BREAKS_OPTA, REAL_X_MID);
  const optaY = convertWithMirror(normY, Y_BREAKS_REAL, Y_BREAKS_OPTA, REAL_Y_MID);

  return {
    x: Math.round(optaX * 100) / 100,
    y: Math.round(optaY * 100) / 100
  };
}

// Convert arrays of coordinates (for columnar data)
export function realToOptaArrays(
  xArray: number[],
  yArray: number[]
): { x: number[]; y: number[] } {
  const optaX = new Array(xArray.length);
  const optaY = new Array(yArray.length);

  for (let i = 0; i < xArray.length; i++) {
    const converted = realToOpta(xArray[i], yArray[i]);
    optaX[i] = converted.x;
    optaY[i] = converted.y;
  }

  return { x: optaX, y: optaY };
}

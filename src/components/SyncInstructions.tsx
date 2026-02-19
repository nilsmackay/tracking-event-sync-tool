import { useState, useMemo } from 'react';

interface SyncInstructionsProps {
  eventTypeId?: string | number;
  eventTypeDesc?: string;
}

// Event type categories
type EventCategory = 'pass' | 'aerial' | 'interception' | 'outofbounds' | 'other';

// Map event type IDs to categories
function getEventCategory(eventTypeId?: string | number): EventCategory {
  if (eventTypeId === undefined || eventTypeId === null) return 'other';

  const id = Number(eventTypeId);

  // Passes, clearances, shots: 1 (pass), 12 (clearance), 13, 14, 15, 16 (shots)
  if ([1, 12, 13, 14, 15, 16].includes(id)) return 'pass';

  // Aerial duels: 44
  if (id === 44) return 'aerial';

  // Interceptions/recoveries: 8 (interception), 49 (ball recovery)
  if ([8, 49].includes(id)) return 'interception';

  // Out of bounds: 5 (out), 6 (corner awarded)
  if ([5, 6].includes(id)) return 'outofbounds';

  return 'other';
}

// Get display name for category
function getCategoryName(category: EventCategory): string {
  switch (category) {
    case 'pass': return 'Passes, Clearances & Shots';
    case 'aerial': return 'Aerial Duels';
    case 'interception': return 'Interceptions & Recoveries';
    case 'outofbounds': return 'Out of Bounds & Corners';
    default: return 'General';
  }
}

// Get color for category
export function getCategoryColor(category: EventCategory): string {
  switch (category) {
    case 'pass': return '#3b82f6'; // Blue
    case 'aerial': return '#f59e0b'; // Amber
    case 'interception': return '#10b981'; // Green
    case 'outofbounds': return '#ef4444'; // Red
    default: return '#6b7280'; // Gray
  }
}

// Get instructions for category
function getInstructions(category: EventCategory): React.ReactNode {
  switch (category) {
    case 'pass':
      return (
        <>
          <p>Look for a clear frame where the ball starts accelerating away from the player. The correct sync point is the <strong>last frame before the acceleration starts</strong>.</p>
          <p>If there's no clear acceleration, look for the <strong>last frame where the ball and player circles overlap</strong>, before the ball goes in the direction of the pass/shot.</p>
          <p>If there's no clear acceleration, and the ball and player circles don't overlap, look for the <strong>first frame where the ball starts accelerating</strong> in the direction of the pass/shot.</p>
        </>
      );
    case 'aerial':
      return (
        <>
          <p>If the ball keeps traveling in the same general direction before/after the aerial duel, sync the event when the <strong>ball is as close as possible to both players</strong> in the aerial duel.</p>
          <p>If the ball changes direction significantly, follow the rules of passes/shots above.</p>
          <p><strong>Both aerial duel events should be synced to the same moment.</strong> If the aerial duel results in a shot, pass, or clearance, that event should also be synced at the same moment.</p>
        </>
      );
    case 'interception':
      return (
        <>
          <p>Look for the <strong>first frame where the ball and player circles overlap</strong>.</p>
          <p>If they never overlap, look for the frame where the <strong>ball stops moving towards the player</strong>.</p>
          <p>An interception/recovery is often followed by a pass or other event. Make sure the interception/recovery is synced <strong>BEFORE</strong> this other event.</p>
        </>
      );
    case 'outofbounds':
      return (
        <>
          <p>Out of bounds can be hard to see. The ball never crosses the line fully, and sometimes it stops before the line.</p>
          <p>Try to look at the trajectory of the ball and guess the frame at which <strong>the ball would have crossed the line</strong>. Sometimes the ball will keep moving towards the line and then clip at the line.</p>
          <p>The <strong>last frame where the ball moved towards the line</strong> is the correct sync point.</p>
          <p><strong>Out of bounds events come in pairs. Always match them to the same frame.</strong></p>
        </>
      );
    default:
      return (
        <p>Sync this event to the most appropriate frame based on when the action occurs.</p>
      );
  }
}

export function SyncInstructions({ eventTypeId, eventTypeDesc }: SyncInstructionsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const category = useMemo(() => getEventCategory(eventTypeId), [eventTypeId]);
  const categoryName = useMemo(() => getCategoryName(category), [category]);
  const categoryColor = useMemo(() => getCategoryColor(category), [category]);
  const instructions = useMemo(() => getInstructions(category), [category]);

  return (
    <div className="sync-instructions">
      <button
        className="instructions-header"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ borderLeftColor: categoryColor }}
      >
        <div className="instructions-title">
          <span className="instructions-icon">💡</span>
          <span className="instructions-category">{categoryName}</span>
          {eventTypeDesc && (
            <span className="instructions-event-type">({eventTypeDesc})</span>
          )}
        </div>
        <span className={`instructions-chevron ${isExpanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div className="instructions-content" style={{ borderLeftColor: categoryColor }}>
          <div className="instructions-body">
            {instructions}
          </div>
        </div>
      )}
    </div>
  );
}

// Export for use in PitchSVG
export { getEventCategory };
export type { EventCategory };

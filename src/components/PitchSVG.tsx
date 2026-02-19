import type { TrackingRow, EventRow } from '../types';

interface PitchSVGProps {
  frameData: TrackingRow[];
  event: EventRow | null;
  teamIds: number[];
  currentTime: number | null;
  frameOffset: number;
}

// Opta pitch dimensions: 100x100 coordinate system (0-100 for both x and y)
// We'll draw at 105x68 aspect ratio (standard pitch)
const PITCH_LENGTH = 105;
const PITCH_WIDTH = 68;
const PADDING = 5;

// Scale Opta coordinates (0-100) to pitch coordinates
function scaleX(x: number): number {
  return (x / 100) * PITCH_LENGTH + PADDING;
}

function scaleY(y: number): number {
  return (y / 100) * PITCH_WIDTH + PADDING;
}

// Helper to safely get jersey number (handles Int64/BigInt/null/NaN/various formats)
function getJerseyNo(value: unknown): string {
  // Handle null/undefined
  if (value === null || value === undefined) return '?';

  // Handle BigInt (from Int64)
  if (typeof value === 'bigint') {
    const num = Number(value);
    if (Number.isNaN(num) || !Number.isFinite(num)) return '?';
    return String(Math.round(num));
  }

  // Handle number
  if (typeof value === 'number') {
    if (Number.isNaN(value) || !Number.isFinite(value)) return '?';
    return String(Math.round(value));
  }

  // Handle string
  if (typeof value === 'string') {
    // Check for string representations of NaN/null
    const lower = value.toLowerCase().trim();
    if (lower === 'nan' || lower === 'null' || lower === 'none' || lower === '' || lower === 'na') {
      return '?';
    }
    const num = parseFloat(value);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      return String(Math.round(num));
    }
    return value;
  }

  // Handle object with toJSON or valueOf
  if (typeof value === 'object' && value !== null) {
    const objValue = value as Record<string, unknown>;
    if ('low' in objValue && typeof objValue.low === 'number') {
      // This might be an Int64 object representation
      return String(objValue.low);
    }
  }

  return '?';
}

// Player and ball sizes
const PLAYER_RADIUS = 1.2;  // Between original 1.8 and halved 0.9
const BALL_RADIUS = 0.8;    // Between original 1.2 and halved 0.6
const EVENT_SIZE = 2.0;     // Between original 3 and halved 1.5
const FONT_SIZE = 1.0;      // Between original 1.4 and halved 0.7

export function PitchSVG({ frameData, event, teamIds, currentTime, frameOffset }: PitchSVGProps) {
  const viewBoxWidth = PITCH_LENGTH + PADDING * 2;
  const viewBoxHeight = PITCH_WIDTH + PADDING * 2;

  // Extract ball and players
  const ball = frameData.find(d => d.is_ball === 1);
  const team1Players = frameData.filter(d => d.team_opta_id === teamIds[0]);
  const team2Players = frameData.filter(d => d.team_opta_id === teamIds[1]);

  // Determine team colors and z-order based on event team
  const eventTeamIsTeam1 = event?.team_id === teamIds[0];
  const team1Color = 'steelblue';
  const team2Color = 'indianred';
  const eventColor = eventTeamIsTeam1 ? team1Color : team2Color;

  // Event position
  const eventX = event ? scaleX(event.x) : 0;
  const eventY = event ? scaleY(event.y) : 0;

  // Check for valid pass end coordinates
  // Must be: non-null, non-undefined, a number, finite (not NaN/Infinity)
  const isValidCoord = (val: unknown): val is number => {
    return val !== null &&
           val !== undefined &&
           typeof val === 'number' &&
           Number.isFinite(val);
  };

  const passEndXValid = isValidCoord(event?.pass_end_x);
  const passEndYValid = isValidCoord(event?.pass_end_y);

  // Also check that the coordinates aren't both 0 (often indicates missing data)
  // and that end point is different from start point
  const endPointIsDifferent = passEndXValid && passEndYValid &&
    !(event!.pass_end_x === 0 && event!.pass_end_y === 0) &&
    (event!.pass_end_x !== event!.x || event!.pass_end_y !== event!.y);


  const hasPassEnd = passEndXValid && passEndYValid && endPointIsDifferent;
  const passEndX = hasPassEnd ? scaleX(event!.pass_end_x!) : 0;
  const passEndY = hasPassEnd ? scaleY(event!.pass_end_y!) : 0;

  // Check if event is synced
  const eventId = event ? String(event.opta_event_id ?? '') : '';
  const timeDiff = currentTime !== null && event ? currentTime - event.matched_time : 0;
  const sign = timeDiff >= 0 ? '+' : '';

  return (
    <div className="pitch-container">
      {/* Title */}
      <div className="pitch-title">
        {event && (
          <>
            <strong>'{event.event_type_desc || event.event_type_id}'</strong> event |
            Player: {getJerseyNo(event.jersey_no)} ({eventTeamIsTeam1 ? 'Blue team' : 'Red team'})
          </>
        )}
      </div>
      <div className="pitch-subtitle">
        {event && currentTime !== null && (
          <>
            Event: {eventId} - Type '{event.event_type_id}' |
            Time: {currentTime}ms | Opta: {event.matched_time}ms |
            Offset: {sign}{timeDiff}ms | {frameOffset} frames
          </>
        )}
      </div>

      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        className="pitch-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Pitch background */}
        <rect
          x={PADDING}
          y={PADDING}
          width={PITCH_LENGTH}
          height={PITCH_WIDTH}
          fill="#2d5a27"
          stroke="white"
          strokeWidth={0.3}
        />

        {/* Center circle */}
        <circle
          cx={PADDING + PITCH_LENGTH / 2}
          cy={PADDING + PITCH_WIDTH / 2}
          r={9.15}
          fill="none"
          stroke="white"
          strokeWidth={0.3}
        />

        {/* Center spot */}
        <circle
          cx={PADDING + PITCH_LENGTH / 2}
          cy={PADDING + PITCH_WIDTH / 2}
          r={0.5}
          fill="white"
        />

        {/* Center line */}
        <line
          x1={PADDING + PITCH_LENGTH / 2}
          y1={PADDING}
          x2={PADDING + PITCH_LENGTH / 2}
          y2={PADDING + PITCH_WIDTH}
          stroke="white"
          strokeWidth={0.3}
        />

        {/* Left penalty area */}
        <rect
          x={PADDING}
          y={PADDING + (PITCH_WIDTH - 40.32) / 2}
          width={16.5}
          height={40.32}
          fill="none"
          stroke="white"
          strokeWidth={0.3}
        />

        {/* Left goal area */}
        <rect
          x={PADDING}
          y={PADDING + (PITCH_WIDTH - 18.32) / 2}
          width={5.5}
          height={18.32}
          fill="none"
          stroke="white"
          strokeWidth={0.3}
        />

        {/* Left penalty spot */}
        <circle
          cx={PADDING + 11}
          cy={PADDING + PITCH_WIDTH / 2}
          r={0.5}
          fill="white"
        />

        {/* Left penalty arc */}
        <path
          d={`M ${PADDING + 16.5} ${PADDING + PITCH_WIDTH / 2 - 9.15} A 9.15 9.15 0 0 1 ${PADDING + 16.5} ${PADDING + PITCH_WIDTH / 2 + 9.15}`}
          fill="none"
          stroke="white"
          strokeWidth={0.3}
        />

        {/* Right penalty area */}
        <rect
          x={PADDING + PITCH_LENGTH - 16.5}
          y={PADDING + (PITCH_WIDTH - 40.32) / 2}
          width={16.5}
          height={40.32}
          fill="none"
          stroke="white"
          strokeWidth={0.3}
        />

        {/* Right goal area */}
        <rect
          x={PADDING + PITCH_LENGTH - 5.5}
          y={PADDING + (PITCH_WIDTH - 18.32) / 2}
          width={5.5}
          height={18.32}
          fill="none"
          stroke="white"
          strokeWidth={0.3}
        />

        {/* Right penalty spot */}
        <circle
          cx={PADDING + PITCH_LENGTH - 11}
          cy={PADDING + PITCH_WIDTH / 2}
          r={0.5}
          fill="white"
        />

        {/* Right penalty arc */}
        <path
          d={`M ${PADDING + PITCH_LENGTH - 16.5} ${PADDING + PITCH_WIDTH / 2 - 9.15} A 9.15 9.15 0 0 0 ${PADDING + PITCH_LENGTH - 16.5} ${PADDING + PITCH_WIDTH / 2 + 9.15}`}
          fill="none"
          stroke="white"
          strokeWidth={0.3}
        />

        {/* Goals */}
        <rect
          x={PADDING - 2}
          y={PADDING + (PITCH_WIDTH - 7.32) / 2}
          width={2}
          height={7.32}
          fill="none"
          stroke="white"
          strokeWidth={0.3}
        />
        <rect
          x={PADDING + PITCH_LENGTH}
          y={PADDING + (PITCH_WIDTH - 7.32) / 2}
          width={2}
          height={7.32}
          fill="none"
          stroke="white"
          strokeWidth={0.3}
        />

        {/* Corner arcs */}
        <path d={`M ${PADDING} ${PADDING + 1} A 1 1 0 0 0 ${PADDING + 1} ${PADDING}`} fill="none" stroke="white" strokeWidth={0.3} />
        <path d={`M ${PADDING + PITCH_LENGTH - 1} ${PADDING} A 1 1 0 0 0 ${PADDING + PITCH_LENGTH} ${PADDING + 1}`} fill="none" stroke="white" strokeWidth={0.3} />
        <path d={`M ${PADDING} ${PADDING + PITCH_WIDTH - 1} A 1 1 0 0 1 ${PADDING + 1} ${PADDING + PITCH_WIDTH}`} fill="none" stroke="white" strokeWidth={0.3} />
        <path d={`M ${PADDING + PITCH_LENGTH - 1} ${PADDING + PITCH_WIDTH} A 1 1 0 0 1 ${PADDING + PITCH_LENGTH} ${PADDING + PITCH_WIDTH - 1}`} fill="none" stroke="white" strokeWidth={0.3} />

        {/* Z-order: event (bottom) -> non-event team -> event team -> ball (top) */}

        {/* Event marker (at the bottom) */}
        {event && (
          <>
            {hasPassEnd && (
              <line
                x1={eventX}
                y1={eventY}
                x2={passEndX}
                y2={passEndY}
                stroke="#00FF00"
                strokeWidth={0.25}
                markerEnd="url(#arrowhead)"
              />
            )}
            <rect
              x={eventX - EVENT_SIZE / 2}
              y={eventY - EVENT_SIZE / 2}
              width={EVENT_SIZE}
              height={EVENT_SIZE}
              fill={eventColor}
              stroke="#00FF00"
              strokeWidth={0.2}
            />
            <text
              x={eventX}
              y={eventY}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={FONT_SIZE}
              fill="white"
              fontWeight="bold"
            >
              {getJerseyNo(event.jersey_no)}
            </text>
          </>
        )}

        {/* Non-event team (behind event team) */}
        {(eventTeamIsTeam1 ? team2Players : team1Players).map((player, idx) => (
          <g key={`team-behind-${idx}`}>
            <circle
              cx={scaleX(player.pos_x)}
              cy={scaleY(player.pos_y)}
              r={PLAYER_RADIUS}
              fill={eventTeamIsTeam1 ? team2Color : team1Color}
              stroke="black"
              strokeWidth={0.1}
            />
            <text
              x={scaleX(player.pos_x)}
              y={scaleY(player.pos_y)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={FONT_SIZE}
              fill="white"
              fontWeight="bold"
            >
              {getJerseyNo(player.jersey_no)}
            </text>
          </g>
        ))}

        {/* Event team (on top of non-event team) */}
        {(eventTeamIsTeam1 ? team1Players : team2Players).map((player, idx) => (
          <g key={`team-front-${idx}`}>
            <circle
              cx={scaleX(player.pos_x)}
              cy={scaleY(player.pos_y)}
              r={PLAYER_RADIUS}
              fill={eventTeamIsTeam1 ? team1Color : team2Color}
              stroke="black"
              strokeWidth={0.1}
            />
            <text
              x={scaleX(player.pos_x)}
              y={scaleY(player.pos_y)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={FONT_SIZE}
              fill="white"
              fontWeight="bold"
            >
              {getJerseyNo(player.jersey_no)}
            </text>
          </g>
        ))}

        {/* Ball (on top of everything) */}
        {ball && (
          <circle
            cx={scaleX(ball.pos_x)}
            cy={scaleY(ball.pos_y)}
            r={BALL_RADIUS}
            fill="white"
            stroke="black"
            strokeWidth={0.1}
          />
        )}


        {/* Arrow marker definition */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth={3}
            markerHeight={3}
            refX={2}
            refY={1.5}
            orient="auto"
          >
            <polygon points="0 0, 3 1.5, 0 3" fill="#00FF00" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

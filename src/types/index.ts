// Types for tracking and event data

export interface TrackingRow {
  period_id: number;
  matched_time: number;
  team_opta_id: number;
  jersey_no: number;
  pos_x: number;
  pos_y: number;
  is_ball: number;
}

export interface EventRow {
  opta_event_id: string | number;
  period_id: number;
  matched_time: number;
  team_id: number;
  jersey_no: number;
  x: number;
  y: number;
  pass_end_x?: number;
  pass_end_y?: number;
  event_type_id?: string | number;
  event_type_desc?: string;
}

// Columnar data format for efficient storage and access
export interface ColumnarData {
  columns: Record<string, unknown[]>;
  numRows: number;
  fieldNames: string[];
}

// Helper to get a row from columnar data
export function getRow<T>(data: ColumnarData, index: number): T {
  const row = {} as T;
  for (const name of data.fieldNames) {
    (row as Record<string, unknown>)[name] = data.columns[name][index];
  }
  return row;
}

export interface SyncedResults {
  [eventId: string]: number;
}

export interface Metadata {
  gameUuid: string;
  teamIds: number[];
}

export interface AppState {
  eventsData: ColumnarData | null;
  trackingData: ColumnarData | null;
  metadata: Metadata | null;
  syncedResults: SyncedResults;
  currentEventIndex: number;
  frameOffset: number;
  lastSyncOffset: number;
  isLoading: boolean;
  hasData: boolean;
}

import { useState, useCallback, useRef, useEffect } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { useSyncContext } from '../context/SyncContext';
import type { ColumnarData, Metadata } from '../types';
import { realToOptaArrays } from '../utils/optaConverter';

// Import Web Worker
import ParquetWorker from '../workers/parquetWorker?worker';

// Convert tracking data pos_x and pos_y from real coordinates to Opta coordinates
function convertTrackingToOpta(data: ColumnarData): ColumnarData {
  const posXCol = data.columns['pos_x'] as number[];
  const posYCol = data.columns['pos_y'] as number[];

  if (!posXCol || !posYCol) {
    console.warn('Tracking data missing pos_x or pos_y columns, skipping conversion');
    return data;
  }

  const { x: optaX, y: optaY } = realToOptaArrays(posXCol, posYCol);

  return {
    ...data,
    columns: {
      ...data.columns,
      pos_x: optaX,
      pos_y: optaY,
    }
  };
}

// Filter events to only include syncable events
// - Must have x and y coordinates
// - Must be in period 1 or 2
// - Must be specific event types
const SYNCABLE_EVENT_TYPES = new Set([1, 5, 49, 12, 44, 6, 8, 13, 14, 15, 16, 2]);

function filterEventsToSync(data: ColumnarData): ColumnarData {
  const xCol = data.columns['x'] as (number | null)[];
  const yCol = data.columns['y'] as (number | null)[];
  const periodCol = data.columns['period_id'] as number[];
  const eventTypeCol = data.columns['event_type_id'] as number[];

  if (!xCol || !yCol || !periodCol || !eventTypeCol) {
    console.warn('Events data missing required columns for filtering');
    return data;
  }

  // Find indices that match the filter criteria
  const validIndices: number[] = [];
  for (let i = 0; i < data.numRows; i++) {
    const x = xCol[i];
    const y = yCol[i];
    const period = periodCol[i];
    const eventType = eventTypeCol[i];

    if (
      x !== null && x !== undefined && !Number.isNaN(x) &&
      y !== null && y !== undefined && !Number.isNaN(y) &&
      (period === 1 || period === 2) &&
      SYNCABLE_EVENT_TYPES.has(eventType)
    ) {
      validIndices.push(i);
    }
  }

  // Create filtered columnar data
  const filteredColumns: Record<string, unknown[]> = {};
  for (const fieldName of data.fieldNames) {
    const col = data.columns[fieldName];
    filteredColumns[fieldName] = validIndices.map(i => col[i]);
  }

  return {
    columns: filteredColumns,
    numRows: validIndices.length,
    fieldNames: data.fieldNames
  };
}

// Map jersey numbers from tracking data to events
// Uses player_opta_id from tracking to match player_id in events
function mapJerseyNumbersToEvents(events: ColumnarData, tracking: ColumnarData): ColumnarData {
  // Build mapping from player_opta_id to jersey_no from tracking data
  const playerOptaIdCol = tracking.columns['player_opta_id'] as number[];
  const trackingJerseyCol = tracking.columns['jersey_no'] as number[];

  if (!playerOptaIdCol || !trackingJerseyCol) {
    console.warn('Tracking data missing player_opta_id or jersey_no columns');
    return events;
  }

  const playerJerseyMap = new Map<number, number>();
  for (let i = 0; i < tracking.numRows; i++) {
    const playerId = playerOptaIdCol[i];
    const jerseyNo = trackingJerseyCol[i];
    if (playerId !== null && playerId !== undefined && playerId !== -1 &&
        jerseyNo !== null && jerseyNo !== undefined) {
      playerJerseyMap.set(playerId, jerseyNo);
    }
  }

  // Map jersey numbers to events using player_id
  const eventPlayerIdCol = events.columns['player_id'] as number[];
  if (!eventPlayerIdCol) {
    console.warn('Events data missing player_id column');
    return events;
  }

  const mappedJerseyNos: (number | null)[] = new Array(events.numRows);
  for (let i = 0; i < events.numRows; i++) {
    const playerId = eventPlayerIdCol[i];
    if (playerId !== null && playerId !== undefined && playerJerseyMap.has(playerId)) {
      mappedJerseyNos[i] = playerJerseyMap.get(playerId)!;
    } else {
      mappedJerseyNos[i] = null;
    }
  }

  // Add or replace jersey_no column
  const newFieldNames = events.fieldNames.includes('jersey_no')
    ? events.fieldNames
    : [...events.fieldNames, 'jersey_no'];

  return {
    columns: {
      ...events.columns,
      jersey_no: mappedJerseyNos
    },
    numRows: events.numRows,
    fieldNames: newFieldNames
  };
}

interface FileUploadState {
  tracking: File | null;
  events: File | null;
  trackingParsed: ColumnarData | null;
  eventsParsed: ColumnarData | null;
  isLoading: boolean;
  error: string | null;
  progress: number;
}

export function UploadPage() {
  const { saveData } = useSyncContext();
  const [state, setState] = useState<FileUploadState>({
    tracking: null,
    events: null,
    trackingParsed: null,
    eventsParsed: null,
    isLoading: false,
    error: null,
    progress: 0,
  });

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  // Initialize worker on mount
  useEffect(() => {
    workerRef.current = new ParquetWorker();

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const parseParquetFile = useCallback((file: File): Promise<ColumnarData> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = ++requestIdRef.current;

      // Accumulate columns as they arrive
      let numRows = 0;
      let fieldNames: string[] = [];
      const columns: Record<string, unknown[]> = {};

      const handleMessage = (e: MessageEvent) => {
        if (e.data.id !== id) return;

        if (e.data.type === 'progress') {
          setState(prev => ({ ...prev, progress: e.data.progress }));
        } else if (e.data.type === 'metadata') {
          // Received metadata - store it
          numRows = e.data.data.numRows;
          fieldNames = e.data.data.fieldNames;
        } else if (e.data.type === 'column') {
          // Received a column - store it
          columns[e.data.fieldName] = e.data.data;
        } else if (e.data.type === 'success') {
          workerRef.current?.removeEventListener('message', handleMessage);
          setState(prev => ({ ...prev, progress: 100 }));

          // Return columnar data directly - no row conversion needed
          resolve({ columns, numRows, fieldNames });
        } else if (e.data.type === 'error') {
          workerRef.current?.removeEventListener('message', handleMessage);
          reject(new Error(e.data.error));
        }
      };

      workerRef.current.addEventListener('message', handleMessage);

      // Read file and send to worker
      file.arrayBuffer().then(buffer => {
        workerRef.current?.postMessage({
          type: 'parse',
          id,
          data: buffer
        }, [buffer]); // Transfer buffer to worker
      }).catch(reject);
    });
  }, []);

  const handleFileDrop = useCallback(async (e: DragEvent<HTMLDivElement>, type: 'tracking' | 'events') => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith('.parquet')) {
      setState(prev => ({ ...prev, error: 'Please upload a .parquet file' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null, progress: 0 }));

    try {
      let data = await parseParquetFile(file);

      if (type === 'tracking') {
        // Convert tracking positions from real coordinates to Opta coordinates
        data = convertTrackingToOpta(data);

        setState(prev => ({
          ...prev,
          tracking: file,
          trackingParsed: data,
          isLoading: false,
        }));
      } else {
        // Filter events to only include syncable events
        data = filterEventsToSync(data);

        setState(prev => ({
          ...prev,
          events: file,
          eventsParsed: data,
          isLoading: false,
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Failed to parse ${type} file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }));
    }
  }, [parseParquetFile]);

  const handleFileSelect = useCallback(async (e: ChangeEvent<HTMLInputElement>, type: 'tracking' | 'events') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.parquet')) {
      setState(prev => ({ ...prev, error: 'Please upload a .parquet file' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null, progress: 0 }));

    try {
      let data = await parseParquetFile(file);

      if (type === 'tracking') {
        // Convert tracking positions from real coordinates to Opta coordinates
        data = convertTrackingToOpta(data);

        setState(prev => ({
          ...prev,
          tracking: file,
          trackingParsed: data,
          isLoading: false,
        }));
      } else {
        // Filter events to only include syncable events
        data = filterEventsToSync(data);

        setState(prev => ({
          ...prev,
          events: file,
          eventsParsed: data,
          isLoading: false,
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Failed to parse ${type} file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }));
    }
  }, [parseParquetFile]);

  const handleStartSync = useCallback(async () => {
    if (!state.trackingParsed || !state.eventsParsed || !state.tracking) {
      setState(prev => ({ ...prev, error: 'Please upload both files first' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Extract game UUID from filename (remove extension)
      const gameUuid = state.tracking.name.replace('.parquet', '').replace('tracking_', '').replace('events_', '');

      // Extract team IDs from tracking data (columnar format)
      const teamOptaIdCol = state.trackingParsed.columns['team_opta_id'] as number[];
      const uniqueTeamIds = [...new Set(teamOptaIdCol)].filter(id => id !== -1 && id !== undefined && id !== null);

      if (uniqueTeamIds.length < 2) {
        setState(prev => ({ ...prev, error: 'Could not detect two teams from tracking data', isLoading: false }));
        return;
      }

      const metadata: Metadata = {
        gameUuid,
        teamIds: uniqueTeamIds.slice(0, 2) as number[],
      };

      // Map jersey numbers from tracking to events using player_id -> player_opta_id
      const eventsWithJersey = mapJerseyNumbersToEvents(state.eventsParsed, state.trackingParsed);

      await saveData(state.trackingParsed, eventsWithJersey, metadata);
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Failed to save data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }));
    }
  }, [state.trackingParsed, state.eventsParsed, state.tracking, saveData]);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const canStart = state.trackingParsed && state.eventsParsed && !state.isLoading;

  return (
    <div className="upload-page">
      <h1>Event Tracking Sync Tool</h1>
      <p className="subtitle">Upload your parquet files to begin syncing events with tracking data</p>

      {state.error && (
        <div className="error-message">
          {state.error}
        </div>
      )}

      <div className="upload-zones">
        {/* Tracking file upload */}
        <div
          className={`upload-zone ${state.tracking ? 'uploaded' : ''}`}
          onDrop={(e) => handleFileDrop(e, 'tracking')}
          onDragOver={handleDragOver}
        >
          <div className="upload-icon">📊</div>
          <h3>Tracking Data</h3>
          {state.tracking ? (
            <div className="file-info">
              <span className="file-name">{state.tracking.name}</span>
              <span className="row-count">{state.trackingParsed?.numRows.toLocaleString()} rows</span>
            </div>
          ) : (
            <p>Drag & drop or click to select</p>
          )}
          <input
            type="file"
            accept=".parquet"
            onChange={(e) => handleFileSelect(e, 'tracking')}
            className="file-input"
          />
        </div>

        {/* Events file upload */}
        <div
          className={`upload-zone ${state.events ? 'uploaded' : ''}`}
          onDrop={(e) => handleFileDrop(e, 'events')}
          onDragOver={handleDragOver}
        >
          <div className="upload-icon">⚽</div>
          <h3>Events Data</h3>
          {state.events ? (
            <div className="file-info">
              <span className="file-name">{state.events.name}</span>
              <span className="row-count">{state.eventsParsed?.numRows.toLocaleString()} rows</span>
            </div>
          ) : (
            <p>Drag & drop or click to select</p>
          )}
          <input
            type="file"
            accept=".parquet"
            onChange={(e) => handleFileSelect(e, 'events')}
            className="file-input"
          />
        </div>
      </div>

      {state.isLoading && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Processing files... {state.progress > 0 ? `${state.progress}%` : ''}</p>
          {state.progress > 0 && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${state.progress}%` }}></div>
            </div>
          )}
        </div>
      )}

      <button
        className="start-button"
        onClick={handleStartSync}
        disabled={!canStart}
      >
        Start Syncing
      </button>
    </div>
  );
}

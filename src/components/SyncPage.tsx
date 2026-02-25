import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useSyncContext } from '../context/SyncContext';
import { PitchSVG } from './PitchSVG';
import { FrameSlider } from './FrameSlider';
import { SyncInstructions, getEventCategory } from './SyncInstructions';
import type { TrackingRow, EventRow, SyncedResults } from '../types';

export function SyncPage() {
  const {
    eventsData,
    trackingData,
    metadata,
    syncedResults,
    currentEventIndex,
    frameOffset,
    setFrameOffset,
    adjustFrameOffset,
    nextEvent,
    prevEvent,
    nextUnsynced,
    jumpToEvent,
    syncCurrentEvent,
    skipEvent,
    downloadResults,
    uploadResults,
    resetAll,
  } = useSyncContext();

  // Helper to get event row from columnar data
  const getEventRow = useCallback((index: number): EventRow | null => {
    if (!eventsData || index >= eventsData.numRows) return null;
    const row: Record<string, unknown> = {};
    for (const name of eventsData.fieldNames) {
      row[name] = eventsData.columns[name][index];
    }
    return row as unknown as EventRow;
  }, [eventsData]);

  // Get current event
  const currentEvent = useMemo(() => {
    return getEventRow(currentEventIndex);
  }, [getEventRow, currentEventIndex]);

  // Get frame data for current event with offset
  const { frameData, currentTime, frameIdx, totalFrames } = useMemo(() => {
    if (!currentEvent || !trackingData) {
      return { frameData: [] as TrackingRow[], currentTime: null, frameIdx: 0, totalFrames: 0 };
    }

    const period = currentEvent.period_id;
    const baseTime = currentEvent.matched_time;

    // Get columns
    const periodCol = trackingData.columns['period_id'] as number[];
    const timeCol = trackingData.columns['matched_time'] as number[];

    // Get unique times for this period
    const timesSet = new Set<number>();
    for (let i = 0; i < trackingData.numRows; i++) {
      if (periodCol[i] === period) {
        timesSet.add(timeCol[i]);
      }
    }
    const uniqueTimes = [...timesSet].sort((a, b) => a - b);

    if (uniqueTimes.length === 0) {
      return { frameData: [] as TrackingRow[], currentTime: null, frameIdx: 0, totalFrames: 0 };
    }

    // Find base index
    let baseIdx = uniqueTimes.findIndex(t => t >= baseTime);
    if (baseIdx === -1) baseIdx = uniqueTimes.length - 1;

    // Apply offset
    let targetIdx = baseIdx + frameOffset;
    targetIdx = Math.max(0, Math.min(uniqueTimes.length - 1, targetIdx));

    const targetTime = uniqueTimes[targetIdx];

    // Get frame data for this time - convert to row objects for PitchSVG
    const frameData: TrackingRow[] = [];
    for (let i = 0; i < trackingData.numRows; i++) {
      if (periodCol[i] === period && timeCol[i] === targetTime) {
        const row: Record<string, unknown> = {};
        for (const name of trackingData.fieldNames) {
          row[name] = trackingData.columns[name][i];
        }
        frameData.push(row as unknown as TrackingRow);
      }
    }

    return {
      frameData,
      currentTime: targetTime,
      frameIdx: targetIdx,
      totalFrames: uniqueTimes.length,
    };
  }, [currentEvent, trackingData, frameOffset]);

  // Check if current event is synced
  const isCurrentSynced = useMemo(() => {
    if (!currentEvent) return false;
    const eventId = String(currentEvent.opta_event_id ?? currentEventIndex);
    return eventId in syncedResults;
  }, [currentEvent, currentEventIndex, syncedResults]);

  // Check if all events are processed
  const isComplete = !eventsData || currentEventIndex >= eventsData.numRows;

  // Has no tracking data for current period
  const noTrackingData = currentTime === null && currentEvent !== null;

  // State for reset confirmation dialog
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Get the synced time for the chronologically previous event
  const previousEventSyncedTime = useMemo(() => {
    if (currentEventIndex <= 0 || !eventsData) return null;

    // Get the previous event (chronologically, which is index - 1 since events are sorted)
    const prevEvent = getEventRow(currentEventIndex - 1);
    if (!prevEvent) return null;

    const prevEventId = String(prevEvent.opta_event_id ?? (currentEventIndex - 1));
    return syncedResults[prevEventId] ?? null;
  }, [currentEventIndex, eventsData, getEventRow, syncedResults]);

  // Handle sync
  const handleSync = useCallback(() => {
    if (currentTime !== null) {
      syncCurrentEvent(currentTime);
    }
  }, [currentTime, syncCurrentEvent]);

  // Handle sync to same frame as previous event
  const handleSyncToPrevious = useCallback(() => {
    if (previousEventSyncedTime !== null) {
      syncCurrentEvent(previousEventSyncedTime);
    }
  }, [previousEventSyncedTime, syncCurrentEvent]);

  // Handle reset with confirmation
  const handleResetClick = useCallback(() => {
    setShowResetConfirm(true);
  }, []);

  const handleResetConfirm = useCallback(() => {
    setShowResetConfirm(false);
    resetAll();
  }, [resetAll]);

  const handleResetCancel = useCallback(() => {
    setShowResetConfirm(false);
  }, []);

  // Upload JSON state and handlers
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = useCallback(() => {
    if (Object.keys(syncedResults).length > 0) {
      setShowUploadConfirm(true);
    } else {
      fileInputRef.current?.click();
    }
  }, [syncedResults]);

  const handleUploadConfirm = useCallback(() => {
    setShowUploadConfirm(false);
    fileInputRef.current?.click();
  }, []);

  const handleUploadCancel = useCallback(() => {
    setShowUploadConfirm(false);
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        alert('Failed to upload JSON: Invalid format — expected a JSON object');
        return;
      }

      const results: SyncedResults = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value !== 'number') {
          alert(`Failed to upload JSON: Invalid value for event "${key}" — expected a number`);
          return;
        }
        results[key] = value;
      }

      await uploadResults(results);
    } catch (err) {
      alert(`Failed to upload JSON: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Reset file input so the same file can be re-selected
    e.target.value = '';
  }, [uploadResults]);

  // Keyboard arrow keys for frame navigation (hold to repeat at 50ms)
  const heldKeyRef = useRef<string | null>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const clearRepeat = () => {
      if (delayTimerRef.current !== null) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
      if (repeatTimerRef.current !== null) {
        clearInterval(repeatTimerRef.current);
        repeatTimerRef.current = null;
      }
      heldKeyRef.current = null;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      // Ignore browser-generated repeats; we handle our own interval
      if (e.repeat) {
        e.preventDefault();
        return;
      }

      e.preventDefault();

      const delta = e.key === 'ArrowLeft' ? -1 : 1;

      // Immediate first step
      adjustFrameOffset(delta);

      // Start repeat: initial delay, then fast interval
      heldKeyRef.current = e.key;
      delayTimerRef.current = setTimeout(() => {
        delayTimerRef.current = null;
        repeatTimerRef.current = setInterval(() => {
          adjustFrameOffset(delta);
        }, 50);
      }, 300);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === heldKeyRef.current) {
        clearRepeat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearRepeat);

    return () => {
      clearRepeat();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearRepeat);
    };
  }, [adjustFrameOffset]);

  // Jump to event handler
  const [jumpValue, setJumpValue] = useState(currentEventIndex);

  useEffect(() => {
    setJumpValue(currentEventIndex);
  }, [currentEventIndex]);

  const handleJump = useCallback(() => {
    jumpToEvent(jumpValue);
  }, [jumpValue, jumpToEvent]);

  if (isComplete) {
    return (
      <div className="sync-page">
        <div className="completion-screen">
          <h2>✓ Complete!</h2>
          <p>All events have been processed.</p>
          <p><strong>Synced:</strong> {Object.keys(syncedResults).length} events</p>

          <div className="completion-buttons">
            <button className="download-button" onClick={downloadResults}>
              📥 Download Results JSON
            </button>
            <button className="upload-button" onClick={handleUploadClick}>
              📤 Upload Results JSON
            </button>
            <button className="reset-button" onClick={handleResetClick}>
              🔄 Reset All Data
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Reset confirmation dialog */}
        {showResetConfirm && (
          <div className="modal-overlay">
            <div className="modal-dialog">
              <div className="modal-icon">⚠️</div>
              <h2>Reset All Data?</h2>
              <p>This will permanently delete:</p>
              <ul>
                <li>All uploaded tracking data</li>
                <li>All uploaded events data</li>
                <li><strong>{Object.keys(syncedResults).length} synced events</strong></li>
              </ul>
              <p className="modal-warning">This action cannot be undone!</p>
              <div className="modal-buttons">
                <button className="modal-cancel" onClick={handleResetCancel}>
                  Cancel
                </button>
                <button className="modal-confirm" onClick={handleResetConfirm}>
                  Yes, Reset Everything
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload confirmation dialog */}
        {showUploadConfirm && (
          <div className="modal-overlay">
            <div className="modal-dialog">
              <div className="modal-icon">⚠️</div>
              <h2>Upload Results JSON?</h2>
              <p>This will <strong>replace all existing synced results</strong> with the uploaded file.</p>
              <p>You currently have <strong>{Object.keys(syncedResults).length} synced events</strong> that will be lost.</p>
              <p className="modal-warning">This action cannot be undone!</p>
              <div className="modal-buttons">
                <button className="modal-cancel" onClick={handleUploadCancel}>
                  Cancel
                </button>
                <button className="modal-confirm" onClick={handleUploadConfirm}>
                  Yes, Replace Results
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sync-page">
      {/* Main layout: pitch + side panel */}
      <div className="sync-layout">
        {/* Left: Pitch and controls */}
        <div className="pitch-section">
          {/* Sync instructions dropdown */}
          <SyncInstructions
            eventTypeId={currentEvent?.event_type_id}
            eventTypeDesc={currentEvent?.event_type_desc}
          />

          {/* Pitch visualization */}
          <div
            className="pitch-wrapper"
            data-event-category={getEventCategory(currentEvent?.event_type_id)}
          >
            <PitchSVG
              frameData={frameData}
              event={currentEvent}
              teamIds={metadata?.teamIds || []}
              currentTime={currentTime}
              frameOffset={frameOffset}
            />
            {isCurrentSynced && (
              <div className="synced-overlay">[ALREADY SYNCED]</div>
            )}
          </div>

          {/* Sync/Skip buttons - directly under pitch */}
          <div className="action-buttons">
            <button
              onClick={handleSync}
              disabled={noTrackingData}
              className="sync-button"
            >
              ✓ Sync & Next
            </button>
            <button
              onClick={handleSyncToPrevious}
              disabled={previousEventSyncedTime === null}
              className="sync-previous-button"
              title={previousEventSyncedTime !== null ? `Sync to ${previousEventSyncedTime}ms` : 'No previous event synced'}
            >
              ⏮ Sync to Previous
            </button>
            <button onClick={skipEvent} className="skip-button">
              ⏭ Skip
            </button>
          </div>

          {/* Frame navigation */}
          <div className="frame-navigation">
            <FrameSlider
              frameOffset={frameOffset}
              onOffsetChange={setFrameOffset}
              disabled={noTrackingData}
              minOffset={-250}
              maxOffset={250}
            />
            <div className="button-row">
              <button onClick={() => adjustFrameOffset(-10)} disabled={noTrackingData}>-10</button>
              <button onClick={() => adjustFrameOffset(-5)} disabled={noTrackingData}>-5</button>
              <button onClick={() => adjustFrameOffset(-1)} disabled={noTrackingData}>-1</button>
              <button onClick={() => adjustFrameOffset(1)} disabled={noTrackingData}>+1</button>
              <button onClick={() => adjustFrameOffset(5)} disabled={noTrackingData}>+5</button>
              <button onClick={() => adjustFrameOffset(10)} disabled={noTrackingData}>+10</button>
            </div>
          </div>
        </div>

        {/* Right: Event info side panel */}
        <div className="info-panel">
          {/* Progress */}
          <div className="info-section">
            <div className="info-label">Progress</div>
            <div className="info-value">{currentEventIndex + 1} / {eventsData?.numRows ?? 0}</div>
            <div className="info-subtext">{Object.keys(syncedResults).length} synced</div>
          </div>

          {/* Event details */}
          <div className="info-section">
            <div className="info-label">Event</div>
            <div className="info-value">{currentEvent?.event_type_desc || currentEvent?.event_type_id || '—'}</div>
            <div className="info-subtext">ID: {currentEvent?.opta_event_id ?? '—'}</div>
          </div>

          {/* Period & Time */}
          <div className="info-section">
            <div className="info-label">Period</div>
            <div className="info-value">{currentEvent?.period_id ?? '—'}</div>
          </div>

          <div className="info-section">
            <div className="info-label">Event Time</div>
            <div className="info-value">{currentEvent?.matched_time ?? '—'}ms</div>
          </div>

          {/* Frame info */}
          <div className="info-section">
            <div className="info-label">Current Time</div>
            <div className="info-value">{currentTime ?? '—'}ms</div>
            <div className="info-subtext">
              {currentTime !== null && currentEvent ? (
                <>Offset: {currentTime - currentEvent.matched_time >= 0 ? '+' : ''}{currentTime - currentEvent.matched_time}ms</>
              ) : '—'}
            </div>
          </div>

          <div className="info-section">
            <div className="info-label">Current Frame</div>
            <div className="info-value">{frameIdx + 1} / {totalFrames}</div>
            <div className="info-subtext">{frameOffset >= 0 ? '+' : ''}{frameOffset} frames</div>
          </div>


          {noTrackingData && (
            <div className="info-section status-warning">
              <div className="info-label">Warning</div>
              <div className="info-value">No tracking data</div>
            </div>
          )}

          {/* Event navigation */}
          <div className="info-section event-nav">
            <div className="info-label">Event Navigation</div>
            <div className="nav-buttons">
              <button onClick={prevEvent}>◀ Prev</button>
              <button onClick={nextEvent}>Next ▶</button>
            </div>
            <button onClick={nextUnsynced} className="next-unsynced-btn">Next Unsynced ⏩</button>
            <div className="jump-controls">
              <input
                type="number"
                value={jumpValue}
                onChange={(e) => setJumpValue(Number(e.target.value))}
                min={0}
                max={(eventsData?.numRows ?? 1) - 1}
                placeholder="Jump to"
              />
              <button onClick={handleJump}>Go</button>
            </div>
          </div>

          {/* Actions */}
          <div className="info-section actions-section">
            <button className="download-button" onClick={downloadResults}>
              📥 Download JSON
            </button>
            <button className="upload-button" onClick={handleUploadClick}>
              📤 Upload JSON
            </button>
            <button className="reset-button" onClick={handleResetClick}>
              🔄 Reset
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>

      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-icon">⚠️</div>
            <h2>Reset All Data?</h2>
            <p>This will permanently delete:</p>
            <ul>
              <li>All uploaded tracking data</li>
              <li>All uploaded events data</li>
              <li><strong>{Object.keys(syncedResults).length} synced events</strong></li>
            </ul>
            <p className="modal-warning">This action cannot be undone!</p>
            <div className="modal-buttons">
              <button className="modal-cancel" onClick={handleResetCancel}>
                Cancel
              </button>
              <button className="modal-confirm" onClick={handleResetConfirm}>
                Yes, Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload confirmation dialog */}
      {showUploadConfirm && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-icon">⚠️</div>
            <h2>Upload Results JSON?</h2>
            <p>This will <strong>replace all existing synced results</strong> with the uploaded file.</p>
            <p>You currently have <strong>{Object.keys(syncedResults).length} synced events</strong> that will be lost.</p>
            <p className="modal-warning">This action cannot be undone!</p>
            <div className="modal-buttons">
              <button className="modal-cancel" onClick={handleUploadCancel}>
                Cancel
              </button>
              <button className="modal-confirm" onClick={handleUploadConfirm}>
                Yes, Replace Results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

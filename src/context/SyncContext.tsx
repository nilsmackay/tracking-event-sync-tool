import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  loadTrackingData,
  loadEventsData,
  loadMetadata,
  loadSyncedResults,
  saveSyncedResults,
  saveTrackingData,
  saveEventsData,
  saveMetadata,
  clearAllData,
  hasStoredData,
} from '../utils/db';
import type { ColumnarData, SyncedResults, Metadata, AppState } from '../types';

interface SyncContextType extends AppState {
  // Data loading
  loadFromStorage: () => Promise<void>;
  saveData: (tracking: ColumnarData, events: ColumnarData, meta: Metadata) => Promise<void>;
  resetAll: () => Promise<void>;

  // Navigation
  setCurrentEventIndex: (index: number) => void;
  setFrameOffset: (offset: number) => void;
  nextEvent: () => void;
  prevEvent: () => void;
  nextUnsynced: () => void;
  jumpToEvent: (index: number) => void;

  // Frame navigation
  adjustFrameOffset: (delta: number) => void;

  // Sync actions
  syncCurrentEvent: (currentTime: number) => void;
  skipEvent: () => void;

  // Export
  downloadResults: () => void;

  // Import
  uploadResults: (results: SyncedResults) => Promise<void>;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function useSyncContext(): SyncContextType {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSyncContext must be used within a SyncProvider');
  }
  return context;
}

interface SyncProviderProps {
  children: ReactNode;
}

export function SyncProvider({ children }: SyncProviderProps) {
  const [eventsData, setEventsData] = useState<ColumnarData | null>(null);
  const [trackingData, setTrackingData] = useState<ColumnarData | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [syncedResults, setSyncedResults] = useState<SyncedResults>({});
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [frameOffset, setFrameOffset] = useState(0);
  const [lastSyncOffset, setLastSyncOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasData, setHasData] = useState(false);


  // Helper to get unique period times from tracking data
  const getPeriodTimes = useCallback((tracking: ColumnarData, periodId: number): number[] => {
    const periodCol = tracking.columns['period_id'] as number[];
    const timeCol = tracking.columns['matched_time'] as number[];
    const times = new Set<number>();
    for (let i = 0; i < tracking.numRows; i++) {
      if (periodCol[i] === periodId) {
        times.add(timeCol[i]);
      }
    }
    return [...times].sort((a, b) => a - b);
  }, []);

  // Find first unsynced event starting from given index
  const findFirstUnsynced = useCallback((startIndex: number, events: ColumnarData, results: SyncedResults): number => {
    const eventIdCol = events.columns['opta_event_id'];
    let index = startIndex;
    while (index < events.numRows) {
      const eventId = String(eventIdCol?.[index] ?? index);
      if (!(eventId in results)) {
        break;
      }
      index++;
    }
    return index;
  }, []);

  // Update frame offset for current event (restore saved offset if synced)
  const updateOffsetForEvent = useCallback((eventIndex: number, events: ColumnarData, tracking: ColumnarData, results: SyncedResults, fallbackOffset: number): number => {
    if (eventIndex >= events.numRows) return fallbackOffset;

    const eventIdCol = events.columns['opta_event_id'];
    const periodIdCol = events.columns['period_id'] as number[];
    const matchedTimeCol = events.columns['matched_time'] as number[];

    const eventId = String(eventIdCol?.[eventIndex] ?? eventIndex);
    const eventPeriod = periodIdCol[eventIndex];
    const eventTime = matchedTimeCol[eventIndex];

    if (eventId in results) {
      const syncedTime = results[eventId];
      const periodTimes = getPeriodTimes(tracking, eventPeriod);

      if (periodTimes.length === 0) return fallbackOffset;

      const baseIdx = periodTimes.findIndex(t => t >= eventTime);
      const syncIdx = periodTimes.findIndex(t => t >= syncedTime);

      return syncIdx - (baseIdx >= 0 ? baseIdx : 0);
    }

    return fallbackOffset;
  }, [getPeriodTimes]);

  // Load data from IndexedDB on mount
  const loadFromStorage = useCallback(async () => {
    setIsLoading(true);
    try {
      const hasData = await hasStoredData();
      if (hasData) {
        const [tracking, events, meta, results] = await Promise.all([
          loadTrackingData(),
          loadEventsData(),
          loadMetadata(),
          loadSyncedResults(),
        ]);

        if (tracking && events) {
          setTrackingData(tracking);
          setEventsData(events);
          setMetadata(meta);
          setSyncedResults(results);

          // Skip to first unsynced event
          const firstUnsynced = findFirstUnsynced(0, events, results);
          setCurrentEventIndex(firstUnsynced);

          // Update frame offset
          const offset = updateOffsetForEvent(firstUnsynced, events, tracking, results, 0);
          setFrameOffset(offset);

          setHasData(true);
        } else {
          setHasData(false);
        }
      } else {
        setHasData(false);
      }
    } catch (error) {
      console.error('Failed to load data from storage:', error);
      setHasData(false);
    }
    setIsLoading(false);
  }, [findFirstUnsynced, updateOffsetForEvent]);

  // Save new data to IndexedDB
  const saveData = useCallback(async (tracking: ColumnarData, events: ColumnarData, meta: Metadata) => {
    setIsLoading(true);
    try {
      await Promise.all([
        saveTrackingData(tracking),
        saveEventsData(events),
        saveMetadata(meta),
      ]);

      setTrackingData(tracking);
      setEventsData(events);
      setMetadata(meta);
      setSyncedResults({});
      setCurrentEventIndex(0);
      setFrameOffset(0);
      setLastSyncOffset(0);
      setHasData(true);
    } catch (error) {
      console.error('Failed to save data:', error);
    }
    setIsLoading(false);
  }, []);

  // Reset all data
  const resetAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await clearAllData();
      setTrackingData(null);
      setEventsData(null);
      setMetadata(null);
      setSyncedResults({});
      setCurrentEventIndex(0);
      setFrameOffset(0);
      setLastSyncOffset(0);
      setHasData(false);
    } catch (error) {
      console.error('Failed to reset data:', error);
    }
    setIsLoading(false);
  }, []);

  // Navigation functions
  const nextEvent = useCallback(() => {
    if (!eventsData || !trackingData) return;
    const newIndex = Math.min(eventsData.numRows - 1, currentEventIndex + 1);
    setCurrentEventIndex(newIndex);
    const offset = updateOffsetForEvent(newIndex, eventsData, trackingData, syncedResults, lastSyncOffset);
    setFrameOffset(offset);
  }, [currentEventIndex, eventsData, trackingData, syncedResults, lastSyncOffset, updateOffsetForEvent]);

  const prevEvent = useCallback(() => {
    if (!eventsData || !trackingData) return;
    const newIndex = Math.max(0, currentEventIndex - 1);
    setCurrentEventIndex(newIndex);
    const offset = updateOffsetForEvent(newIndex, eventsData, trackingData, syncedResults, lastSyncOffset);
    setFrameOffset(offset);
  }, [currentEventIndex, eventsData, trackingData, syncedResults, lastSyncOffset, updateOffsetForEvent]);

  const nextUnsynced = useCallback(() => {
    if (!eventsData || !trackingData) return;
    const newIndex = findFirstUnsynced(currentEventIndex + 1, eventsData, syncedResults);
    setCurrentEventIndex(newIndex);
    const offset = updateOffsetForEvent(newIndex, eventsData, trackingData, syncedResults, lastSyncOffset);
    setFrameOffset(offset);
  }, [currentEventIndex, eventsData, trackingData, syncedResults, lastSyncOffset, findFirstUnsynced, updateOffsetForEvent]);

  const jumpToEvent = useCallback((index: number) => {
    if (!eventsData || !trackingData) return;
    const newIndex = Math.max(0, Math.min(eventsData.numRows - 1, index));
    setCurrentEventIndex(newIndex);
    const offset = updateOffsetForEvent(newIndex, eventsData, trackingData, syncedResults, lastSyncOffset);
    setFrameOffset(offset);
  }, [eventsData, trackingData, syncedResults, lastSyncOffset, updateOffsetForEvent]);

  const adjustFrameOffset = useCallback((delta: number) => {
    setFrameOffset(prev => prev + delta);
  }, []);

  // Sync current event
  const syncCurrentEvent = useCallback(async (currentTime: number) => {
    if (!eventsData || !trackingData) return;
    if (currentEventIndex >= eventsData.numRows) return;

    const eventIdCol = eventsData.columns['opta_event_id'];
    const eventId = String(eventIdCol?.[currentEventIndex] ?? currentEventIndex);

    const newResults = { ...syncedResults, [eventId]: currentTime };
    setSyncedResults(newResults);
    await saveSyncedResults(newResults);

    // Save current offset for next event
    setLastSyncOffset(frameOffset);

    // Move to next unsynced event
    const newIndex = findFirstUnsynced(currentEventIndex + 1, eventsData, newResults);
    setCurrentEventIndex(newIndex);
    const offset = updateOffsetForEvent(newIndex, eventsData, trackingData, newResults, frameOffset);
    setFrameOffset(offset);
  }, [currentEventIndex, eventsData, syncedResults, frameOffset, trackingData, findFirstUnsynced, updateOffsetForEvent]);

  // Skip event
  const skipEvent = useCallback(() => {
    if (!eventsData || !trackingData) return;
    const newIndex = findFirstUnsynced(currentEventIndex + 1, eventsData, syncedResults);
    setCurrentEventIndex(newIndex);
    const offset = updateOffsetForEvent(newIndex, eventsData, trackingData, syncedResults, lastSyncOffset);
    setFrameOffset(offset);
  }, [currentEventIndex, eventsData, trackingData, syncedResults, lastSyncOffset, findFirstUnsynced, updateOffsetForEvent]);

  // Download results as JSON
  const downloadResults = useCallback(() => {
    const jsonStr = JSON.stringify(syncedResults, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync_results_${metadata?.gameUuid || 'unknown'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [syncedResults, metadata]);

  // Upload results from JSON
  const uploadResults = useCallback(async (results: SyncedResults) => {
    if (!eventsData || !trackingData) return;

    // Clear existing synced results and replace with uploaded ones
    setSyncedResults(results);
    await saveSyncedResults(results);

    // Jump to first unsynced event
    const firstUnsynced = findFirstUnsynced(0, eventsData, results);
    setCurrentEventIndex(firstUnsynced);

    const offset = updateOffsetForEvent(firstUnsynced, eventsData, trackingData, results, 0);
    setFrameOffset(offset);
    setLastSyncOffset(0);
  }, [eventsData, trackingData, findFirstUnsynced, updateOffsetForEvent]);

  // Load from storage on mount
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const value: SyncContextType = {
    eventsData,
    trackingData,
    metadata,
    syncedResults,
    currentEventIndex,
    frameOffset,
    lastSyncOffset,
    isLoading,
    hasData,
    loadFromStorage,
    saveData,
    resetAll,
    setCurrentEventIndex,
    setFrameOffset,
    nextEvent,
    prevEvent,
    nextUnsynced,
    jumpToEvent,
    adjustFrameOffset,
    syncCurrentEvent,
    skipEvent,
    downloadResults,
    uploadResults,
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

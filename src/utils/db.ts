import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { ColumnarData, SyncedResults, Metadata } from '../types';

interface SyncToolDB extends DBSchema {
  trackingData: {
    key: string;
    value: { key: string; data: unknown };
  };
  eventsData: {
    key: string;
    value: { key: string; data: unknown };
  };
  metadata: {
    key: string;
    value: Metadata;
  };
  syncedResults: {
    key: string;
    value: { id: string; data: SyncedResults };
  };
}

const DB_NAME = 'event-sync-tool-db';
const DB_VERSION = 2; // Increment version for schema change

let dbInstance: IDBPDatabase<SyncToolDB> | null = null;

async function getDB(): Promise<IDBPDatabase<SyncToolDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<SyncToolDB>(DB_NAME, DB_VERSION, {
    upgrade(db: IDBPDatabase<SyncToolDB>) {
      // Delete old stores if they exist
      if (db.objectStoreNames.contains('trackingData')) {
        db.deleteObjectStore('trackingData');
      }
      if (db.objectStoreNames.contains('eventsData')) {
        db.deleteObjectStore('eventsData');
      }

      // Tracking data store - stores columnar data
      db.createObjectStore('trackingData');

      // Events data store - stores columnar data
      db.createObjectStore('eventsData');

      // Metadata store
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata');
      }

      // Synced results store
      if (!db.objectStoreNames.contains('syncedResults')) {
        db.createObjectStore('syncedResults');
      }
    },
  });

  return dbInstance;
}

// Save tracking data (columnar format)
export async function saveTrackingData(data: ColumnarData): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('trackingData', 'readwrite');
  const store = tx.objectStore('trackingData');

  // Clear existing data first
  await store.clear();

  // Store metadata
  store.put({ key: '_meta', data: { numRows: data.numRows, fieldNames: data.fieldNames } }, '_meta');

  // Store all columns without awaiting individually - let transaction batch them
  for (const fieldName of data.fieldNames) {
    store.put({ key: fieldName, data: data.columns[fieldName] }, fieldName);
  }

  // Wait for entire transaction to complete
  await tx.done;
}

// Load tracking data (columnar format)
export async function loadTrackingData(): Promise<ColumnarData | null> {
  const db = await getDB();

  // Get metadata first
  const metaRecord = await db.get('trackingData', '_meta');
  if (!metaRecord) return null;

  const { numRows, fieldNames } = metaRecord.data as { numRows: number; fieldNames: string[] };

  // Load all columns in parallel
  const columnPromises = fieldNames.map(async (fieldName) => {
    const colRecord = await db.get('trackingData', fieldName);
    return { fieldName, data: colRecord?.data as unknown[] };
  });

  const columnResults = await Promise.all(columnPromises);

  const columns: Record<string, unknown[]> = {};
  for (const { fieldName, data } of columnResults) {
    if (data) {
      columns[fieldName] = data;
    }
  }

  return { columns, numRows, fieldNames };
}

// Save events data (columnar format)
export async function saveEventsData(data: ColumnarData): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('eventsData', 'readwrite');
  const store = tx.objectStore('eventsData');

  // Clear existing data first
  await store.clear();

  // Store metadata
  store.put({ key: '_meta', data: { numRows: data.numRows, fieldNames: data.fieldNames } }, '_meta');

  // Store all columns without awaiting individually - let transaction batch them
  for (const fieldName of data.fieldNames) {
    store.put({ key: fieldName, data: data.columns[fieldName] }, fieldName);
  }

  // Wait for entire transaction to complete
  await tx.done;
}

// Load events data (columnar format)
export async function loadEventsData(): Promise<ColumnarData | null> {
  const db = await getDB();

  // Get metadata first
  const metaRecord = await db.get('eventsData', '_meta');
  if (!metaRecord) return null;

  const { numRows, fieldNames } = metaRecord.data as { numRows: number; fieldNames: string[] };

  // Load all columns in parallel
  const columnPromises = fieldNames.map(async (fieldName) => {
    const colRecord = await db.get('eventsData', fieldName);
    return { fieldName, data: colRecord?.data as unknown[] };
  });

  const columnResults = await Promise.all(columnPromises);

  const columns: Record<string, unknown[]> = {};
  for (const { fieldName, data } of columnResults) {
    if (data) {
      columns[fieldName] = data;
    }
  }

  return { columns, numRows, fieldNames };
}

// Save metadata
export async function saveMetadata(metadata: Metadata): Promise<void> {
  const db = await getDB();
  await db.put('metadata', metadata, 'main');
}

// Load metadata
export async function loadMetadata(): Promise<Metadata | null> {
  const db = await getDB();
  const result = await db.get('metadata', 'main');
  return result || null;
}

// Save synced results
export async function saveSyncedResults(results: SyncedResults): Promise<void> {
  const db = await getDB();
  await db.put('syncedResults', { id: 'main', data: results }, 'main');
}

// Load synced results
export async function loadSyncedResults(): Promise<SyncedResults> {
  const db = await getDB();
  const result = await db.get('syncedResults', 'main');
  return result?.data || {};
}

// Clear all data
export async function clearAllData(): Promise<void> {
  const db = await getDB();

  const tx1 = db.transaction('trackingData', 'readwrite');
  await tx1.objectStore('trackingData').clear();
  await tx1.done;

  const tx2 = db.transaction('eventsData', 'readwrite');
  await tx2.objectStore('eventsData').clear();
  await tx2.done;

  const tx3 = db.transaction('metadata', 'readwrite');
  await tx3.objectStore('metadata').clear();
  await tx3.done;

  const tx4 = db.transaction('syncedResults', 'readwrite');
  await tx4.objectStore('syncedResults').clear();
  await tx4.done;
}

// Check if data exists
export async function hasStoredData(): Promise<boolean> {
  const db = await getDB();
  const eventsMeta = await db.get('eventsData', '_meta');
  const trackingMeta = await db.get('trackingData', '_meta');
  return !!eventsMeta && !!trackingMeta;
}

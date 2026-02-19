// Web Worker for parsing parquet files
import init, { readParquet } from 'parquet-wasm';
import { tableFromIPC } from 'apache-arrow';

let initialized = false;

// Recursively convert BigInt values to Numbers
function convertBigInts(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map(convertBigInts);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertBigInts(value);
    }
    return result;
  }
  return obj;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, data, id } = e.data;

  if (type === 'parse') {
    try {
      // Send initial progress
      self.postMessage({ type: 'progress', id, progress: 0 });

      // Initialize WASM if not already done
      if (!initialized) {
        await init();
        initialized = true;
      }

      self.postMessage({ type: 'progress', id, progress: 10 });

      const uint8Array = new Uint8Array(data);
      const wasmTable = readParquet(uint8Array);

      self.postMessage({ type: 'progress', id, progress: 40 });

      // Convert to Arrow IPC format and parse with apache-arrow
      const ipcStream = wasmTable.intoIPCStream();
      const arrowTable = tableFromIPC(ipcStream);

      self.postMessage({ type: 'progress', id, progress: 70 });

      // Column-based extraction - convert to plain arrays
      const numRows = arrowTable.numRows;
      const fields = arrowTable.schema.fields;
      const columns: Record<string, unknown[]> = {};

      let processedCols = 0;
      const totalCols = fields.length;

      for (const field of fields) {
        const column = arrowTable.getChild(field.name);
        if (column) {
          const plainArray = new Array(numRows);

          for (let i = 0; i < numRows; i++) {
            // Check validity bitmap first - Arrow uses a separate validity bitmap for nulls
            const isValid = column.isValid(i);

            if (!isValid) {
              plainArray[i] = null;
              continue;
            }

            const val = column.get(i);
            if (val === null || val === undefined) {
              plainArray[i] = null;
            } else if (typeof val === 'bigint') {
              const numVal = Number(val);
              // Convert NaN/Infinity to null
              plainArray[i] = Number.isFinite(numVal) ? numVal : null;
            } else if (typeof val === 'number') {
              // Convert NaN/Infinity to null for cleaner handling
              plainArray[i] = Number.isFinite(val) ? val : null;
            } else if (typeof val === 'string' || typeof val === 'boolean') {
              plainArray[i] = val;
            } else if (typeof val === 'object') {
              // For objects, recursively convert BigInts then stringify
              const converted = convertBigInts(val);
              plainArray[i] = JSON.parse(JSON.stringify(converted));
            } else {
              plainArray[i] = val;
            }
          }

          columns[field.name] = plainArray;
        }
        processedCols++;
        const progress = 70 + Math.round((processedCols / totalCols) * 20);
        self.postMessage({ type: 'progress', id, progress });
      }

      self.postMessage({ type: 'progress', id, progress: 90 });

      // Send column data in chunks to avoid memory issues
      // First send metadata
      self.postMessage({
        type: 'metadata',
        id,
        data: {
          numRows,
          fieldNames: fields.map(f => f.name)
        }
      });

      // Then send each column separately
      for (const fieldName of Object.keys(columns)) {
        self.postMessage({
          type: 'column',
          id,
          fieldName,
          data: columns[fieldName]
        });
      }

      // Signal completion
      self.postMessage({
        type: 'success',
        id
      });
    } catch (error) {
      self.postMessage({
        type: 'error',
        id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
};

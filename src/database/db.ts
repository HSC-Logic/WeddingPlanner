import type { AppData, StoreName } from "../types/models";
import { emptyData } from "../utils/domain";
import { validateAppData } from "../utils/validation";

export const DB_NAME = "vow-planner";
export const DB_VERSION = 3;
export const STORES: StoreName[] = [
  "wedding",
  "tasks",
  "expenses",
  "guests",
  "vendors",
  "timeline",
  "notes",
  "tables",
  "households",
  "assignments",
  "halls",
];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () =>
      STORES.forEach((name) => {
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name, { keyPath: "id" });
      });
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onblocked = () =>
      reject(
        new Error("Close other Vow tabs so local storage can be upgraded."),
      );
    request.onerror = () =>
      reject(
        new Error(
          "Local storage could not be opened. Check browser privacy settings.",
        ),
      );
  });
}

async function transaction<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let request: IDBRequest<T>;
    try {
      request = run(tx.objectStore(store));
    } catch (error) {
      tx.abort();
      db.close();
      reject(error);
      return;
    }
    request.onsuccess = () => {};
    request.onerror = () =>
      reject(request.error ?? new Error("Local save failed."));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("Local save failed."));
    };
  });
}

export const repository = {
  all: <T>(store: StoreName) =>
    transaction<T[]>(store, "readonly", (objectStore) => objectStore.getAll()),
  put: <T>(store: StoreName, value: T) =>
    transaction<IDBValidKey>(store, "readwrite", (objectStore) =>
      objectStore.put(value),
    ),
  delete: (store: StoreName, id: string) =>
    transaction<undefined>(store, "readwrite", (objectStore) =>
      objectStore.delete(id),
    ),
};

export async function loadAll(): Promise<AppData> {
  const [
    wedding,
    tasks,
    expenses,
    guests,
    vendors,
    timeline,
    notes,
    tables,
    households,
    assignments,
    halls,
  ] = await Promise.all(STORES.map((store) => repository.all<never>(store)));
  return validateAppData({
    wedding: wedding[0],
    tasks,
    expenses,
    guests,
    vendors,
    timeline,
    notes,
    tables,
    households,
    assignments,
    halls,
  });
}

export async function replaceAll(data: AppData) {
  const validated = validateAppData(data);
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES, "readwrite");
    for (const storeName of STORES) {
      const store = tx.objectStore(storeName);
      store.clear();
      const values =
        storeName === "wedding"
          ? data.wedding
            ? [data.wedding]
            : []
          : validated[storeName];
      values.forEach((value) => store.put(value));
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("Restore failed. No data was changed."));
    tx.onabort = () =>
      reject(tx.error ?? new Error("Restore failed. No data was changed."));
  });
  db.close();
}

export async function clearAll() {
  await replaceAll(emptyData());
}

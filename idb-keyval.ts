export class Store {
  private _dbp: Promise<IDBDatabase> | undefined;
  readonly _dbName: string;
  readonly _storeName: string;

  constructor(dbName = 'keyval-store', readonly storeName = 'keyval') {
    this._dbName = dbName;
    this._storeName = storeName;
    this._init();
  }

  _init(): void {
    if (this._dbp) {
      return;
    }
    this._dbp = new Promise((resolve, reject) => {
      const openreq = indexedDB.open(this._dbName, 1);
      openreq.onerror = () => reject(openreq.error);
      openreq.onsuccess = () => resolve(openreq.result);

      // First time setup: create an empty object store
      openreq.onupgradeneeded = () => {
        openreq.result.createObjectStore(this._storeName);
      };
    });
  }

  _withIDBStore(type: IDBTransactionMode, callback: ((store: IDBObjectStore) => void)): Promise<void> {
    this._init();
    return (this._dbp as Promise<IDBDatabase>).then(db => new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, type);
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
      callback(transaction.objectStore(this.storeName));
    }));
  }

  _close(): Promise<void> {
    this._init();
    return (this._dbp as Promise<IDBDatabase>).then(db => {
      db.close();
      this._dbp = undefined;
    })
  }
}

let store: Store;

function getDefaultStore() {
  if (!store) store = new Store();
  return store;
}

export function get<Type>(key: IDBValidKey, store = getDefaultStore()): Promise<Type> {
  let req: IDBRequest;
  return store._withIDBStore('readonly', store => {
    req = store.get(key);
  }).then(() => req.result);
}

export function set(key: IDBValidKey, value: any, store = getDefaultStore()): Promise<void> {
  return store._withIDBStore('readwrite', store => {
    store.put(value, key);
  });
}

export function update(key: IDBValidKey, updater: (val: any) => any, store = getDefaultStore()): Promise<void> {
  return store._withIDBStore('readwrite', store => {
    const req = store.get(key);
    req.onsuccess = () => {
      store.put(updater(req.result), key);
    };
  });
}

export function del(key: IDBValidKey, store = getDefaultStore()): Promise<void> {
  return store._withIDBStore('readwrite', store => {
    store.delete(key);
  });
}

export function clear(store = getDefaultStore()): Promise<void> {
  return store._withIDBStore('readwrite', store => {
    store.clear();
  });
}

export function keys(store = getDefaultStore()): Promise<IDBValidKey[]> {
  const keys: IDBValidKey[] = [];

  return store._withIDBStore('readonly', store => {
    // This would be store.getAllKeys(), but it isn't supported by Edge or Safari.
    // And openKeyCursor isn't supported by Safari.
    (store.openKeyCursor || store.openCursor).call(store).onsuccess = function() {
      if (!this.result) return;
      keys.push(this.result.key);
      this.result.continue()
    };
  }).then(() => keys);
}

export function close(store = getDefaultStore()): Promise<void> {
  return store._close()
}

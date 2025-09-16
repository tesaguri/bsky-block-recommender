export interface CacheEntry {
	expires: number;
};

export class Cache<V extends CacheEntry> {
	map: Map<string, WeakRef<V>>;

	constructor() {
		this.map = new Map();
	}

	get(key: string): V | void {
		const ref = this.map.get(key);
		if (ref) {
			const entry = ref.deref();
			if (entry && Date.now() < entry.expires) {
				return entry;
			} else {
				this.map.delete(key);
			}
		}
	}

	set(key: string, value: V): void {
		this.map.set(key, new WeakRef(value));
	}

	delete(key: string): void {
		this.map.delete(key);
	}
}


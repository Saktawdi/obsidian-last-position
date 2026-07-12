function normalizePath(filePath: string): string {
	return filePath.replace(/\\/g, '/');
}

export class AnchorSuppression {
	private readonly expirations = new Map<string, number>();

	constructor(private readonly ttlMs: number) {}

	mark(filePath: string, now = Date.now()): void {
		if (!filePath) return;
		this.expirations.set(normalizePath(filePath), now + this.ttlMs);
	}

	consume(filePath: string, now = Date.now()): boolean {
		const key = normalizePath(filePath);
		const expiration = this.expirations.get(key);
		if (expiration === undefined) return false;

		this.expirations.delete(key);
		return expiration >= now;
	}

	clearExpired(now = Date.now()): void {
		for (const [filePath, expiration] of this.expirations) {
			if (expiration < now) this.expirations.delete(filePath);
		}
	}
}

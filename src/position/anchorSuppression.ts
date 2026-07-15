function normalizePath(filePath: string): string {
	return filePath.replace(/\\/g, '/');
}

export interface AnchorNavigationRequest {
	linkText: string;
	sourcePath: string;
	targetFilePath: string;
}

interface PendingAnchorNavigation {
	request: AnchorNavigationRequest;
	expiration: number;
}

export class AnchorSuppression {
	private readonly pending = new Map<string, PendingAnchorNavigation>();

	constructor(private readonly ttlMs: number) {}

	mark(request: AnchorNavigationRequest, now = Date.now()): void {
		if (!request.targetFilePath) return;
		this.pending.clear();
		this.pending.set(normalizePath(request.targetFilePath), {
			request: { ...request },
			expiration: now + this.ttlMs,
		});
	}

	consume(filePath: string, now = Date.now()): AnchorNavigationRequest | undefined {
		const key = normalizePath(filePath);
		const pending = this.pending.get(key);
		if (!pending) return undefined;

		this.pending.delete(key);
		return pending.expiration >= now ? { ...pending.request } : undefined;
	}

	clearExpired(now = Date.now()): void {
		for (const [filePath, pending] of this.pending) {
			if (pending.expiration < now) this.pending.delete(filePath);
		}
	}
}

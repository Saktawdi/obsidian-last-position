export interface RestorationTarget {
	isCurrent(): boolean;
	readScroll(): number | undefined;
	applyScroll(height: number): void;
}

export type RestorationReason = 'completed' | 'cancelled' | 'stale' | 'interrupted' | 'expired';

export interface RestorationResult {
	reason: RestorationReason;
	attempts: number;
	actualHeight?: number;
}

export interface RestorationOptions {
	maxAttempts: number;
	intervalMs: number;
	tolerance?: number;
}

function delay(milliseconds: number): Promise<void> {
	if (milliseconds <= 0) return Promise.resolve();
	return new Promise(resolve => globalThis.setTimeout(resolve, milliseconds));
}

export class RestorationScheduler {
	private readonly generations = new Map<string, number>();
	private readonly applying = new Set<string>();

	async start(
		key: string,
		height: number,
		target: RestorationTarget,
		options: RestorationOptions,
	): Promise<RestorationResult> {
		const generation = (this.generations.get(key) ?? 0) + 1;
		this.generations.set(key, generation);

		const maxAttempts = Number.isFinite(options.maxAttempts)
			? Math.max(1, Math.floor(options.maxAttempts))
			: 1;
		const intervalMs = Number.isFinite(options.intervalMs)
			? Math.max(0, options.intervalMs)
			: 0;
		const tolerance = options.tolerance ?? 1;
		let attempts = 0;
		let actualHeight = target.readScroll();
		let lastAppliedHeight: number | undefined;
		let confirming = false;

		try {
			while (attempts <= maxAttempts) {
				if (!this.isGenerationCurrent(key, generation)) {
					return { reason: 'cancelled', attempts, actualHeight };
				}
				if (!target.isCurrent()) {
					return { reason: 'stale', attempts, actualHeight };
				}

				actualHeight = target.readScroll();
				if (attempts > 0
					&& lastAppliedHeight !== undefined
					&& actualHeight !== undefined
					&& Math.abs(actualHeight - lastAppliedHeight) > tolerance
					&& Math.abs(actualHeight - height) > tolerance) {
					return { reason: 'interrupted', attempts, actualHeight };
				}
				if (this.isWithinTolerance(actualHeight, height, tolerance)) {
					if (confirming) {
						return { reason: 'completed', attempts, actualHeight };
					}
					confirming = true;
					await delay(intervalMs);
					continue;
				}
				confirming = false;
				if (attempts >= maxAttempts) break;

				this.applying.add(key);
				try {
					target.applyScroll(height);
				} finally {
					this.applying.delete(key);
				}
				attempts++;
				actualHeight = target.readScroll();
				lastAppliedHeight = actualHeight;

				if (this.isWithinTolerance(actualHeight, height, tolerance)) {
					confirming = true;
				}
				if (attempts >= maxAttempts && !confirming) break;

				await delay(intervalMs);
			}

			return { reason: 'expired', attempts, actualHeight };
		} finally {
			this.applying.delete(key);
			if (this.isGenerationCurrent(key, generation)) {
				this.generations.delete(key);
			}
		}
	}

	cancel(key: string): void {
		this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
		this.applying.delete(key);
	}

	cancelAll(): void {
		for (const key of this.generations.keys()) {
			this.cancel(key);
		}
	}

	isApplying(key: string): boolean {
		return this.applying.has(key);
	}

	private isGenerationCurrent(key: string, generation: number): boolean {
		return this.generations.get(key) === generation;
	}

	private isWithinTolerance(actual: number | undefined, target: number, tolerance: number): boolean {
		return actual !== undefined && Number.isFinite(actual) && Math.abs(actual - target) <= tolerance;
	}
}

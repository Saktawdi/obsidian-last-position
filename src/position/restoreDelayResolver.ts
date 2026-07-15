import type { RestoreDelayContext } from './positionCoordinator';
import { calculateSmartRestoreDelay } from './smartRestoreDelay';

export interface RestoreDelayResolverOptions {
	isSmartEnabled: () => boolean;
	fixedDelayMs: () => number;
	readCharacterCount: (filePath: string) => Promise<number>;
}

export function createRestoreDelayResolver(
	options: RestoreDelayResolverOptions,
): (context: RestoreDelayContext) => number | Promise<number> {
	return context => {
		if (!options.isSmartEnabled()) {
			const fixedDelay = options.fixedDelayMs();
			return Number.isFinite(fixedDelay) ? Math.max(0, fixedDelay) : 0;
		}

		const readCount = async (filePath: string | undefined): Promise<number> => {
			if (!filePath) return 0;
			try {
				const count = await options.readCharacterCount(filePath);
				return Number.isFinite(count) ? Math.max(0, count) : 0;
			} catch {
				return 0;
			}
		};

		return Promise.all([
			readCount(context.source?.filePath),
			readCount(context.target.filePath),
		]).then(([sourceCharacters, targetCharacters]) =>
			calculateSmartRestoreDelay(targetCharacters, sourceCharacters));
	};
}

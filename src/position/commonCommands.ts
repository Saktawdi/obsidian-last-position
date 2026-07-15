import type { PositionStore } from '../storage/positionStore';
import type { ActivePosition } from './positionCoordinator';

export const COMMON_COMMAND_IDS = {
	toLastPosition: 'last-position-to-last-position',
} as const;

export interface CommonCommandLabels {
	toLastPositionCommand: string;
}

export function getCommonCommandNames(labels: CommonCommandLabels): {
	toLastPosition: string;
} {
	return {
		toLastPosition: `Last Position: ${labels.toLastPositionCommand}`,
	};
}

export interface LastPositionJumpCoordinator {
	getActivePosition(): ActivePosition | undefined;
	scrollActiveTo(filePath: string, height: number): boolean;
}

export type ToLastPositionResult =
	| 'completed'
	| 'no-active-view'
	| 'no-history'
	| 'stale';

export function executeToLastPosition(
	store: PositionStore,
	coordinator: LastPositionJumpCoordinator | undefined,
): ToLastPositionResult {
	const position = coordinator?.getActivePosition();
	if (!coordinator || !position) return 'no-active-view';

	const saved = store.resolve(position.leafId, position.filePath);
	if (!saved) return 'no-history';

	return coordinator.scrollActiveTo(position.filePath, saved.height)
		? 'completed'
		: 'stale';
}

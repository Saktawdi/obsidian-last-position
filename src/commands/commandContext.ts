import { App } from 'obsidian';
import { PositionCoordinator } from '../position/positionCoordinator';
import { PositionStore } from '../storage/positionStore';

export interface CommandContext {
	app: App;
	store: PositionStore;
	getCoordinator: () => PositionCoordinator<unknown, unknown> | undefined;
	persist: () => Promise<void>;
	flashStatusBar: () => void;
}

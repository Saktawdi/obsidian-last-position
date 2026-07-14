import { SerializedTaskQueue } from '../position/serializedTaskQueue';
import type { PositionState } from '../domain/positionTypes';
import { PositionStore } from './positionStore';

export interface PositionPersistenceHost {
	getSettingsSnapshot(): Record<string, unknown>;
	setPositionState(state: PositionState): void;
	saveData(data: Record<string, unknown>): Promise<void>;
}

export class PositionPersistenceService {
	private readonly queue: SerializedTaskQueue;

	constructor(
		private readonly store: PositionStore,
		private readonly host: PositionPersistenceHost,
		queue = new SerializedTaskQueue(),
	) {
		this.queue = queue;
	}

	persist(): Promise<void> {
		return this.queue.enqueue(async () => {
			const positionState = this.store.snapshot();
			this.host.setPositionState(positionState);
			await this.host.saveData({
				...this.host.getSettingsSnapshot(),
				positionState,
				scrollHeightData: positionState.files,
			});
		});
	}

	importState(imported: PositionState): Promise<void> {
		this.store.merge(imported);
		return this.persist();
	}

	flush(): Promise<void> {
		return this.queue.flush();
	}
}

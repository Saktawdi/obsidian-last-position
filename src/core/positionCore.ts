export interface PositionCoreCoordinator<TLeaf> {
	start(activeLeaf: TLeaf | null): void;
	dispose(): Promise<void>;
}

export class PositionCore<
	TLeaf,
	TCoordinator extends PositionCoreCoordinator<TLeaf> = PositionCoreCoordinator<TLeaf>,
> {
	constructor(private readonly coordinator: TCoordinator) {}

	getCoordinator(): TCoordinator {
		return this.coordinator;
	}

	start(activeLeaf: TLeaf | null): void {
		this.coordinator.start(activeLeaf);
	}

	dispose(): Promise<void> {
		return this.coordinator.dispose();
	}
}

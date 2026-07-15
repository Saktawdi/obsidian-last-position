export class SerializedTaskQueue {
	private tail: Promise<void> = Promise.resolve();

	enqueue(task: () => Promise<void>): Promise<void> {
		const result = this.tail.catch(() => undefined).then(task);
		this.tail = result.catch(() => undefined);
		return result;
	}

	flush(): Promise<void> {
		return this.tail;
	}
}

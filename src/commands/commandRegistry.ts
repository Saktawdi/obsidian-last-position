export interface CommandDefinition {
	id: string;
	name: string;
	callback?: () => unknown;
}

export interface CommandRegistrar {
	addCommand(command: CommandDefinition): unknown;
}

export interface CommandModule {
	register(registrar: CommandRegistrar): void;
}

export class CommandRegistry {
	constructor(private readonly modules: CommandModule[]) {}

	register(registrar: CommandRegistrar): void {
		for (const module of this.modules) module.register(registrar);
	}
}

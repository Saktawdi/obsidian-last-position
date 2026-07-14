import assert from 'node:assert/strict';
import test from 'node:test';
import {
	CommandRegistry,
	type CommandDefinition,
	type CommandModule,
	type CommandRegistrar,
} from '../../src/commands/commandRegistry';

class FakeRegistrar implements CommandRegistrar {
	commands: CommandDefinition[] = [];

	addCommand(command: CommandDefinition): void {
		this.commands.push(command);
	}
}

test('registers every command module through one registry', () => {
	const registrar = new FakeRegistrar();
	const calls: string[] = [];
	const modules: CommandModule[] = [
		{ register: host => host.addCommand({ id: 'first', name: 'First' }) },
		{ register: host => host.addCommand({ id: 'second', name: 'Second' }) },
	];

	const registry = new CommandRegistry(modules);
	registry.register(registrar);
	for (const command of registrar.commands) calls.push(command.id);

	assert.deepEqual(calls, ['first', 'second']);
});

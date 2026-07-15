import { Notice } from 'obsidian';
import { getTranslation } from '.language/translations';
import {
	COMMON_COMMAND_IDS,
	executeToLastPosition,
	getCommonCommandNames,
} from '../position/commonCommands';
import type { CommandContext } from './commandContext';
import type { CommandModule, CommandRegistrar } from './commandRegistry';

export class CommonCommandController implements CommandModule {
	constructor(private readonly context: CommandContext) {}

	register(registrar: CommandRegistrar): void {
		const names = getCommonCommandNames(getTranslation());
		registrar.addCommand({
			id: COMMON_COMMAND_IDS.toLastPosition,
			name: names.toLastPosition,
			callback: () => this.toLastPosition(),
		});
	}

	toLastPosition(): void {
		const t = getTranslation();
		const result = executeToLastPosition(
			this.context.store,
			this.context.getCoordinator(),
		);
		if (result === 'no-active-view') {
			new Notice(t.noActiveView);
		} else if (result === 'no-history') {
			new Notice(t.noLastPosition);
		} else if (result === 'stale') {
			new Notice(t.lastPositionStale);
		}
	}
}

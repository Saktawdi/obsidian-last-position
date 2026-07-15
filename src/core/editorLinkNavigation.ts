import type { EditorView } from '@codemirror/view';
import { editorInfoField, editorLivePreviewField, Keymap } from 'obsidian';

const EDITOR_LINK_SELECTOR = [
	'.cm-hmd-internal-link',
	'.cm-underline',
	'.cm-link',
	'.cm-url',
].join(', ');

export interface EditorLinkNavigation {
	linkText: string;
	sourcePath: string;
}

export function resolveEditorLinkNavigation(
	event: MouseEvent,
	view: EditorView,
): EditorLinkNavigation | undefined {
	if (event.button !== 0
		|| !(event.target instanceof Element)
		|| !event.target.closest(EDITOR_LINK_SELECTOR)) return undefined;

	const livePreview = view.state.field(editorLivePreviewField, false) ?? false;
	if (!livePreview && !Keymap.isModEvent(event)) return undefined;

	const offset = view.posAtCoords({ x: event.clientX, y: event.clientY });
	if (offset === null) return undefined;

	const editorInfo = view.state.field(editorInfoField, false);
	const sourceFile = editorInfo?.file;
	if (!editorInfo || !sourceFile) return undefined;

	const link = editorInfo.app.metadataCache.getFileCache(sourceFile)?.links?.find(candidate =>
		offset >= candidate.position.start.offset
		&& offset <= candidate.position.end.offset,
	);
	if (!link?.link) return undefined;

	return {
		linkText: link.link,
		sourcePath: sourceFile.path,
	};
}

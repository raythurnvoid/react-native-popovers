type Layer = {
	/**
	 * Handle an Escape press. Return true when this layer used it.
	 */
	escape: () => boolean;
};

const stacks = new WeakMap<Window, Layer[]>();

/**
 * Register an open layer. The last open layer is the top one, and only it gets Escape.
 *
 * The listener runs in the window capture phase, before any document listener. When the
 * top layer uses the press, it calls preventDefault. Ariakit dialogs, native dialogs, and
 * other handlers that check defaultPrevented then leave the press alone, so one Escape
 * closes one layer. We do not stop propagation: the focused element still gets the key.
 *
 * Return a function that removes the layer.
 */
export function layer_stack_add(win: Window, layer: Layer) {
	let stack = stacks.get(win);
	if (!stack) {
		const layers: Layer[] = [];
		stack = layers;
		stacks.set(win, layers);
		win.addEventListener(
			"keydown",
			(event) => {
				if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
				const top = layers.at(-1);
				if (top?.escape()) event.preventDefault();
			},
			true,
		);
	}

	const layers = stack;
	layers.push(layer);

	return () => {
		const index = layers.indexOf(layer);
		if (index !== -1) layers.splice(index, 1);
	};
}

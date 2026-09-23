type OwnerListener = (ownerId: string) => void;

const owner_listeners = new Set<OwnerListener>();
const open_ids = new Set<string>();
let warm_until = 0;

export function tooltip_session_subscribe(listener: OwnerListener) {
	owner_listeners.add(listener);
	return () => {
		owner_listeners.delete(listener);
	};
}

export function tooltip_session_claim(ownerId: string) {
	for (const listener of owner_listeners) listener(ownerId);
}

export function tooltip_session_set_open(ownerId: string, open: boolean, warmWindowMs: number) {
	if (open) {
		open_ids.add(ownerId);
		return;
	}

	const wasOpen = open_ids.delete(ownerId);
	if (wasOpen) warm_until = Date.now() + warmWindowMs;
}

/**
 * A tooltip that is already open, or one that just closed, makes the next
 * tooltip skip its show delay. That is how moving from one trigger to the
 * next feels immediate.
 */
export function tooltip_session_is_warm() {
	return open_ids.size > 0 || Date.now() < warm_until;
}

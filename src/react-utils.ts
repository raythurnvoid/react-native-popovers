import { useInsertionEffect, useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";

/**
 * Join class names and skip empty values.
 */
export function cx(...values: Array<string | false | null | undefined>) {
	return values.filter(Boolean).join(" ") || undefined;
}

/**
 * Return a function with a stable identity that always calls the latest `fn`.
 * Use it for callback refs: a new ref function makes React detach and attach the node again.
 */
export function useFn<T extends (...args: never[]) => unknown>(fn: T) {
	const latest = useRef(fn);
	// Insertion effects run before refs attach, so a ref callback in the same commit sees this render's values.
	useInsertionEffect(() => {
		latest.current = fn;
	});
	const [stable] = useState(() => ((...args: Parameters<T>) => latest.current(...args)) as T);
	return stable;
}

/**
 * Give `node` to a caller's ref and return the detach function.
 * A React 19 callback ref can return its own cleanup. Call that instead of passing `null`, like React does.
 */
function ref_attach<T>(ref: Ref<T> | undefined, node: T) {
	if (typeof ref === "function") {
		const cleanup = ref(node);
		return () => {
			if (typeof cleanup === "function") cleanup();
			else ref(null);
		};
	}
	if (ref) {
		ref.current = node;
		return () => {
			ref.current = null;
		};
	}
	return () => {};
}

/**
 * Point the caller refs at the node in `element`.
 *
 * The components keep one stable ref callback, so hover state and anchor-name are not reset on every
 * render. React then never sees a new caller ref, for example an inline `ref={(node) => ...}`.
 * This hook moves the node to the new refs after each render instead.
 */
export function useForwardRefs<T>(element: RefObject<T | null>, refs: Array<Ref<T> | undefined>) {
	const attached = useRef<{ node: T; refs: Array<Ref<T> | undefined>; detach: () => void } | null>(null);

	useLayoutEffect(() => {
		const node = element.current;
		const current = attached.current;
		if (current && current.node === node && current.refs.every((ref, index) => ref === refs[index])) return;

		current?.detach();
		attached.current = null;
		if (!node) return;

		const detaches = refs.map((ref) => ref_attach(ref, node));
		attached.current = {
			node,
			refs,
			detach: () => {
				for (const detach of detaches) detach();
			},
		};
	});

	useLayoutEffect(
		() => () => {
			attached.current?.detach();
			attached.current = null;
		},
		[],
	);
}

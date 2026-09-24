import {
	createElement,
	isValidElement,
	useInsertionEffect,
	useLayoutEffect,
	useRef,
	useState,
	type HTMLAttributes,
	type ReactElement,
	type ReactNode,
	type Ref,
	type RefCallback,
	type RefObject,
	type SyntheticEvent,
} from "react";
import { focus_is_natively_tabbable, focus_needs_safari_tab_index } from "./layer/focus.ts";

/**
 * Join class names and skip empty values.
 */
export function cx(...values: Array<string | false | null | undefined>) {
	return values.filter(Boolean).join(" ") || undefined;
}

type RenderProps = HTMLAttributes<HTMLElement> & { ref: RefCallback<HTMLElement> };

/**
 * The element a component renders. An element gets the component props merged in. A function gets
 * them as its argument and must spread them.
 */
export type RenderProp = ReactElement | ((props: RenderProps) => ReactNode);

type EventHandler = (event: SyntheticEvent<HTMLElement>) => void;

/**
 * Merge a component's props with the props of its `render` element, like Ariakit: the element's
 * values win, class names and styles join, and every handler runs. For each name in
 * `internalNames`, `internal` runs last, after the caller handlers. It decides by itself whether
 * an earlier `preventDefault()` stops it.
 */
export function merge_render_props(
	props: Record<string, unknown>,
	render: RenderProp | undefined,
	internalNames: ReadonlySet<string>,
	internal: (name: string, event: SyntheticEvent<HTMLElement>) => void,
) {
	const elementProps: Record<string, unknown> = isValidElement<Record<string, unknown>>(render) ? render.props : {};
	const merged: Record<string, unknown> = { ...props };
	for (const [key, value] of Object.entries(elementProps)) {
		if (value === undefined || key === "ref") continue;
		merged[key] = value;
	}
	merged.className = cx(props.className as string | undefined, elementProps.className as string | undefined);
	merged.style =
		props.style || elementProps.style ? { ...(props.style as object), ...(elementProps.style as object) } : undefined;
	for (const key of new Set([...Object.keys(props), ...Object.keys(elementProps), ...internalNames])) {
		if (!/^on[A-Z]/.test(key)) continue;
		const elementHandler = elementProps[key] as EventHandler | undefined;
		const propHandler = props[key] as EventHandler | undefined;
		const isInternal = internalNames.has(key);
		merged[key] = (event: SyntheticEvent<HTMLElement>) => {
			if (typeof elementHandler === "function") elementHandler(event);
			if (typeof propHandler === "function") propHandler(event);
			if (isInternal) internal(key, event);
		};
	}
	return merged;
}

/**
 * Render `render` with the merged props and `ref`, or `defaultTag` when there is no `render`.
 */
export function render_element(
	render: RenderProp | undefined,
	merged: Record<string, unknown>,
	ref: RefCallback<HTMLElement>,
	defaultTag: string,
) {
	if (typeof render === "function") return render({ ...(merged as HTMLAttributes<HTMLElement>), ref });
	if (isValidElement(render)) return createElement(render.type, { ...merged, ref, key: render.key });
	return createElement(defaultTag, { ...merged, ref });
}

/**
 * Match Ariakit's Focusable: an element that cannot take focus gets tabIndex 0, and so does a button
 * in Safari. The check needs the DOM node, so it runs after each render. With `enabled` false, a
 * tabindex that this hook added is removed again. A tabIndex prop always wins.
 */
export function useFocusableTabIndex(
	element: RefObject<HTMLElement | null>,
	enabled: boolean,
	hasTabIndexProp: boolean,
) {
	// The node that got the tabindex from this hook, so only that attribute is removed later.
	const addedTo = useRef<HTMLElement | null>(null);

	useLayoutEffect(() => {
		const node = element.current;
		if (!node || hasTabIndexProp) return;
		const wanted = enabled && (!focus_is_natively_tabbable(node) || focus_needs_safari_tab_index(node));
		if (wanted && !node.hasAttribute("tabindex")) {
			node.setAttribute("tabindex", "0");
			addedTo.current = node;
		} else if (!wanted && addedTo.current === node) {
			node.removeAttribute("tabindex");
			addedTo.current = null;
		}
	});
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

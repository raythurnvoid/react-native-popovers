import { createContext, memo, use, useId, useLayoutEffect, useState, type ComponentPropsWithRef } from "react";

// The group's label id setter, so a label inside a group can name its group.
const LayerGroupContext = createContext<((id: string | null) => void) | null>(null);

export type LayerGroupProps = ComponentPropsWithRef<"div">;

/**
 * A `role="group"` of items in a menu or a listbox. A `LayerGroupLabel` inside it names it.
 * `MenuGroup`, `SelectGroup`, and `ComboboxGroup` are this component.
 */
export const LayerGroup = memo(function LayerGroup(props: LayerGroupProps) {
	const { children, ...rest } = props;
	const [labelId, setLabelId] = useState<string | null>(null);

	return (
		<div role="group" aria-labelledby={labelId ?? undefined} {...rest}>
			<LayerGroupContext value={setLabelId}>{children}</LayerGroupContext>
		</div>
	);
});

export type LayerGroupLabelProps = ComponentPropsWithRef<"div">;

/**
 * The visible label of a `LayerGroup`. It is hidden from assistive technology, because the group
 * already takes its text as its name, like Ariakit.
 */
export const LayerGroupLabel = memo(function LayerGroupLabel(props: LayerGroupLabelProps) {
	const { id, ...rest } = props;
	const setGroupLabelId = use(LayerGroupContext);
	const generatedId = useId();
	const labelId = id ?? generatedId;

	useLayoutEffect(() => {
		if (!setGroupLabelId) return;
		setGroupLabelId(labelId);
		return () => setGroupLabelId(null);
	}, [setGroupLabelId, labelId]);

	return <div aria-hidden="true" {...rest} id={labelId} />;
});

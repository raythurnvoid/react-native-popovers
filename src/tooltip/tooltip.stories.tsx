import type { Meta, StoryObj } from "@storybook/react-vite";
import { StrictMode, useEffect, useRef, useState, type ReactNode } from "react";
import { Tooltip, TooltipAnchor, TooltipArrow, TooltipProvider, type TooltipProviderProps } from "./tooltip.tsx";
import { tooltip_PLACEMENTS } from "./placement.ts";
import "./tooltip.stories.css";

const meta = {
	title: "Tooltip",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

type Tip_Props = Omit<TooltipProviderProps, "children"> & {
	label: string;
	tip: ReactNode;
	arrow?: boolean;
};

/**
 * One button with one tooltip, the shape most stories need.
 */
function Tip(props: Tip_Props) {
	const { label, tip, arrow = true, ...provider } = props;

	return (
		<TooltipProvider {...provider}>
			<TooltipAnchor render={<button type="button">{label}</button>} />
			<Tooltip className="story-Tooltip">
				{tip}
				{arrow && <TooltipArrow />}
			</Tooltip>
		</TooltipProvider>
	);
}

/**
 * Shows each setOpen call, so tests can check that it runs even when the parent ignores it.
 */
function useRequests() {
	const [requests, setRequests] = useState<string[]>([]);
	const log = <output data-testid="requests">{requests.join(",")}</output>;

	return [log, (open: boolean) => setRequests((items) => [...items, open ? "open" : "closed"])] as const;
}

// #region basics
export const HoverDelay: Story = {
	render: () => (
		<div className="story-row">
			<Tip label="Save" tip="Save the file" placement="bottom" />
			<button type="button">Other</button>
		</div>
	),
};

export const StrictHover: Story = {
	render: () => (
		<StrictMode>
			<Tip label="Save" tip="Save the file" placement="bottom" />
		</StrictMode>
	),
};

export const FocusOpen: Story = {
	render: () => (
		<div className="story-row">
			<button type="button">Before</button>
			<Tip label="Save" tip="Save the file" />
			<input aria-label="Name" />
			<button type="button">After</button>
		</div>
	),
};

export const TwoTips: Story = {
	render: () => (
		<div className="story-row">
			<Tip label="Save" tip="Save the file" placement="bottom" />
			<Tip label="Share" tip="Share the file" placement="bottom" />
			<button type="button">Plain</button>
		</div>
	),
};

export const SharedAnchors: Story = {
	render: () => (
		<TooltipProvider placement="bottom">
			<div className="story-row" style={{ gap: 120 }}>
				<TooltipAnchor render={<button type="button">First</button>} />
				<TooltipAnchor render={<button type="button">Second</button>} />
			</div>
			<Tooltip className="story-Tooltip">
				One tooltip, two anchors
				<TooltipArrow />
			</Tooltip>
		</TooltipProvider>
	),
};

export const InteractiveContent: Story = {
	render: () => (
		<div className="story-row">
			<Tip
				label="Save"
				placement="bottom"
				tip={
					<>
						Save the file. <a href="#docs">Docs</a>
					</>
				}
			/>
			<button type="button">After</button>
		</div>
	),
};

export const Rerender: Story = {
	render: function Render() {
		const [count, setCount] = useState(0);

		// Render the parent and the anchor every 50ms. The hover timer must not start again.
		useEffect(() => {
			const interval = setInterval(() => setCount((value) => value + 1), 50);
			return () => clearInterval(interval);
		}, []);

		return (
			<TooltipProvider placement="bottom">
				<TooltipAnchor
					render={
						<button type="button" data-count={count}>
							Save
						</button>
					}
				/>
				<Tooltip className="story-Tooltip">Rendered {count} times</Tooltip>
			</TooltipProvider>
		);
	},
};
// #endregion basics

// #region controlled
export const ControlledClosed: Story = {
	render: function Render() {
		const [log, onRequest] = useRequests();

		return (
			<>
				{log}
				<Tip label="Save" tip="Save the file" open={false} setOpen={onRequest} />
			</>
		);
	},
};

export const ControlledOpen: Story = {
	render: function Render() {
		const [log, onRequest] = useRequests();

		return (
			<div className="story-row">
				{log}
				<Tip label="Save" tip="Save the file" open setOpen={onRequest} />
				<button type="button">Other</button>
				<Tip label="Share" tip="Share the file" placement="bottom" />
			</div>
		);
	},
};

export const ControlledDismiss: Story = {
	render: function Render() {
		const [open, setOpen] = useState(true);

		return (
			<div className="story-row">
				<output data-testid="state">{open ? "open" : "closed"}</output>
				<Tip label="Save" tip="Save the file" open={open} setOpen={setOpen} />
				<button type="button" onClick={() => setOpen(true)}>
					Reopen
				</button>
			</div>
		);
	},
};

export const ControlledSwitch: Story = {
	render: function Render() {
		const [mode, setMode] = useState<"open" | "closed" | "uncontrolled">("open");
		const open = mode === "uncontrolled" ? undefined : mode === "open";

		return (
			<div className="story-row">
				<Tip label="Save" tip="Save the file" placement="bottom" open={open} />
				<select aria-label="Mode" value={mode} onChange={(event) => setMode(event.currentTarget.value as typeof mode)}>
					<option value="open">open</option>
					<option value="closed">closed</option>
					<option value="uncontrolled">uncontrolled</option>
				</select>
			</div>
		);
	},
};

export const StrictControlled: Story = {
	render: () => (
		<StrictMode>
			<Tip label="Save" tip="Save the file" open />
		</StrictMode>
	),
};
// #endregion controlled

// #region accessibility
export const Described: Story = {
	render: function Render() {
		const [hint, setHint] = useState("hint-a");

		return (
			<div className="story-row">
				<p id="hint-a">Hint A</p>
				<p id="hint-b">Hint B</p>
				<TooltipProvider open>
					<TooltipAnchor
						render={
							<button type="button" aria-describedby={hint}>
								Save
							</button>
						}
					/>
					<Tooltip className="story-Tooltip">Save the file</Tooltip>
				</TooltipProvider>
				<button type="button" onClick={() => setHint((value) => (value === "hint-a" ? "hint-b" : "hint-a"))}>
					Swap hint
				</button>
			</div>
		);
	},
};

export const CustomId: Story = {
	render: () => (
		<TooltipProvider>
			<TooltipAnchor render={<button type="button">Save</button>} />
			<Tooltip id="save-tip" className="story-Tooltip">
				Save the file
			</Tooltip>
		</TooltipProvider>
	),
};

export const Disabled: Story = {
	render: () => (
		<div className="story-row">
			<TooltipProvider>
				<TooltipAnchor disabled render={<button type="button">Delete</button>} />
				<Tooltip className="story-Tooltip">You cannot delete this</Tooltip>
			</TooltipProvider>
			<TooltipProvider>
				<TooltipAnchor disabled render={<span>Archived</span>} />
				<Tooltip className="story-Tooltip">Archived items are read-only</Tooltip>
			</TooltipProvider>
			<button type="button">After</button>
		</div>
	),
};

export const NotFocusable: Story = {
	render: () => (
		<div className="story-row">
			<button type="button">Before</button>
			{/* Like the Files sidebar hit area: hover shows the tip, but Tab skips it. */}
			<TooltipProvider>
				<TooltipAnchor
					focusable={false}
					render={<div className="story-hit-area" aria-hidden data-testid="hit-area" />}
				/>
				<Tooltip className="story-Tooltip">Drag to move</Tooltip>
			</TooltipProvider>
			<TooltipProvider>
				<TooltipAnchor focusable={false} render={<button type="button">Pinned</button>} />
				<Tooltip className="story-Tooltip">Focus does not show this</Tooltip>
			</TooltipProvider>
			<button type="button">After</button>
		</div>
	),
};
export const ToggleDisabled: Story = {
	render: function Render() {
		const [disabled, setDisabled] = useState(false);
		const [focusable, setFocusable] = useState(true);

		return (
			<div className="story-row">
				<TooltipProvider>
					<TooltipAnchor disabled={disabled} focusable={focusable} render={<span>Label</span>} />
					<Tooltip className="story-Tooltip">A span gets tabIndex 0 only while it can take focus</Tooltip>
				</TooltipProvider>
				<button type="button" onClick={() => setDisabled((value) => !value)}>
					{disabled ? "Enable" : "Disable"}
				</button>
				<button type="button" onClick={() => setFocusable((value) => !value)}>
					{focusable ? "Not focusable" : "Focusable"}
				</button>
			</div>
		);
	},
};

// #endregion accessibility

// #region render
export const RenderForms: Story = {
	render: () => (
		<div className="story-row">
			<TooltipProvider>
				<TooltipAnchor className="story-default-anchor">Default div</TooltipAnchor>
				<Tooltip className="story-Tooltip">Wrapped in a div</Tooltip>
			</TooltipProvider>
			<TooltipProvider>
				<TooltipAnchor
					className="from-anchor"
					style={{ padding: 4 }}
					onClick={() => document.body.setAttribute("data-clicked", "anchor")}
					render={
						<button
							type="button"
							className="from-element"
							style={{ margin: 2, anchorName: "--mine" }}
							onClick={() => document.body.setAttribute("data-clicked-element", "yes")}
						>
							Element
						</button>
					}
				/>
				<Tooltip className="story-Tooltip">Props merged into the element</Tooltip>
			</TooltipProvider>
			<TooltipProvider>
				<TooltipAnchor
					render={(props) => (
						<button type="button" {...props}>
							Function
						</button>
					)}
				/>
				<Tooltip className="story-Tooltip">Props passed to the function</Tooltip>
			</TooltipProvider>
		</div>
	),
};

export const KeepMounted: Story = {
	render: () => (
		<TooltipProvider>
			<TooltipAnchor render={<button type="button">Save</button>} />
			<Tooltip className="story-Tooltip" unmountOnHide={false}>
				Save the file
			</Tooltip>
		</TooltipProvider>
	),
};

export const PortalIgnored: Story = {
	render: () => (
		<div style={{ overflow: "hidden", width: 120, height: 40, transform: "translateZ(0)" }}>
			<TooltipProvider placement="bottom">
				<TooltipAnchor render={<button type="button">Save</button>} />
				<Tooltip className="story-Tooltip" portal>
					The top layer escapes overflow and transforms
				</Tooltip>
			</TooltipProvider>
		</div>
	),
};
export const RefSwap: Story = {
	render: function Render() {
		const [name, setName] = useState("a");

		// Inline callback refs get a new identity on each render. Each one must receive the node.
		return (
			<div className="story-row">
				<TooltipProvider open placement="bottom">
					<TooltipAnchor
						ref={(node) => {
							document.body.setAttribute("data-anchor-ref", node ? name : "none");
						}}
						render={<button type="button">Save</button>}
					/>
					<Tooltip
						ref={(node) => {
							document.body.setAttribute("data-tooltip-ref", node ? name : "none");
						}}
						className="story-Tooltip"
					>
						Save the file
					</Tooltip>
				</TooltipProvider>
				<button type="button" onClick={() => setName((value) => (value === "a" ? "b" : "a"))}>
					Swap ref
				</button>
			</div>
		);
	},
};

// #endregion render

// #region placement
export const Placements: Story = {
	render: function Render() {
		const [all, setAll] = useState(false);

		return (
			<div>
				<label>
					<input type="checkbox" checked={all} onChange={(event) => setAll(event.currentTarget.checked)} /> Show all
				</label>
				<div className="story-grid">
					{tooltip_PLACEMENTS.map((placement) => (
						<Tip key={placement} label={placement} tip={placement} placement={placement} open={all || undefined} />
					))}
				</div>
			</div>
		);
	},
};

export const Flips: Story = {
	parameters: { layout: "fullscreen" },
	render: () => (
		<>
			<div className="story-corner" style={{ top: 4, left: 4 }}>
				<Tip label="Top left" tip="Flipped below and slid right" placement="top" open />
			</div>
			<div className="story-corner" style={{ top: 4, right: 4 }}>
				<Tip label="Top right" tip="Flipped to the left side" placement="right" open />
			</div>
			<div className="story-corner" style={{ bottom: 4, left: 4 }}>
				<Tip label="Bottom left" tip="Flipped above" placement="bottom-start" open />
			</div>
			<div className="story-corner" style={{ bottom: 4, right: 4 }}>
				<Tip label="Bottom right" tip="Flipped above, end aligned" placement="bottom-end" open />
			</div>
			{/* In RTL, right is the inline end, which is the physical left. */}
			<div className="story-corner" dir="rtl" style={{ top: 120, left: 4 }}>
				<Tip label="RTL left edge" tip="RTL flipped to the physical right" placement="right" open />
			</div>
			{/* In RTL, top-start grows toward the physical left, so at the left edge it must flip. */}
			<div className="story-corner" dir="rtl" style={{ top: 240, left: 4 }}>
				<Tip label="RTL start" tip="RTL start flipped to grow right" placement="top-start" open />
			</div>
		</>
	),
};

export const Rtl: Story = {
	render: () => (
		<div dir="rtl" className="story-grid">
			<Tip label="left" tip="left" placement="left" open />
			<Tip label="right" tip="right" placement="right" open />
			<Tip label="top-start" tip="top-start" placement="top-start" open />
			<Tip label="bottom-end" tip="bottom-end" placement="bottom-end" open />
		</div>
	),
};

export const Arrows: Story = {
	render: () => (
		<div className="story-grid">
			{[12, 16, 24].map((size) => (
				<TooltipProvider key={size} open placement="bottom">
					<TooltipAnchor render={<button type="button">Size {size}</button>} />
					<Tooltip className="story-Tooltip story-Tooltip-thick">
						Size {size}
						<TooltipArrow size={size} data-testid={`arrow-${size}`} />
					</Tooltip>
				</TooltipProvider>
			))}
			<TooltipProvider open placement="top" timeout={0}>
				<TooltipAnchor render={<button type="button">Light</button>} />
				<Tooltip className="story-Tooltip story-Tooltip-light" gutter={4}>
					Light theme
					<TooltipArrow data-testid="arrow-light" />
				</Tooltip>
			</TooltipProvider>
		</div>
	),
};
export const ArrowAim: Story = {
	render: () => (
		<div className="story-grid">
			{/* A small anchor under a wide tooltip. The arrow points at the anchor, not at a corner. */}
			<TooltipProvider open placement="bottom-start">
				<TooltipAnchor
					render={
						<button type="button" className="story-small-anchor">
							S
						</button>
					}
				/>
				<Tooltip className="story-Tooltip">
					The arrow points at the small anchor
					<TooltipArrow data-testid="arrow-small" />
				</Tooltip>
			</TooltipProvider>
			{/* A wide anchor with a short tooltip. The arrow stays inside the tooltip box. */}
			<TooltipProvider open placement="top-start">
				<TooltipAnchor
					render={
						<button type="button" className="story-wide-anchor">
							Wide anchor
						</button>
					}
				/>
				<Tooltip className="story-Tooltip">
					Short
					<TooltipArrow data-testid="arrow-wide" />
				</Tooltip>
			</TooltipProvider>
			<TooltipProvider open placement="right-end">
				<TooltipAnchor render={<button type="button">Side</button>} />
				<Tooltip className="story-Tooltip">
					A tall tooltip
					<br />
					on two lines
					<TooltipArrow data-testid="arrow-side" />
				</Tooltip>
			</TooltipProvider>
		</div>
	),
};

export const ArrowRing: Story = {
	render: () => (
		<div className="story-grid">
			<TooltipProvider open placement="bottom">
				<TooltipAnchor render={<button type="button">Ring</button>} />
				<Tooltip className="story-Tooltip story-Tooltip-ring">
					A ring box-shadow, no border
					<TooltipArrow data-testid="arrow-ring" />
				</Tooltip>
			</TooltipProvider>
		</div>
	),
};

export const ArrowFallback: Story = {
	render: () => (
		<div className="story-grid">
			{/* A transform makes the content the arrow's containing block, so anchor() cannot reach the
			   trigger. The arrow then sits centered on the requested side. */}
			<TooltipProvider open placement="top-start">
				<TooltipAnchor render={<button type="button">Transformed</button>} />
				<Tooltip className="story-Tooltip" style={{ transform: "translateX(0)" }}>
					A transform on the content
					<TooltipArrow data-testid="arrow-transformed" />
				</Tooltip>
			</TooltipProvider>
		</div>
	),
};

// #endregion placement

// #region pointer
export const Hoverable: Story = {
	render: () => (
		<div className="story-row">
			<Tip label="Save" tip="Move the pointer here and select this text" placement="bottom" />
			<button type="button">Other</button>
		</div>
	),
};

export const ScrollContainer: Story = {
	render: () => (
		<div className="story-scroll" data-testid="scroller">
			{Array.from({ length: 12 }, (_, index) => (
				<span key={index} className="story-scroll-item">
					<Tip label={`Item ${index + 1}`} tip={`Item ${index + 1}`} placement="right" />
				</span>
			))}
		</div>
	),
};

export const ManyRows: Story = {
	render: () => (
		<div className="story-rows">
			{Array.from({ length: 1000 }, (_, index) => (
				<TooltipProvider key={index} placement="right">
					<TooltipAnchor
						render={
							<button type="button" className="story-rows-item">
								Row {index + 1}
							</button>
						}
					/>
					<Tooltip className="story-Tooltip">Row {index + 1}</Tooltip>
				</TooltipProvider>
			))}
		</div>
	),
};
// #endregion pointer

// #region layers
export const InDialog: Story = {
	render: function Render() {
		const dialog = useRef<HTMLDialogElement>(null);

		return (
			<>
				<button type="button" onClick={() => dialog.current?.showModal()}>
					Open dialog
				</button>
				<dialog ref={dialog} aria-label="Settings">
					<p>Escape closes the tooltip first, then the dialog.</p>
					<Tip label="Save" tip="Save the settings" placement="bottom" />
				</dialog>
			</>
		);
	},
};
// #endregion layers

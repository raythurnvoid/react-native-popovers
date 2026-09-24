import {
	Dialog as AriakitDialog,
	DialogProvider as AriakitDialogProvider,
	Popover as AriakitPopover,
	PopoverDisclosure as AriakitPopoverDisclosure,
	PopoverProvider as AriakitPopoverProvider,
} from "@ariakit/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StrictMode, useRef, useState, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { Popover, PopoverDisclosure, PopoverDismiss, PopoverProvider, type PopoverProviderProps } from "./popover.tsx";
import { Tooltip, TooltipAnchor, TooltipProvider } from "../tooltip/tooltip.tsx";
import { PLACEMENTS } from "../layer/placement.ts";
import "./popover.stories.css";

const meta = {
	title: "Popover",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

type Pop_Props = Omit<PopoverProviderProps, "children"> & {
	label: string;
	children: ReactNode;
	gutter?: number;
	overflowPadding?: number;
	unmountOnHide?: boolean;
};

/**
 * One button with one popover, the shape most stories need.
 */
function Pop(props: Pop_Props) {
	const { label, children, gutter = 4, overflowPadding, unmountOnHide, ...provider } = props;

	return (
		<PopoverProvider {...provider}>
			<PopoverDisclosure>{label}</PopoverDisclosure>
			<Popover
				className="story-Popover"
				gutter={gutter}
				overflowPadding={overflowPadding}
				unmountOnHide={unmountOnHide}
				aria-label={label}
			>
				{children}
			</Popover>
		</PopoverProvider>
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

type TipButton_Props = HTMLAttributes<HTMLButtonElement> & {
	ref?: Ref<HTMLButtonElement>;
	tip: string;
};

/**
 * A button with its own tooltip, like t3-chat's MyIconButton with a `tooltip` prop.
 */
function TipButton(props: TipButton_Props) {
	const { ref, tip, ...rest } = props;

	return (
		<TooltipProvider placement="top">
			<TooltipAnchor render={<button type="button" ref={ref} {...rest} />} />
			<Tooltip className="story-Tooltip">{tip}</Tooltip>
		</TooltipProvider>
	);
}

// #region basics
export const Basic: Story = {
	render: () => (
		<div className="story-row">
			<input aria-label="Before input" />
			<Pop label="Filters">
				<label>
					Name <input aria-label="Name" />
				</label>
				<button type="button">Apply</button>
			</Pop>
			<button type="button">After</button>
		</div>
	),
};

export const NoTabbable: Story = {
	render: () => (
		<div className="story-row">
			<Pop label="Info">Only text inside, so the content itself takes focus.</Pop>
			<button type="button">After</button>
		</div>
	),
};

export const Autofocus: Story = {
	render: () => (
		<div className="story-row">
			{/* React's autoFocus prop focuses on mount and writes no attribute, so use data-autofocus in JSX. */}
			<Pop label="Data autofocus">
				<button type="button">First</button>
				<input aria-label="Skipped" data-autofocus={false} />
				<input aria-label="Data target" data-autofocus />
			</Pop>
			<Pop label="Attribute autofocus">
				<button type="button">First</button>
				<input
					aria-label="Attribute target"
					ref={(node) => {
						node?.setAttribute("autofocus", "");
					}}
				/>
			</Pop>
		</div>
	),
};

export const StrictToggle: Story = {
	render: () => (
		<StrictMode>
			<Pop label="Filters">
				<button type="button">Apply</button>
			</Pop>
		</StrictMode>
	),
};

export const DisabledTrigger: Story = {
	render: () => (
		<div className="story-row">
			<PopoverProvider>
				<PopoverDisclosure
					render={
						<button type="button" disabled title="Select text first">
							Comment
						</button>
					}
				/>
				<Popover className="story-Popover" aria-label="Comment">
					<button type="button">Post</button>
				</Popover>
			</PopoverProvider>
			<button type="button">After</button>
		</div>
	),
};
// #endregion basics

// #region controlled
export const Controlled: Story = {
	render: function Render() {
		const [log, onRequest] = useRequests();
		const [open, setOpen] = useState(false);
		const [refuseClose, setRefuseClose] = useState(false);

		return (
			<div className="story-row">
				{log}
				<label>
					<input
						type="checkbox"
						checked={refuseClose}
						onChange={(event) => setRefuseClose(event.currentTarget.checked)}
					/>{" "}
					Refuse close
				</label>
				<PopoverProvider
					open={open}
					setOpen={(value) => {
						onRequest(value);
						if (value || !refuseClose) setOpen(value);
					}}
				>
					<PopoverDisclosure>Jobs</PopoverDisclosure>
					<Popover className="story-Popover" gutter={4} unmountOnHide aria-label="Jobs">
						<button type="button">Job 1</button>
						<button type="button" onClick={() => setOpen(false)}>
							Done
						</button>
					</Popover>
				</PopoverProvider>
				<button type="button">Outside</button>
			</div>
		);
	},
};

export const StrictControlled: Story = {
	render: function Render() {
		const [log, onRequest] = useRequests();
		const [open, setOpen] = useState(false);

		return (
			<StrictMode>
				<div className="story-row">
					{log}
					<PopoverProvider
						open={open}
						setOpen={(value) => {
							onRequest(value);
							setOpen(value);
						}}
					>
						<PopoverDisclosure>Jobs</PopoverDisclosure>
						<Popover className="story-Popover" gutter={4} unmountOnHide aria-label="Jobs">
							<button type="button">Job 1</button>
						</Popover>
					</PopoverProvider>
					<button type="button">Outside</button>
				</div>
			</StrictMode>
		);
	},
};
// #endregion controlled

// #region dismiss
export const Dismiss: Story = {
	render: () => (
		<div className="story-row">
			<Pop label="Default icon">
				<p>Close with the X.</p>
				<PopoverDismiss className="story-dismiss" />
			</Pop>
			<Pop label="Custom text">
				<button type="button">First</button>
				<PopoverDismiss>Close</PopoverDismiss>
			</Pop>
			<Pop label="Prevented">
				<PopoverDismiss onClick={(event) => event.preventDefault()}>Stay</PopoverDismiss>
			</Pop>
		</div>
	),
};
// #endregion dismiss

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
					{PLACEMENTS.map((placement) => (
						<Pop key={placement} label={placement} placement={placement} open={all || undefined}>
							{placement}
						</Pop>
					))}
				</div>
			</div>
		);
	},
};

export const AriakitParity: Story = {
	render: function Render() {
		const [gutter, setGutter] = useState(4);

		// Each cell sits on whole pixels, so both boxes round the same way.
		return (
			<div>
				<button type="button" onClick={() => setGutter((value) => (value === 4 ? 10 : 4))}>
					Gutter {gutter}
				</button>
				<div className="story-parity">
					{PLACEMENTS.map((placement) => (
						<div key={placement} className="story-parity-cell" data-placement={placement}>
							<PopoverProvider open placement={placement}>
								<PopoverDisclosure className="story-parity-trigger" data-kind="native">
									N
								</PopoverDisclosure>
								<Popover className="story-Popover" gutter={gutter} data-kind="native">
									{placement}
								</Popover>
							</PopoverProvider>
							<AriakitPopoverProvider open placement={placement}>
								<AriakitPopoverDisclosure className="story-parity-trigger" data-kind="ariakit">
									A
								</AriakitPopoverDisclosure>
								<AriakitPopover
									className="story-Popover"
									gutter={gutter}
									portal
									autoFocusOnShow={false}
									data-kind="ariakit"
								>
									{placement}
								</AriakitPopover>
							</AriakitPopoverProvider>
						</div>
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
			<div className="story-corner" style={{ bottom: 4, left: 200 }}>
				<Pop label="Bottom edge" placement="bottom" open>
					Flipped above
				</Pop>
			</div>
			<div className="story-corner" style={{ top: 200, right: 4 }}>
				<Pop label="Right edge" placement="bottom-start" open>
					Flipped to end at the trigger
				</Pop>
			</div>
		</>
	),
};

const WIDE_TEXT =
	"A centered popover wider than the space next to its trigger. The browser shifts it into the viewport.";

export const OverflowPadding: Story = {
	parameters: { layout: "fullscreen" },
	render: () => (
		<>
			<div className="story-corner" style={{ top: 100, right: 4 }}>
				<Pop label="Default padding" open>
					{WIDE_TEXT}
				</Pop>
			</div>
			<div className="story-corner" style={{ top: 300, right: 4 }}>
				<Pop label="No padding" overflowPadding={0} open>
					{WIDE_TEXT}
				</Pop>
			</div>
			<div className="story-corner" style={{ bottom: 4, left: 100 }}>
				<Pop label="Right side" placement="right" open>
					{WIDE_TEXT}
				</Pop>
			</div>
		</>
	),
};
// #endregion placement

// #region layers
export const TooltipInside: Story = {
	render: () => (
		<div className="story-row">
			<PopoverProvider>
				<PopoverDisclosure render={<TipButton tip="Open the jobs">Jobs</TipButton>} />
				<Popover className="story-Popover" gutter={4} aria-label="Jobs">
					<TipButton tip="Retry this job">Retry</TipButton>
				</Popover>
			</PopoverProvider>
			<button type="button">Outside</button>
		</div>
	),
};

export const Nested: Story = {
	render: () => (
		<div className="story-row">
			<PopoverProvider>
				<PopoverDisclosure>Parent</PopoverDisclosure>
				<Popover className="story-Popover" gutter={4} aria-label="Parent">
					<p>Parent text</p>
					<PopoverProvider placement="right-start">
						<PopoverDisclosure>Child</PopoverDisclosure>
						<Popover className="story-Popover" gutter={4} aria-label="Child">
							<button type="button">Child action</button>
							<PopoverDismiss>Close child</PopoverDismiss>
						</Popover>
					</PopoverProvider>
					<PopoverDismiss>Close parent</PopoverDismiss>
				</Popover>
			</PopoverProvider>
			<button type="button">Outside</button>
		</div>
	),
};

export const ParentCloseTooltip: Story = {
	render: function Render() {
		const [open, setOpen] = useState(false);

		// The content stays mounted (unmountOnHide false). A tooltip open inside it must still close.
		// "Save later" closes on a timer, so no click or focus change closes the tooltip first.
		return (
			<div className="story-row">
				<PopoverProvider open={open} setOpen={setOpen}>
					<PopoverDisclosure>Link</PopoverDisclosure>
					<Popover className="story-Popover" gutter={4} aria-label="Link">
						<TooltipProvider placement="bottom" timeout={0}>
							<TooltipAnchor render={<span className="story-hint">Hint</span>} focusable={false} />
							<Tooltip className="story-Tooltip">Paste a URL</Tooltip>
						</TooltipProvider>
						<button type="button" onClick={() => setTimeout(() => setOpen(false), 2000)}>
							Save later
						</button>
					</Popover>
				</PopoverProvider>
				<button type="button">Outside</button>
			</div>
		);
	},
};

export const EscapeOwner: Story = {
	render: function Render() {
		const [value, setValue] = useState("draft");

		return (
			<Pop label="Search">
				{/* Like a combobox: the first Escape clears the input and keeps the popover open. */}
				<input
					aria-label="Query"
					value={value}
					onChange={(event) => setValue(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key !== "Escape" || !value) return;
						event.preventDefault();
						setValue("");
					}}
				/>
			</Pop>
		);
	},
};

export const InDialog: Story = {
	render: function Render() {
		const dialog = useRef<HTMLDialogElement>(null);

		return (
			<>
				<button type="button" onClick={() => dialog.current?.showModal()}>
					Open dialog
				</button>
				<dialog ref={dialog} aria-label="Settings">
					<p>Escape closes the popover first, then the dialog.</p>
					<Pop label="Options">
						<button type="button">Option</button>
					</Pop>
				</dialog>
			</>
		);
	},
};

export const InAriakitDialog: Story = {
	render: function Render() {
		const [open, setOpen] = useState(false);

		return (
			<>
				<button type="button" onClick={() => setOpen(true)}>
					Open dialog
				</button>
				<AriakitDialogProvider open={open} setOpen={setOpen}>
					<AriakitDialog className="story-dialog" aria-label="Settings">
						<p>Escape closes the popover first, then the dialog.</p>
						<Pop label="Options">
							<button type="button">Option</button>
						</Pop>
					</AriakitDialog>
				</AriakitDialogProvider>
			</>
		);
	},
};

export const AriakitDialogFromPopover: Story = {
	render: function Render() {
		const [dialogOpen, setDialogOpen] = useState(false);

		return (
			<div className="story-row">
				<Pop label="Notifications" unmountOnHide>
					<button type="button" onClick={() => setDialogOpen(true)}>
						View progress
					</button>
				</Pop>
				<button type="button">Outside</button>
				{/* Rendered outside the popover, like t3-chat modals that a provider owns. */}
				<AriakitDialogProvider open={dialogOpen} setOpen={setDialogOpen}>
					<AriakitDialog className="story-dialog" aria-label="Progress">
						<p>The popover stays open under this modal.</p>
						<button type="button" onClick={() => setDialogOpen(false)}>
							Close
						</button>
					</AriakitDialog>
				</AriakitDialogProvider>
			</div>
		);
	},
};
// #endregion layers

// #region mounting
export const KeepMounted: Story = {
	render: () => (
		<div className="story-row">
			<Pop label="Kept">Kept in the DOM while closed</Pop>
			<Pop label="Unmounted" unmountOnHide>
				Removed from the DOM while closed
			</Pop>
		</div>
	),
};

export const HiddenContainer: Story = {
	render: function Render() {
		const [hide, setHide] = useState<"none" | "visibility" | "display">("none");

		// Like a toolbar that hides while its popover is open. The popover keeps its DOM parent, so it inherits.
		return (
			<div>
				<select aria-label="Hide" value={hide} onChange={(event) => setHide(event.currentTarget.value as typeof hide)}>
					<option value="none">none</option>
					<option value="visibility">visibility: hidden</option>
					<option value="display">display: none</option>
				</select>
				<div
					data-testid="container"
					style={
						hide === "visibility" ? { visibility: "hidden" } : hide === "display" ? { display: "none" } : undefined
					}
				>
					<Pop label="Link" open>
						<button type="button">Save link</button>
					</Pop>
				</div>
			</div>
		);
	},
};

export const InertContainer: Story = {
	render: function Render() {
		const [off, setOff] = useState(false);

		// Like t3-chat's editor toolbar, which the app turns off with `hidden` and `inert` together.
		// The button inside the popover turns it off without an outside click.
		return (
			<div>
				<div data-testid="container" hidden={off} inert={off}>
					<Pop label="Link">
						<button type="button" onClick={() => setOff(true)}>
							Turn off the toolbar
						</button>
					</Pop>
				</div>
				<button type="button" onClick={() => setOff(false)}>
					Turn on the toolbar
				</button>
			</div>
		);
	},
};
// #endregion mounting

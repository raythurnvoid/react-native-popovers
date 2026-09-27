import {
	Dialog as AriakitDialog,
	DialogProvider as AriakitDialogProvider,
	Hovercard as AriakitHovercard,
	HovercardAnchor as AriakitHovercardAnchor,
	HovercardProvider as AriakitHovercardProvider,
	PopoverArrow as AriakitPopoverArrow,
} from "@ariakit/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StrictMode, useRef, useState, type ReactNode } from "react";
import {
	Hovercard,
	HovercardAnchor,
	HovercardArrow,
	HovercardDisclosure,
	HovercardProvider,
	type HovercardProviderProps,
} from "./hovercard.tsx";
import { Tooltip, TooltipAnchor, TooltipProvider } from "../tooltip/tooltip.tsx";
import "./hovercard.stories.css";

const meta = {
	title: "Hovercard",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

type Card_Props = Omit<HovercardProviderProps, "children"> & {
	label: string;
	children: ReactNode;
	gutter?: number;
	arrow?: boolean;
	srOnlyDisclosure?: boolean;
};

/**
 * One anchor, one disclosure, and one card, the shape of t3-chat's presence hovercard.
 */
function Card(props: Card_Props) {
	const { label, children, gutter = 4, arrow = true, srOnlyDisclosure = false, ...provider } = props;

	return (
		<HovercardProvider {...provider}>
			<HovercardAnchor className="story-Hovercard-anchor">{label}</HovercardAnchor>
			<HovercardDisclosure
				className={srOnlyDisclosure ? "story-sr-only" : "story-Hovercard-disclosure"}
				aria-label={`Show ${label}`}
			>
				{srOnlyDisclosure ? null : "▾"}
			</HovercardDisclosure>
			<Hovercard className="story-Hovercard" gutter={gutter} aria-label={`${label} card`}>
				{children}
				{arrow ? <HovercardArrow /> : null}
			</Hovercard>
		</HovercardProvider>
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
export const Basic: Story = {
	render: () => (
		<div className="story-row">
			<button type="button">Before</button>
			<Card label="Ada">
				<p>Ada Lovelace is online.</p>
				<button type="button">Disable</button>
			</Card>
			<button type="button">After</button>
		</div>
	),
};

export const AppLike: Story = {
	render: () => (
		<div className="story-row story-sidebar">
			{/* Like a toolbar button: a press on it does not move focus. */}
			<button type="button" onMouseDown={(event) => event.preventDefault()}>
				No focus
			</button>
			<button type="button">Before</button>
			<Card label="1 online" placement="right-start" showTimeout={0} srOnlyDisclosure>
				<p>1 Online</p>
				<button type="button">Disable</button>
			</Card>
			<button type="button">After</button>
		</div>
	),
};

export const NoTabbable: Story = {
	render: () => (
		<div className="story-row">
			<Card label="Info" arrow={false}>
				Only text inside, so the card itself takes focus.
			</Card>
			<button type="button">After</button>
		</div>
	),
};

export const StrictHover: Story = {
	render: () => (
		<StrictMode>
			<div className="story-row">
				<Card label="Ada" showTimeout={0}>
					<button type="button">Disable</button>
				</Card>
			</div>
		</StrictMode>
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
				<Card
					label="Ada"
					showTimeout={0}
					open={open}
					setOpen={(value) => {
						onRequest(value);
						if (value || !refuseClose) setOpen(value);
					}}
				>
					<button type="button" onClick={() => setOpen(false)}>
						Done
					</button>
				</Card>
				<button type="button">Outside</button>
			</div>
		);
	},
};

export const StrictControlled: Story = {
	render: function Render() {
		const [open, setOpen] = useState(false);

		return (
			<StrictMode>
				<div className="story-row">
					<Card label="Ada" showTimeout={0} open={open} setOpen={setOpen}>
						<button type="button">Disable</button>
					</Card>
				</div>
			</StrictMode>
		);
	},
};
// #endregion controlled

// #region layers
export const TooltipInside: Story = {
	render: () => (
		<div className="story-row">
			<Card label="Ada" showTimeout={0}>
				<TooltipProvider placement="top">
					<TooltipAnchor render={<button type="button">Disable</button>} />
					<Tooltip className="story-Tooltip">Stop sharing presence</Tooltip>
				</TooltipProvider>
				{/* A second stop, so Tab and Shift+Tab stay inside the card in every browser. */}
				<button type="button">Settings</button>
			</Card>
		</div>
	),
};

export const InDialog: Story = {
	render: function Render() {
		const dialog = useRef<HTMLDialogElement | null>(null);

		return (
			<div>
				<button type="button" onClick={() => dialog.current?.showModal()}>
					Open dialog
				</button>
				<dialog ref={dialog} aria-label="Settings" className="story-dialog">
					<Card label="Ada" showTimeout={0}>
						<button type="button">Disable</button>
					</Card>
				</dialog>
			</div>
		);
	},
};

export const InAriakitDialog: Story = {
	render: function Render() {
		const [open, setOpen] = useState(false);

		return (
			<div>
				<button type="button" onClick={() => setOpen(true)}>
					Open dialog
				</button>
				<AriakitDialogProvider open={open} setOpen={setOpen}>
					<AriakitDialog aria-label="Settings" className="story-dialog" portal>
						<Card label="Ada" showTimeout={0}>
							<button type="button">Disable</button>
						</Card>
					</AriakitDialog>
				</AriakitDialogProvider>
			</div>
		);
	},
};
// #endregion layers

// #region placement
const PARITY_PLACEMENTS = ["right-start", "bottom", "top-end", "left"] as const;

export const AriakitParity: Story = {
	render: () => (
		// Each cell sits on whole pixels, so both boxes round the same way.
		<div className="story-parity">
			{PARITY_PLACEMENTS.map((placement) => (
				<div key={placement} className="story-parity-cell" data-placement={placement}>
					<HovercardProvider open placement={placement}>
						<HovercardAnchor className="story-parity-trigger" data-kind="native">
							N
						</HovercardAnchor>
						<Hovercard className="story-Hovercard" gutter={4} data-kind="native" aria-label={`native ${placement}`}>
							{placement}
							<HovercardArrow />
						</Hovercard>
					</HovercardProvider>
					<AriakitHovercardProvider open placement={placement}>
						<AriakitHovercardAnchor className="story-parity-trigger" data-kind="ariakit">
							A
						</AriakitHovercardAnchor>
						<AriakitHovercard
							className="story-Hovercard"
							gutter={4}
							portal
							data-kind="ariakit"
							aria-label={`ariakit ${placement}`}
						>
							{placement}
							<AriakitPopoverArrow />
						</AriakitHovercard>
					</AriakitHovercardProvider>
				</div>
			))}
		</div>
	),
};

export const Flips: Story = {
	parameters: { layout: "fullscreen" },
	render: () => (
		<div className="story-corner" style={{ bottom: 4, left: 200 }}>
			<Card label="Bottom edge" placement="bottom" open>
				Flipped above
			</Card>
		</div>
	),
};
// #endregion placement

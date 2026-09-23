import { StrictMode, useEffect, useState } from "react";
import { Tooltip } from "./Tooltip.tsx";
import { TooltipAnchor } from "./TooltipAnchor.tsx";
import { TooltipArrow } from "./TooltipArrow.tsx";
import { TooltipProvider } from "./TooltipProvider.tsx";
import type { tooltip_Placement } from "./placement.ts";

export default {
	title: "Tooltip",
};

export function HoverDelay() {
	return (
		<TooltipProvider timeout={600} placement="bottom">
			<TooltipAnchor>
				<button type="button">Save</button>
			</TooltipAnchor>
			<Tooltip>
				Saved
				<TooltipArrow />
			</Tooltip>
		</TooltipProvider>
	);
}

export function StrictHover() {
	return (
		<StrictMode>
			<HoverDelay />
		</StrictMode>
	);
}

export function FocusOpen() {
	return (
		<TooltipProvider timeout={600} placement="top">
			<TooltipAnchor>
				<button type="button">Save</button>
			</TooltipAnchor>
			<Tooltip>Saved</Tooltip>
		</TooltipProvider>
	);
}

export function TwoTips() {
	return (
		<div style={{ display: "flex", gap: 24 }}>
			<TooltipProvider timeout={600} placement="bottom">
				<TooltipAnchor>
					<button type="button">Save</button>
				</TooltipAnchor>
				<Tooltip>Saved</Tooltip>
			</TooltipProvider>
			<TooltipProvider timeout={600} placement="bottom">
				<TooltipAnchor>
					<button type="button">Share</button>
				</TooltipAnchor>
				<Tooltip>Shared</Tooltip>
			</TooltipProvider>
		</div>
	);
}

export function ControlledClosed() {
	const [requested, setRequested] = useState("idle");

	return (
		<>
			<p data-testid="requested">{requested}</p>
			<TooltipProvider
				open={false}
				placement="bottom"
				timeout={100}
				setOpen={(next) => {
					setRequested(next ? "open" : "closed");
				}}
			>
				<TooltipAnchor>
					<button type="button">Save</button>
				</TooltipAnchor>
				<Tooltip>Saved</Tooltip>
			</TooltipProvider>
		</>
	);
}

export function Described() {
	return (
		<>
			<span id="hint">Extra hint</span>
			<TooltipProvider timeout={100} placement="bottom">
				<TooltipAnchor>
					<button type="button" aria-describedby="hint">
						Save
					</button>
				</TooltipAnchor>
				<Tooltip>Saved</Tooltip>
			</TooltipProvider>
		</>
	);
}

export function RerenderDuringDelay() {
	const [tick, setTick] = useState(0);

	useEffect(() => {
		const id = window.setTimeout(() => setTick(1), 200);
		return () => window.clearTimeout(id);
	}, []);

	return (
		<TooltipProvider timeout={600} placement="bottom">
			<TooltipAnchor>
				<button type="button">Save</button>
			</TooltipAnchor>
			<Tooltip>Saved {tick}</Tooltip>
		</TooltipProvider>
	);
}

export function StrictControlled() {
	const [open, setOpen] = useState(false);

	return (
		<StrictMode>
			<TooltipProvider open={open} setOpen={setOpen} timeout={600} placement="bottom">
				<TooltipAnchor>
					<button type="button">Save</button>
				</TooltipAnchor>
				<Tooltip>Saved</Tooltip>
			</TooltipProvider>
		</StrictMode>
	);
}

export function ControlledStaysOpen() {
	const [requested, setRequested] = useState("open");

	return (
		<>
			<p data-testid="requested">{requested}</p>
			<TooltipProvider
				open
				placement="bottom"
				timeout={0}
				setOpen={(next) => {
					setRequested(next ? "open" : "closed");
				}}
			>
				<TooltipAnchor>
					<button type="button">Save</button>
				</TooltipAnchor>
				<Tooltip>Saved</Tooltip>
			</TooltipProvider>
		</>
	);
}

export function Placement() {
	return <PlacementExample placement="bottom-start" />;
}

export function ControlledDismiss() {
	const [open, setOpen] = useState(true);

	return (
		<>
			<button type="button" onClick={() => setOpen(false)}>
				Close
			</button>
			<TooltipProvider open={open} setOpen={setOpen} timeout={600} placement="bottom">
				<TooltipAnchor>
					<button type="button">Save</button>
				</TooltipAnchor>
				<Tooltip>Saved</Tooltip>
			</TooltipProvider>
		</>
	);
}

function PlacementExample(props: { placement: tooltip_Placement }) {
	const { placement } = props;

	return (
		<TooltipProvider timeout={0} placement={placement} open>
			<TooltipAnchor>
				<button type="button">Save</button>
			</TooltipAnchor>
			<Tooltip gutter={12}>Saved</Tooltip>
		</TooltipProvider>
	);
}

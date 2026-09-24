import * as Ariakit from "@ariakit/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentType } from "react";
import { Tooltip, TooltipAnchor, TooltipArrow, TooltipProvider } from "./tooltip.tsx";
import "./tooltip.stories.css";
import "./tooltip-perf.stories.css";

/**
 * Same lists with the native tooltip and with Ariakit, for performance checks.
 *
 * `timeout` is 0 so a hover measure is not hidden by the show delay. `unmountOnHide` is not set,
 * so each library uses its own default: `true` here, `false` in Ariakit (and in t3-chat's
 * `MyTooltipContent`). Both can be changed with URL args, for example
 * `&args=timeout:500;unmountOnHide:!true`.
 */
type PerfArgs = {
	timeout: number;
	unmountOnHide?: boolean;
};

const meta = {
	title: "Tooltip perf",
	args: { timeout: 0 },
	argTypes: {
		timeout: { control: "number" },
		unmountOnHide: { control: "boolean" },
	},
} satisfies Meta<PerfArgs>;

export default meta;

type Story = StoryObj<PerfArgs>;

const ROW_COUNT = 1000;

type Tip_Props = PerfArgs & {
	label: string;
	tip: string;
	className: string;
};

// The two Tip components must keep the same JSX, so the library is the only difference.
function NativeTip(props: Tip_Props) {
	const { label, tip, className, timeout, unmountOnHide } = props;

	return (
		<TooltipProvider placement="right" timeout={timeout}>
			<TooltipAnchor
				render={
					<button type="button" className={className}>
						{label}
					</button>
				}
			/>
			<Tooltip className="story-Tooltip" gutter={8} unmountOnHide={unmountOnHide}>
				{tip}
				<TooltipArrow />
			</Tooltip>
		</TooltipProvider>
	);
}

function AriakitTip(props: Tip_Props) {
	const { label, tip, className, timeout, unmountOnHide } = props;

	return (
		<Ariakit.TooltipProvider placement="right" timeout={timeout}>
			<Ariakit.TooltipAnchor
				render={
					<button type="button" className={className}>
						{label}
					</button>
				}
			/>
			<Ariakit.Tooltip className="story-Tooltip" gutter={8} unmountOnHide={unmountOnHide}>
				{tip}
				<Ariakit.TooltipArrow />
			</Ariakit.Tooltip>
		</Ariakit.TooltipProvider>
	);
}

type Rows_Props = PerfArgs & {
	Tip: ComponentType<Tip_Props>;
	tipsPerRow: 1 | 3;
};

/**
 * 1000 rows in a scroll box. The button above it mounts and unmounts the rows, so a script can
 * time a mount without the Storybook page load.
 */
function Rows(props: Rows_Props) {
	const { Tip, tipsPerRow, ...args } = props;
	const [mounted, setMounted] = useState(true);

	return (
		<div>
			<button type="button" data-testid="perf-toggle" onClick={() => setMounted((value) => !value)}>
				{mounted ? "Unmount rows" : "Mount rows"}
			</button>
			<div className="story-rows" data-testid="perf-rows">
				{mounted &&
					Array.from({ length: ROW_COUNT }, (_, index) =>
						tipsPerRow === 1 ? (
							<Tip
								key={index}
								{...args}
								label={`Row ${index + 1}`}
								tip={`Row ${index + 1}`}
								className="story-rows-item"
							/>
						) : (
							// Like a Files sidebar row: the name, then two icon buttons, each with a tooltip.
							<div key={index} className="perf-row">
								<Tip {...args} label={`Row ${index + 1}`} tip={`Row ${index + 1}`} className="perf-row-main" />
								<Tip {...args} label="+" tip="Add a file" className="perf-row-action" />
								<Tip {...args} label="…" tip="More actions" className="perf-row-action" />
							</div>
						),
					)}
			</div>
		</div>
	);
}

// #region one tip per row
export const NativeOneTip: Story = {
	render: (args) => <Rows {...args} Tip={NativeTip} tipsPerRow={1} />,
};

export const AriakitOneTip: Story = {
	render: (args) => <Rows {...args} Tip={AriakitTip} tipsPerRow={1} />,
};
// #endregion one tip per row

// #region three tips per row
export const NativeThreeTips: Story = {
	render: (args) => <Rows {...args} Tip={NativeTip} tipsPerRow={3} />,
};

export const AriakitThreeTips: Story = {
	render: (args) => <Rows {...args} Tip={AriakitTip} tipsPerRow={3} />,
};
// #endregion three tips per row

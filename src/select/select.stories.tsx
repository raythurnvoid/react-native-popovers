import {
	Dialog as AriakitDialog,
	DialogProvider as AriakitDialogProvider,
	Select as AriakitSelect,
	SelectItem as AriakitSelectItem,
	SelectPopover as AriakitSelectPopover,
	SelectProvider as AriakitSelectProvider,
} from "@ariakit/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StrictMode, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
	Select,
	SelectGroup,
	SelectGroupLabel,
	SelectItem,
	SelectLabel,
	SelectList,
	SelectPopover,
	SelectProvider,
	SelectSearch,
	type SelectItemProps,
	type SelectPopoverProps,
	type SelectProviderProps,
} from "./select.tsx";
import { Tooltip, TooltipAnchor, TooltipProvider } from "../tooltip/tooltip.tsx";
import "./select.stories.css";

const meta = {
	title: "Select",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const MODES = ["Agent", "Ask", "Plan", "Review"];

/**
 * Shows each setValue call, so tests can check what was picked and that nothing was picked by itself.
 */
function useValueLog() {
	const [picks, setPicks] = useState<string[]>([]);
	const log = <output data-testid="picks">{picks.join(",")}</output>;

	return [log, (value: string | readonly string[]) => setPicks((items) => [...items, String(value)])] as const;
}

type Mode_Props = Omit<SelectProviderProps<string>, "children"> & {
	label?: string;
	popover?: Omit<SelectPopoverProps, "children">;
	children?: ReactNode;
};

/**
 * A labeled select with a value that the story owns, the shape most stories need.
 */
function ModeSelect(props: Mode_Props) {
	const { label = "Mode", popover, children, setValue, ...provider } = props;
	const [value, setOwnValue] = useState(provider.value ?? "Agent");

	return (
		<SelectProvider
			{...provider}
			value={value}
			setValue={(next: string) => {
				setValue?.(next);
				setOwnValue(next);
			}}
		>
			<SelectLabel className="story-label">{label}</SelectLabel>
			<Select className="story-trigger">{value || "Choose"}</Select>
			<SelectPopover className="story-Select" gutter={4} {...popover}>
				{children ??
					MODES.map((mode) => (
						<SelectItem key={mode} value={mode} disabled={mode === "Plan"} className="story-option">
							{mode}
						</SelectItem>
					))}
			</SelectPopover>
		</SelectProvider>
	);
}

// #region basics
export const Basic: Story = {
	render: function Render() {
		const [log, onPick] = useValueLog();

		return (
			<div className="story-row">
				{log}
				<button type="button">Before</button>
				<ModeSelect setValue={onPick} />
				<button type="button">After</button>
			</div>
		);
	},
};

export const Groups: Story = {
	render: () => (
		<div className="story-row">
			<ModeSelect label="Color" value="Blue">
				<SelectGroup>
					<SelectGroupLabel className="story-group-label">Text</SelectGroupLabel>
					<SelectItem value="Red" className="story-option">
						<span aria-hidden="true">A</span>Red
					</SelectItem>
					<SelectItem value="Blue" className="story-option">
						<span aria-hidden="true">A</span>Blue
					</SelectItem>
				</SelectGroup>
				<SelectGroup className="story-separator">
					<SelectGroupLabel className="story-group-label">Background</SelectGroupLabel>
					<SelectItem value="Purple" className="story-option">
						<span aria-hidden="true">A</span>Purple
					</SelectItem>
					<SelectItem value="Gray" disabled className="story-option">
						<span aria-hidden="true">A</span>Gray
					</SelectItem>
				</SelectGroup>
			</ModeSelect>
		</div>
	),
};

export const NoValue: Story = {
	render: function Render() {
		const [log, onPick] = useValueLog();

		return (
			<div className="story-row">
				{log}
				{/* A pinned empty value and an uncontrolled select: neither may pick the first option by itself. */}
				<ModeSelect label="Pinned" value="" setValue={onPick} />
				<SelectProvider setValue={onPick}>
					<SelectLabel className="story-label">Uncontrolled</SelectLabel>
					<Select className="story-trigger">Choose</Select>
					<SelectPopover className="story-Select" gutter={4}>
						{MODES.map((mode) => (
							<SelectItem key={mode} value={mode} className="story-option">
								{mode}
							</SelectItem>
						))}
					</SelectPopover>
				</SelectProvider>
			</div>
		);
	},
};

export const RemoveOption: Story = {
	render: function Render() {
		const [log, onPick] = useValueLog();
		const [modes, setModes] = useState<readonly string[]>(MODES);

		// Delete removes the active option without any typing, like a row that a live update takes away.
		const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
			if (event.key !== "Delete") return;
			const id = event.currentTarget.getAttribute("aria-activedescendant");
			const text = id ? document.getElementById(id)?.textContent : null;
			if (text) setModes((items) => items.filter((mode) => mode !== text));
		};

		return (
			<div className="story-row">
				{log}
				<ModeSelect label="Removable" value="" setValue={onPick} popover={{ onKeyDown: handleKeyDown }}>
					{modes.map((mode) => (
						<SelectItem key={mode} value={mode} className="story-option">
							{mode}
						</SelectItem>
					))}
				</ModeSelect>
			</div>
		);
	},
};

const LONG = Array.from({ length: 30 }, (_, index) => `Item ${String(index + 1).padStart(2, "0")}`);

export const LongList: Story = {
	render: () => (
		<div className="story-row">
			<ModeSelect label="Long" value="Item 01">
				{LONG.map((item) => (
					<SelectItem key={item} value={item} className="story-option">
						{item}
					</SelectItem>
				))}
			</ModeSelect>
		</div>
	),
};

export const Multiple: Story = {
	render: function Render() {
		const [value, setValue] = useState<readonly string[]>(["Red"]);
		const handleValue = (next: readonly string[]) => setValue(next);

		return (
			<div className="story-row">
				<output data-testid="value">{value.join(",")}</output>
				<SelectProvider value={value} setValue={handleValue}>
					<SelectLabel className="story-label">Colors</SelectLabel>
					<Select className="story-trigger">{value.join(", ") || "None"}</Select>
					<SelectPopover className="story-Select" gutter={4}>
						{["Red", "Green", "Blue"].map((color) => (
							<SelectItem key={color} value={color} className="story-option">
								{color}
							</SelectItem>
						))}
					</SelectPopover>
				</SelectProvider>
			</div>
		);
	},
};

export const NoAutoFocus: Story = {
	render: () => (
		<div className="story-row">
			<ModeSelect label="Keep focus" value="" popover={{ autoFocusOnShow: false }} />
		</div>
	),
};

export const TypeaheadOff: Story = {
	render: function Render() {
		const [log, onPick] = useValueLog();

		return (
			<div className="story-row">
				{log}
				<SelectProvider value="Agent" setValue={onPick}>
					<SelectLabel className="story-label">View</SelectLabel>
					<Select className="story-trigger" typeahead={false}>
						Agent
					</Select>
					<SelectPopover className="story-Select" gutter={4}>
						{MODES.map((mode) => (
							<SelectItem key={mode} value={mode} className="story-option">
								{mode}
							</SelectItem>
						))}
					</SelectPopover>
				</SelectProvider>
			</div>
		);
	},
};

export const SameWidth: Story = {
	render: () => (
		<div className="story-row">
			<ModeSelect label="Wide" popover={{ sameWidth: true, className: "story-Select story-Select-narrow" }} />
		</div>
	),
};

export const UnmountOnHide: Story = {
	render: function Render() {
		const [log, onPick] = useValueLog();

		return (
			<div className="story-row">
				{log}
				<ModeSelect label="Unmounted" setValue={onPick} popover={{ unmountOnHide: true }} />
			</div>
		);
	},
};
// #endregion basics

// #region search
const FRUITS = ["Apple", "Apricot", "Banana", "Blueberry", "Cherry", "Grape", "Lemon", "Mango"];

type FruitSearch_Props = {
	label: string;
	onPick: (value: string) => void;
	autoSelect?: boolean;
};

function FruitSearch(props: FruitSearch_Props) {
	const { label, onPick, autoSelect = true } = props;
	const [value, setValue] = useState("Banana");
	const [filter, setFilter] = useState("");
	const shown = FRUITS.filter((fruit) => fruit.toLowerCase().includes(filter.toLowerCase()));

	return (
		<SelectProvider
			value={value}
			setValue={(next: string) => {
				onPick(next);
				setValue(next);
			}}
			setOpen={(open) => {
				if (!open) setFilter("");
			}}
		>
			<Select className="story-trigger" aria-label={`${label}: ${value}`}>
				{value}
			</Select>
			<SelectPopover className="story-Select" gutter={4} aria-label={`${label} options`}>
				<SelectSearch
					className="story-search"
					aria-label={`Search ${label}`}
					autoSelect={autoSelect}
					onChange={(event) => setFilter(event.currentTarget.value)}
				/>
				{shown.length === 0 ? (
					<div className="story-empty">No results</div>
				) : (
					<SelectList aria-label={`${label} list`}>
						{shown.map((fruit) => (
							<SelectItem key={fruit} value={fruit} className="story-option">
								{fruit}
							</SelectItem>
						))}
					</SelectList>
				)}
			</SelectPopover>
		</SelectProvider>
	);
}

export const Search: Story = {
	render: function Render() {
		const [log, onPick] = useValueLog();
		const [submits, setSubmits] = useState(0);

		return (
			<div className="story-row">
				{log}
				<output data-testid="submits">{submits}</output>
				{/* The search input is the only text field in this form, so a plain Enter would submit it. */}
				<form
					onSubmit={(event) => {
						event.preventDefault();
						setSubmits((count) => count + 1);
					}}
				>
					<FruitSearch label="Fruit" onPick={onPick} />
				</form>
				<button type="button">After</button>
			</div>
		);
	},
};

type ThreadRow_CustomAttributes = {
	"data-thread-row-action": "";
};

type ThreadRow_Props = {
	value: string;
	starred: boolean;
	onStarredChange: (starred: boolean) => void;
};

/**
 * A row with a star button, like t3-chat's Past chats picker. The star is a Tab stop only on the
 * active row, and a click or a key on it does not pick the row.
 */
function ThreadRow(props: ThreadRow_Props) {
	const { value, starred, onStarredChange } = props;
	const isActive = SelectItem.useActive(value);
	const label = starred ? `Remove ${value} from favorites` : `Add ${value} to favorites`;

	const handleItemClickBehavior: NonNullable<SelectItemProps["setValueOnClick"]> = (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return true;
		return !target.closest(`[${"data-thread-row-action" satisfies keyof ThreadRow_CustomAttributes}]`);
	};

	return (
		<SelectItem
			value={value}
			className="story-option story-row-option"
			hideOnClick={handleItemClickBehavior}
			setValueOnClick={handleItemClickBehavior}
		>
			<span>{value}</span>
			<button
				type="button"
				{...({ "data-thread-row-action": "" } satisfies Partial<ThreadRow_CustomAttributes>)}
				tabIndex={isActive ? 0 : -1}
				aria-pressed={starred}
				aria-label={label}
				onMouseDown={(event: MouseEvent<HTMLButtonElement>) => {
					event.preventDefault();
					event.stopPropagation();
				}}
				// The click still reaches the option. Its setValueOnClick and hideOnClick rules above keep the
				// row unpicked and the list open.
				onClick={() => onStarredChange(!starred)}
			>
				★
			</button>
		</SelectItem>
	);
}

export const RowActions: Story = {
	render: function Render() {
		const [log, onPick] = useValueLog();
		const [value, setValue] = useState("Chat 2");
		const [starred, setStarred] = useState<string[]>([]);

		return (
			<div className="story-row">
				{log}
				<SelectProvider
					value={value}
					setValue={(next: string) => {
						onPick(next);
						setValue(next);
					}}
				>
					<Select className="story-trigger" aria-label="Past chats">
						{value}
					</Select>
					<SelectPopover className="story-Select" gutter={4} aria-label="Chats">
						<SelectSearch className="story-search" aria-label="Search chats" autoSelect />
						<SelectList aria-label="Chat list">
							{["Chat 1", "Chat 2", "Chat 3"].map((chat) => (
								<ThreadRow
									key={chat}
									value={chat}
									starred={starred.includes(chat)}
									onStarredChange={(next) =>
										setStarred((items) => (next ? [...items, chat] : items.filter((item) => item !== chat)))
									}
								/>
							))}
						</SelectList>
					</SelectPopover>
				</SelectProvider>
			</div>
		);
	},
};
// #endregion search

// #region controlled
export const Controlled: Story = {
	render: function Render() {
		const [requests, setRequests] = useState<string[]>([]);
		const [open, setOpen] = useState(false);
		const [refuseClose, setRefuseClose] = useState(false);

		return (
			<div className="story-row">
				<output data-testid="requests">{requests.join(",")}</output>
				<label>
					<input
						type="checkbox"
						checked={refuseClose}
						onChange={(event) => setRefuseClose(event.currentTarget.checked)}
					/>{" "}
					Refuse close
				</label>
				<ModeSelect
					open={open}
					setOpen={(next) => {
						setRequests((items) => [...items, next ? "open" : "closed"]);
						if (next || !refuseClose) setOpen(next);
					}}
				/>
				<button type="button">Outside</button>
			</div>
		);
	},
};

export const StrictToggle: Story = {
	render: () => (
		<StrictMode>
			<div className="story-row">
				<ModeSelect />
			</div>
		</StrictMode>
	),
};

export const StrictControlled: Story = {
	render: function Render() {
		const [open, setOpen] = useState(false);

		return (
			<StrictMode>
				<div className="story-row">
					<ModeSelect open={open} setOpen={setOpen} />
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
			<ModeSelect label="Source">
				{MODES.map((mode) => (
					<SelectItem key={mode} value={mode} className="story-option">
						<TooltipProvider placement="right">
							<TooltipAnchor focusable={false} render={<span>{mode}</span>} />
							<Tooltip className="story-Tooltip">{`${mode}: the full text`}</Tooltip>
						</TooltipProvider>
					</SelectItem>
				))}
			</ModeSelect>
		</div>
	),
};

export const DialogFromItem: Story = {
	render: function Render() {
		const dialog = useRef<HTMLDialogElement | null>(null);

		return (
			<div className="story-row">
				<ModeSelect label="Action">
					<SelectItem value="Agent" className="story-option">
						Agent
					</SelectItem>
					<SelectItem value="Settings" className="story-option" onClick={() => dialog.current?.showModal()}>
						Settings
					</SelectItem>
				</ModeSelect>
				<dialog ref={dialog} aria-label="Settings dialog" className="story-dialog">
					<button type="button" onClick={() => dialog.current?.close()}>
						Close dialog
					</button>
				</dialog>
			</div>
		);
	},
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
					<ModeSelect />
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
					{/* Centered with a transform, like t3-chat's MyModal. */}
					<AriakitDialog aria-label="Settings" className="story-transformed-dialog" portal>
						<ModeSelect />
					</AriakitDialog>
				</AriakitDialogProvider>
			</div>
		);
	},
};
// #endregion layers

// #region placement
export const AnchorRect: Story = {
	render: function Render() {
		const [log, onPick] = useValueLog();
		const [open, setOpen] = useState(true);

		return (
			<div>
				{log}
				<button type="button" onClick={() => setOpen(true)}>
					Reopen
				</button>
				{open ? (
					<SelectProvider open value="" setOpen={setOpen} setValue={onPick}>
						{/* unmountOnHide: with no trigger, the list must still find a document for its anchor. */}
						<SelectPopover
							className="story-Select"
							aria-label="Caret picker"
							anchorRect={{ x: 300, y: 200, width: 2, height: 18 }}
							unmountOnHide
						>
							<SelectSearch className="story-search" aria-label="Search files" autoSelect />
							<SelectList aria-label="Files">
								{["image.png", "video.mp4"].map((file) => (
									<SelectItem key={file} value={file} className="story-option">
										{file}
									</SelectItem>
								))}
							</SelectList>
						</SelectPopover>
					</SelectProvider>
				) : null}
			</div>
		);
	},
};

const PARITY_PLACEMENTS = ["bottom-start", "top-start", "bottom-end", "top-end"] as const;

export const AriakitParity: Story = {
	render: () => (
		// Each cell sits on whole pixels, so both boxes round the same way.
		<div className="story-parity">
			{PARITY_PLACEMENTS.flatMap((placement) =>
				[false, true].map((sameWidth) => (
					<div key={`${placement}-${sameWidth}`} className="story-parity-cell" data-cell={`${placement}-${sameWidth}`}>
						<SelectProvider open value="Ask" placement={placement}>
							<Select className="story-parity-trigger" data-kind="native">
								N
							</Select>
							<SelectPopover
								className="story-Select"
								gutter={4}
								sameWidth={sameWidth}
								autoFocusOnShow={false}
								data-kind="native"
								data-cell={`${placement}-${sameWidth}`}
							>
								<SelectItem value="Ask" className="story-option">
									{placement}
								</SelectItem>
							</SelectPopover>
						</SelectProvider>
						<AriakitSelectProvider open value="Ask" placement={placement}>
							<AriakitSelect className="story-parity-trigger" data-kind="ariakit">
								A
							</AriakitSelect>
							<AriakitSelectPopover
								className="story-Select"
								gutter={4}
								sameWidth={sameWidth}
								portal
								autoFocusOnShow={false}
								data-kind="ariakit"
								data-cell={`${placement}-${sameWidth}`}
							>
								<AriakitSelectItem value="Ask" className="story-option">
									{placement}
								</AriakitSelectItem>
							</AriakitSelectPopover>
						</AriakitSelectProvider>
					</div>
				)),
			)}
		</div>
	),
};

export const Flips: Story = {
	parameters: { layout: "fullscreen" },
	render: () => (
		<div className="story-corner" style={{ bottom: 4, left: 200 }}>
			<ModeSelect label="Bottom edge" open />
		</div>
	),
};
// #endregion placement

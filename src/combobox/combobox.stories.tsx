import {
	Combobox as AriakitCombobox,
	ComboboxItem as AriakitComboboxItem,
	ComboboxPopover as AriakitComboboxPopover,
	ComboboxProvider as AriakitComboboxProvider,
	Dialog as AriakitDialog,
	DialogProvider as AriakitDialogProvider,
} from "@ariakit/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StrictMode, useRef, useState, type KeyboardEvent } from "react";
import {
	Combobox,
	ComboboxCancel,
	ComboboxGroup,
	ComboboxGroupLabel,
	ComboboxItem,
	ComboboxLabel,
	ComboboxList,
	ComboboxPopover,
	ComboboxProvider,
	type ComboboxProviderProps,
} from "./combobox.tsx";
import "./combobox.stories.css";

const meta = {
	title: "Combobox",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const FRUITS = ["Apple", "Apricot", "Banana", "Blueberry", "Cherry", "Grape", "Lemon", "Mango"];

type Fruit_Props = Omit<ComboboxProviderProps, "children"> & {
	label?: string;
	cancel?: boolean;
};

/**
 * A labeled combobox whose text the story owns, and a list the story filters.
 */
function FruitCombobox(props: Fruit_Props) {
	const { label = "Fruit", cancel = false, ...provider } = props;
	const [text, setText] = useState("");
	const shown = FRUITS.filter((fruit) => fruit.toLowerCase().includes(text.toLowerCase()));

	return (
		<ComboboxProvider value={text} setValue={setText} {...provider}>
			<ComboboxLabel className="story-label">{label}</ComboboxLabel>
			<span className="story-input-row">
				<Combobox className="story-input" />
				{cancel ? <ComboboxCancel className="story-cancel">×</ComboboxCancel> : null}
			</span>
			<ComboboxPopover className="story-Combobox" gutter={4} aria-label={`${label} suggestions`}>
				{shown.map((fruit) => (
					<ComboboxItem key={fruit} value={fruit} className="story-option" disabled={fruit === "Cherry"}>
						{fruit}
					</ComboboxItem>
				))}
			</ComboboxPopover>
			<output data-testid="text">{text}</output>
		</ComboboxProvider>
	);
}

// #region basics
export const Basic: Story = {
	render: () => (
		<div className="story-row">
			<button type="button">Before</button>
			<FruitCombobox />
			<button type="button">After</button>
		</div>
	),
};

export const Cancel: Story = {
	render: () => (
		<div className="story-row">
			<FruitCombobox cancel />
		</div>
	),
};

export const StrictTyping: Story = {
	render: () => (
		<StrictMode>
			<div className="story-row">
				<FruitCombobox />
			</div>
		</StrictMode>
	),
};

export const Inline: Story = {
	render: function Render() {
		const [text, setText] = useState("");
		const [picked, setPicked] = useState("");
		const actions = ["Improve writing", "Fix spelling", "Make shorter", "Continue writing"];
		const shown = actions.filter((action) => action.toLowerCase().includes(text.toLowerCase()));

		return (
			<div className="story-column">
				<output data-testid="picked">{picked}</output>
				{/* Like t3-chat's inline AI list: no popover, the list is always shown under the input. */}
				<ComboboxProvider open value={text} setValue={setText}>
					<Combobox className="story-input" aria-label="Ask AI" autoSelect={false} />
					<ComboboxList className="story-inline-list" aria-label="AI actions">
						<ComboboxGroup>
							<ComboboxGroupLabel className="story-group-label">Edit selection</ComboboxGroupLabel>
							{shown.map((action) => (
								<ComboboxItem
									key={action}
									value={action}
									className="story-option"
									hideOnClick={false}
									setValueOnClick={false}
									onClick={() => setPicked(action)}
								>
									{action}
								</ComboboxItem>
							))}
						</ComboboxGroup>
					</ComboboxList>
				</ComboboxProvider>
			</div>
		);
	},
};
// #endregion basics

// #region app like
export const AppLike: Story = {
	render: function Render() {
		const [text, setText] = useState("");
		const [open, setOpen] = useState(false);
		const [log, setLog] = useState<string[]>([]);
		const keys = ["file.path", "file.name", "status", "priority"];
		// Like the app, a picked key leaves `key:` in the text, and the list then shows values for that key.
		const pickedKey = text.includes(":") ? text.slice(0, text.indexOf(":")) : null;
		const shown =
			pickedKey === null
				? keys.filter((key) => key.includes(text))
				: ["high", "low"].map((value) => `${pickedKey}:${value}`).filter((value) => value.startsWith(text));

		// Like t3-chat's files search: Enter on an active suggestion is used by the combobox first, and
		// the caller's own Enter commits the text when no suggestion took it.
		const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
			if (event.defaultPrevented) return;
			if (event.key === " " && event.ctrlKey) {
				event.preventDefault();
				setOpen(true);
			}
			if (event.key === "Enter") setLog((items) => [...items, `submit ${text}`]);
		};

		return (
			<div className="story-row">
				<output data-testid="log">{log.join(",")}</output>
				<ComboboxProvider value={text} setValue={setText} open={open} setOpen={setOpen}>
					<Combobox
						className="story-input"
						aria-label="Search files"
						showOnChange={false}
						showOnClick={false}
						showOnKeyPress={false}
						onFocus={() => setOpen(true)}
						onKeyDown={handleKeyDown}
					/>
					<button
						type="button"
						aria-label="Add search filter"
						aria-controls="app-like-suggestions"
						onClick={() => setOpen(true)}
					>
						+
					</button>
					<ComboboxPopover id="app-like-suggestions" className="story-Combobox" gutter={4} aria-label="Search filters">
						<ComboboxList aria-label="Search suggestions">
							{shown.map((key) => (
								<ComboboxItem
									key={key}
									value={key}
									className="story-option"
									hideOnClick={false}
									setValueOnClick={false}
									onClick={() => setText(`${key}:`)}
								>
									{key}
								</ComboboxItem>
							))}
						</ComboboxList>
						<details className="story-details">
							<summary>Filter syntax</summary>
							key:value
						</details>
					</ComboboxPopover>
				</ComboboxProvider>
				<button type="button">After</button>
			</div>
		);
	},
};

export const InForm: Story = {
	render: function Render() {
		const [submits, setSubmits] = useState(0);

		return (
			<div className="story-row">
				<output data-testid="submits">{submits}</output>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						setSubmits((count) => count + 1);
					}}
				>
					<FruitCombobox />
				</form>
			</div>
		);
	},
};
// #endregion app like

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
				<FruitCombobox
					open={open}
					setOpen={(next) => {
						setRequests((items) => [...items, next ? "open" : "closed"]);
						if (next || !refuseClose) setOpen(next);
					}}
				/>
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
					<FruitCombobox open={open} setOpen={setOpen} />
				</div>
			</StrictMode>
		);
	},
};
// #endregion controlled

// #region layers
export const InDialog: Story = {
	render: function Render() {
		const dialog = useRef<HTMLDialogElement | null>(null);

		return (
			<div>
				<button type="button" onClick={() => dialog.current?.showModal()}>
					Open dialog
				</button>
				<dialog ref={dialog} aria-label="Search dialog" className="story-dialog">
					<FruitCombobox />
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
					<AriakitDialog aria-label="Search dialog" className="story-dialog" portal>
						<FruitCombobox />
					</AriakitDialog>
				</AriakitDialogProvider>
			</div>
		);
	},
};
// #endregion layers

// #region placement
export const ScrollContainer: Story = {
	render: () => (
		<div className="story-scroller" data-testid="scroller">
			<div className="story-scroller-spacer" />
			<FruitCombobox />
			<div className="story-scroller-spacer" />
		</div>
	),
};

const PARITY_PLACEMENTS = ["bottom-start", "top-start", "bottom-end"] as const;

export const AriakitParity: Story = {
	render: () => (
		// Each cell sits on whole pixels, so both boxes round the same way.
		<div className="story-parity">
			{PARITY_PLACEMENTS.map((placement) => (
				<div key={placement} className="story-parity-cell" data-cell={placement}>
					<ComboboxProvider open placement={placement}>
						<Combobox className="story-parity-input" data-kind="native" aria-label={`native ${placement}`} />
						<ComboboxPopover className="story-Combobox" gutter={4} data-kind="native" data-cell={placement}>
							<ComboboxItem value={placement} className="story-option">
								{placement}
							</ComboboxItem>
						</ComboboxPopover>
					</ComboboxProvider>
					<AriakitComboboxProvider open placement={placement}>
						<AriakitCombobox className="story-parity-input" data-kind="ariakit" aria-label={`ariakit ${placement}`} />
						<AriakitComboboxPopover
							className="story-Combobox"
							gutter={4}
							portal
							data-kind="ariakit"
							data-cell={placement}
						>
							<AriakitComboboxItem value={placement} className="story-option">
								{placement}
							</AriakitComboboxItem>
						</AriakitComboboxPopover>
					</AriakitComboboxProvider>
				</div>
			))}
		</div>
	),
};
// #endregion placement

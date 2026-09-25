import {
	Dialog as AriakitDialog,
	DialogProvider as AriakitDialogProvider,
	Menu as AriakitMenu,
	MenuButton as AriakitMenuButton,
	MenuItem as AriakitMenuItem,
	MenuProvider as AriakitMenuProvider,
} from "@ariakit/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StrictMode, useEffect, useRef, useState, type HTMLAttributes, type ReactNode, type Ref } from "react";
import {
	ContextMenuTrigger,
	Menu,
	MenuButton,
	MenuGroup,
	MenuGroupLabel,
	MenuItem,
	MenuItemCheckbox,
	MenuProvider,
	type MenuProps,
	type MenuProviderProps,
} from "./menu.tsx";
import { Tooltip, TooltipAnchor, TooltipProvider } from "../tooltip/tooltip.tsx";
import { PLACEMENTS, type Placement } from "../layer/placement.ts";
import "./menu.stories.css";

const meta = {
	title: "Menu",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Shows the last clicked item and each setOpen call, so tests can read what happened.
 */
function useLog() {
	const [entries, setEntries] = useState<string[]>([]);
	const log = (
		<output className="story-log" data-testid="log">
			{entries.join(",")}
		</output>
	);

	return [log, (entry: string) => setEntries((items) => [...items, entry])] as const;
}

type Drop_Props = Omit<MenuProviderProps, "children"> &
	Pick<MenuProps, "gutter" | "shift" | "unmountOnHide"> & {
		label: string;
		children: ReactNode;
	};

/**
 * One button with one menu, the shape most stories need.
 */
function Drop(props: Drop_Props) {
	const { label, children, gutter, shift, unmountOnHide, ...provider } = props;

	return (
		<MenuProvider {...provider}>
			<MenuButton>{label}</MenuButton>
			<Menu className="story-Menu" gutter={gutter} shift={shift} unmountOnHide={unmountOnHide}>
				{children}
			</Menu>
		</MenuProvider>
	);
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
	render: function Render() {
		const [log, add] = useLog();

		// Like t3-chat's files sidebar menu: a disabled item in the middle, and words with the same initial.
		return (
			<div className="story-row">
				{log}
				<input aria-label="Before input" />
				<Drop label="Actions" setOpen={(open) => add(open ? "open" : "closed")}>
					<MenuItem className="story-MenuItem" onClick={() => add("Upload file")}>
						Upload file
					</MenuItem>
					<MenuItem className="story-MenuItem" onClick={() => add("Cut")}>
						Cut
					</MenuItem>
					<MenuItem className="story-MenuItem" onClick={() => add("Copy")}>
						Copy
					</MenuItem>
					<MenuItem className="story-MenuItem" disabled onClick={() => add("Paste")}>
						Paste into root folder
					</MenuItem>
					<MenuItem className="story-MenuItem" onClick={() => add("Éclair")}>
						Éclair recipe
					</MenuItem>
					<MenuItem className="story-MenuItem" hideOnClick={false} onClick={() => add("Keep open")}>
						Keep open
					</MenuItem>
					<MenuItem className="story-MenuItem" onClick={() => add("Show archived")}>
						Show archived items
					</MenuItem>
				</Drop>
				<button type="button">After</button>
			</div>
		);
	},
};

export const LongList: Story = {
	render: () => (
		<div className="story-row">
			<Drop label="Colors">
				{/* Like MyMenuPopoverScrollableArea. tabIndex -1 keeps the scroller out of the Tab order. */}
				<div className="story-scroll" tabIndex={-1}>
					{Array.from({ length: 30 }, (_, index) => (
						<MenuItem key={index} className="story-MenuItem">
							Color {index + 1}
						</MenuItem>
					))}
				</div>
			</Drop>
			<button type="button">After</button>
		</div>
	),
};

export const Checkbox: Story = {
	render: function Render() {
		const [checked, setChecked] = useState(false);

		return (
			<div className="story-row">
				<Drop label="More options">
					<MenuItem className="story-MenuItem">Collapse all</MenuItem>
					<MenuItemCheckbox className="story-MenuItem" checked={checked} onClick={() => setChecked((value) => !value)}>
						<span aria-hidden="true">{checked ? "☑" : "☐"}</span> Show archived items
					</MenuItemCheckbox>
				</Drop>
				<button type="button">After</button>
			</div>
		);
	},
};

export const Groups: Story = {
	render: () => (
		<Drop label="Block">
			<MenuGroupLabel className="story-MenuLabel">Actions</MenuGroupLabel>
			<MenuGroup className="story-MenuGroup">
				<MenuGroupLabel className="story-MenuLabel">Edit</MenuGroupLabel>
				<MenuItem className="story-MenuItem">Duplicate</MenuItem>
				<MenuItem className="story-MenuItem">Copy link</MenuItem>
			</MenuGroup>
			<MenuGroup className="story-MenuGroup">
				<MenuItem className="story-MenuItem">Delete</MenuItem>
			</MenuGroup>
		</Drop>
	),
};

type StoryLink_Props = HTMLAttributes<HTMLAnchorElement> & {
	ref?: Ref<HTMLAnchorElement>;
	href: string;
	disabled?: boolean;
};

/**
 * A link that changes its role when it gets `disabled`, like TanStack Router's Link. The menu item
 * must not forward `disabled` to it.
 */
function StoryLink(props: StoryLink_Props) {
	const { disabled, ...rest } = props;

	return <a {...rest} {...(disabled ? { role: "link", "aria-disabled": true } : {})} />;
}

export const LinkItem: Story = {
	render: () => (
		<Drop label="Chat">
			<MenuItem className="story-MenuItem" render={<StoryLink href="#linked" />}>
				Open chat
			</MenuItem>
			<MenuItem className="story-MenuItem" disabled render={<StoryLink href="#disabled" />}>
				Open archived chat
			</MenuItem>
			<MenuItem className="story-MenuItem">Rename</MenuItem>
		</Drop>
	),
};

export const DisabledTrigger: Story = {
	render: () => (
		<div className="story-row">
			<MenuProvider>
				<MenuButton render={<button type="button" disabled />}>More actions</MenuButton>
				<Menu className="story-Menu">
					<MenuItem className="story-MenuItem">Archive</MenuItem>
				</Menu>
			</MenuProvider>
			<button type="button">After</button>
		</div>
	),
};

export const TextField: Story = {
	render: () => (
		<div className="story-row">
			<Drop label="Filter">
				<input aria-label="Filter text" />
				<label>
					<input type="checkbox" /> Match case
				</label>
				<MenuItem className="story-MenuItem">Apple</MenuItem>
				<MenuItem className="story-MenuItem">Banana</MenuItem>
				<MenuProvider>
					<MenuButton render={<MenuItem className="story-MenuItem" />}>More ›</MenuButton>
					<Menu className="story-Menu">
						<MenuItem className="story-MenuItem">Cherry</MenuItem>
					</Menu>
				</MenuProvider>
			</Drop>
			{/* Like a menu in an editor node view: the menu renders inside the editable root. */}
			<div contentEditable suppressContentEditableWarning aria-label="Editor">
				<p>Text before the node</p>
				<div contentEditable={false}>
					<Drop label="Node">
						<MenuItem className="story-MenuItem">Delete node</MenuItem>
						<MenuItem className="story-MenuItem">Duplicate node</MenuItem>
					</Drop>
				</div>
			</div>
		</div>
	),
};

export const ReplacedButton: Story = {
	render: function Render() {
		const [version, setVersion] = useState(0);

		// The key gives the button a new DOM element on each click of the item.
		return (
			<div className="story-row">
				<MenuProvider>
					<MenuButton key={version}>{`Button ${version}`}</MenuButton>
					<Menu className="story-Menu">
						<MenuItem className="story-MenuItem" hideOnClick={false} onClick={() => setVersion((value) => value + 1)}>
							Replace button
						</MenuItem>
					</Menu>
				</MenuProvider>
				{/* A menu with its own label keeps it. The button name does not replace it. */}
				<span id="story-own-label">Recent files</span>
				<MenuProvider>
					<MenuButton>Recent</MenuButton>
					<Menu className="story-Menu" aria-labelledby="story-own-label">
						<MenuItem className="story-MenuItem">notes.md</MenuItem>
					</Menu>
				</MenuProvider>
				{/* A wrapper that passes `id={undefined}`, like the t3-chat `MyMenuTrigger`, still names the menu. */}
				<MenuProvider>
					<MenuButton id={undefined}>Wrapped</MenuButton>
					<Menu className="story-Menu">
						<MenuItem className="story-MenuItem">todo.md</MenuItem>
					</Menu>
				</MenuProvider>
			</div>
		);
	},
};
// #endregion basics

// #region controlled
export const StrictControlled: Story = {
	render: function Render() {
		const [log, add] = useLog();
		const [open, setOpen] = useState(false);
		const [sticky, setSticky] = useState(false);

		return (
			<StrictMode>
				<div className="story-row">
					{log}
					<MenuProvider
						open={open}
						setOpen={(value) => {
							add(value ? "open" : "closed");
							setOpen(value);
						}}
					>
						<MenuButton>Jobs</MenuButton>
						<Menu className="story-Menu" unmountOnHide>
							<MenuItem className="story-MenuItem">Retry</MenuItem>
							<MenuItem className="story-MenuItem">Cancel</MenuItem>
						</Menu>
					</MenuProvider>
					{/* A parent that refuses every change: setOpen runs, and the menu stays closed. */}
					<MenuProvider open={false} setOpen={(value) => add(value ? "asked open" : "asked closed")}>
						<MenuButton>Locked</MenuButton>
						<Menu className="story-Menu">
							<MenuItem className="story-MenuItem">Never shown</MenuItem>
						</Menu>
					</MenuProvider>
					{/* A parent that accepts an open and refuses every close. */}
					<MenuProvider
						open={sticky}
						setOpen={(value) => {
							add(value ? "sticky open" : "sticky asked closed");
							if (value) setSticky(true);
						}}
					>
						<MenuButton>Sticky</MenuButton>
						<Menu className="story-Menu">
							<MenuItem className="story-MenuItem">Stay</MenuItem>
						</Menu>
					</MenuProvider>
					<button type="button" onClick={() => setOpen((value) => !value)}>
						Toggle from outside
					</button>
				</div>
			</StrictMode>
		);
	},
};
// #endregion controlled

// #region submenus
const TURN_INTO = ["Text", "Heading 1", "Heading 2", "Heading 3", "Bullet list", "Numbered list", "To-do list"];
const COLORS = ["Default", "Gray", "Brown", "Orange", "Yellow", "Green", "Blue", "Purple"];

type BlockMenu_Props = {
	onSelect: (entry: string) => void;
};

/**
 * Like t3-chat's rich text drag handle menu: a contained, scrolling root with two submenus (gutter 8,
 * shift -5), items that keep the menu open, and a third level.
 */
function BlockMenu(props: BlockMenu_Props) {
	const { onSelect } = props;

	return (
		<MenuProvider placement="right-start">
			<MenuButton>Block menu</MenuButton>
			<Menu className="story-Menu story-Menu-contained">
				<div className="story-scroll" tabIndex={-1}>
					<MenuItem className="story-MenuItem" onClick={() => onSelect("Delete")}>
						Delete
					</MenuItem>
					<MenuItem className="story-MenuItem" onClick={() => onSelect("Duplicate")}>
						Duplicate node
					</MenuItem>
					<MenuProvider>
						<MenuButton render={<MenuItem className="story-MenuItem" />}>Turn into ›</MenuButton>
						<Menu className="story-Menu story-Menu-contained" gutter={8} shift={-5}>
							<div className="story-scroll" tabIndex={-1}>
								{TURN_INTO.map((name) => (
									<MenuItem key={name} className="story-MenuItem" hideOnClick={false} onClick={() => onSelect(name)}>
										{name}
									</MenuItem>
								))}
							</div>
						</Menu>
					</MenuProvider>
					<MenuProvider>
						<MenuButton render={<MenuItem className="story-MenuItem" />}>Color ›</MenuButton>
						<Menu className="story-Menu" gutter={8} shift={-5}>
							{COLORS.map((name) => (
								<MenuItem key={name} className="story-MenuItem" hideOnClick={false} onClick={() => onSelect(name)}>
									{name}
								</MenuItem>
							))}
							<MenuProvider>
								<MenuButton render={<MenuItem className="story-MenuItem" />}>More ›</MenuButton>
								<Menu className="story-Menu" gutter={8} shift={-5}>
									<MenuItem className="story-MenuItem" onClick={() => onSelect("Custom")}>
										Custom color
									</MenuItem>
									<MenuItem className="story-MenuItem" onClick={() => onSelect("Reset")}>
										Reset color
									</MenuItem>
								</Menu>
							</MenuProvider>
						</Menu>
					</MenuProvider>
					<MenuItem className="story-MenuItem" onClick={() => onSelect("Copy link")}>
						Copy link
					</MenuItem>
					<MenuItem className="story-MenuItem" onClick={() => onSelect("Move up")}>
						Move up
					</MenuItem>
					<MenuItem className="story-MenuItem" onClick={() => onSelect("Move down")}>
						Move down
					</MenuItem>
				</div>
			</Menu>
		</MenuProvider>
	);
}

// The top-left layout leaves room below, so every submenu opens down and to the right.
export const Submenu: Story = {
	parameters: { layout: "padded" },
	render: function Render() {
		const [log, add] = useLog();

		return (
			<>
				<div className="story-row">
					{log}
					<BlockMenu onSelect={add} />
				</div>
				<input className="story-corner" style={{ left: 16, bottom: 16 }} aria-label="Outside input" />
			</>
		);
	},
};

// Centered: the "Color" submenu does not fit below its item, so the browser flips it up.
export const SubmenuFlipped: Story = {
	render: function Render() {
		const [log, add] = useLog();

		return (
			<div className="story-row">
				{log}
				<BlockMenu onSelect={add} />
			</div>
		);
	},
};

export const SubmenuRtl: Story = {
	parameters: { layout: "padded" },
	render: function Render() {
		const [log, add] = useLog();

		return (
			<div className="story-row story-row-rtl" dir="rtl">
				{log}
				<BlockMenu onSelect={add} />
			</div>
		);
	},
};

// Like a menu fed by live data: an item of the open submenu removes the whole submenu.
export const RemovedSubmenu: Story = {
	render: function Render() {
		const [canShare, setCanShare] = useState(true);

		return (
			<Drop label="File">
				<MenuItem className="story-MenuItem">Rename</MenuItem>
				{canShare && (
					<MenuProvider>
						<MenuButton render={<MenuItem className="story-MenuItem" />}>Share ›</MenuButton>
						<Menu className="story-Menu">
							<MenuItem className="story-MenuItem">Email</MenuItem>
							<MenuItem className="story-MenuItem" hideOnClick={false} onClick={() => setCanShare(false)}>
								Stop sharing
							</MenuItem>
						</Menu>
					</MenuProvider>
				)}
				<MenuItem className="story-MenuItem">Delete</MenuItem>
			</Drop>
		);
	},
};
// #endregion submenus

// #region context menu
const ROWS = ["alpha", "bravo", "charlie", "delta"];

type Row_Props = {
	name: string;
	onSelect: (entry: string) => void;
};

/**
 * One tree row with its own context menu and a ⋮ button in the same provider, like t3-chat's files sidebar.
 */
function Row(props: Row_Props) {
	const { name, onSelect } = props;

	return (
		<MenuProvider setOpen={(open) => onSelect(`${name} ${open ? "open" : "closed"}`)}>
			<ContextMenuTrigger render={<div className="story-tree-row" role="treeitem" tabIndex={0} aria-label={name} />}>
				<span>{name}</span>
				{/* A Tab stop inside the row, like the row buttons in t3-chat. */}
				<MenuButton render={<button type="button" className="story-more" />}>⋮</MenuButton>
			</ContextMenuTrigger>
			<Menu className="story-Menu" aria-label={`Actions for ${name}`}>
				<MenuItem className="story-MenuItem" onClick={() => onSelect(`Rename ${name}`)}>
					Rename
				</MenuItem>
				<MenuItem className="story-MenuItem" onClick={() => onSelect(`Copy ${name}`)}>
					Copy
				</MenuItem>
				<MenuItem className="story-MenuItem" disabled>
					Paste
				</MenuItem>
				<MenuItem className="story-MenuItem" onClick={() => onSelect(`Archive ${name}`)}>
					Archive
				</MenuItem>
			</Menu>
		</MenuProvider>
	);
}

export const ContextMenu: Story = {
	parameters: { layout: "fullscreen" },
	render: function Render() {
		const [log, add] = useLog();

		return (
			<>
				{log}
				<div className="story-tree" role="tree" aria-label="Files">
					{ROWS.map((name) => (
						<Row key={name} name={name} onSelect={add} />
					))}
				</div>
				{/* Like a virtualized list: a transformed container must not move the menu. */}
				<div className="story-tree story-tree-transformed" role="tree" aria-label="Moved files">
					<Row name="echo" onSelect={add} />
				</div>
				<div className="story-corner" style={{ right: 4, bottom: 4 }}>
					<div className="story-tree" role="tree" aria-label="Corner files">
						<Row name="zulu" onSelect={add} />
					</div>
				</div>
				{/* Like t3-chat's agent chat tabs: no button and no menu label, so the tab's id names the menu. */}
				<div role="tablist" aria-label="Chats">
					<MenuProvider>
						<ContextMenuTrigger
							render={
								<div className="story-tree-row" role="tab" id="story-tab-notes" tabIndex={0} aria-label="notes.md" />
							}
						>
							<span>notes.md</span>
						</ContextMenuTrigger>
						{/* A second trigger with no id, in the same provider: the menu must not keep the name notes.md. */}
						<ContextMenuTrigger
							render={<div className="story-tree-row" role="tab" tabIndex={0} aria-label="todo.md" />}
						>
							<span>todo.md</span>
						</ContextMenuTrigger>
						<Menu className="story-Menu">
							<MenuItem className="story-MenuItem" onClick={() => add("Close tab")}>
								Close
							</MenuItem>
						</Menu>
					</MenuProvider>
				</div>
				{/* A row with an id around a button of the same provider. A right click while the menu is open renames it. */}
				<MenuProvider>
					<ContextMenuTrigger render={<div className="story-tree-row" id="story-row-report" aria-label="report.md" />}>
						<span>report.md</span>
						<MenuButton render={<button type="button" className="story-more" />}>Report actions</MenuButton>
					</ContextMenuTrigger>
					<Menu className="story-Menu">
						<MenuItem className="story-MenuItem" onClick={() => add("Open report.md")}>
							Open
						</MenuItem>
					</Menu>
				</MenuProvider>
				<input className="story-outside" aria-label="Outside input" />
			</>
		);
	},
};
// #endregion context menu

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
						<Drop key={placement} label={placement} placement={placement} open={all || undefined}>
							<MenuItem className="story-MenuItem">{placement}</MenuItem>
						</Drop>
					))}
				</div>
			</div>
		);
	},
};

/**
 * The placements and offsets the t3-chat menus use.
 */
const PARITY: Array<{ placement: Placement; gutter: number; shift: number }> = [
	{ placement: "bottom-start", gutter: 0, shift: 0 },
	{ placement: "bottom-end", gutter: 0, shift: 0 },
	{ placement: "top-start", gutter: 6, shift: 0 },
	{ placement: "right-start", gutter: 0, shift: 0 },
	{ placement: "right-start", gutter: 8, shift: -5 },
];

export const AriakitParity: Story = {
	render: () => (
		// Each cell sits on whole pixels, so both boxes round the same way.
		<div className="story-parity">
			{PARITY.map(({ placement, gutter, shift }) => (
				<div key={`${placement}-${gutter}`} className="story-parity-cell" data-placement={`${placement}-${gutter}`}>
					<MenuProvider open placement={placement}>
						<MenuButton className="story-parity-trigger" data-kind="native">
							N
						</MenuButton>
						<Menu className="story-Menu" gutter={gutter} shift={shift} data-kind="native">
							<MenuItem className="story-MenuItem">{`${placement}, gutter ${gutter}: a long item sets the width`}</MenuItem>
						</Menu>
					</MenuProvider>
					<AriakitMenuProvider open placement={placement}>
						<AriakitMenuButton className="story-parity-trigger" data-kind="ariakit">
							A
						</AriakitMenuButton>
						<AriakitMenu
							className="story-Menu"
							gutter={gutter}
							shift={shift}
							portal
							autoFocusOnShow={false}
							data-kind="ariakit"
						>
							<AriakitMenuItem className="story-MenuItem">{`${placement}, gutter ${gutter}: a long item sets the width`}</AriakitMenuItem>
						</AriakitMenu>
					</AriakitMenuProvider>
				</div>
			))}
		</div>
	),
};
// #endregion placement

// #region layers
export const TooltipOnItem: Story = {
	render: () => (
		<div className="story-row">
			<MenuProvider>
				<MenuButton render={<TipButton tip="More actions" />}>⋮</MenuButton>
				<Menu className="story-Menu">
					<TooltipProvider placement="right" timeout={0}>
						<TooltipAnchor render={<MenuItem className="story-MenuItem" />}>Archive</TooltipAnchor>
						<Tooltip className="story-Tooltip">Moves the file to the archive</Tooltip>
					</TooltipProvider>
					<MenuItem className="story-MenuItem">Rename</MenuItem>
				</Menu>
			</MenuProvider>
			<button type="button">After</button>
		</div>
	),
};

export const ItemOpensDialog: Story = {
	render: function Render() {
		const dialog = useRef<HTMLDialogElement>(null);
		const [nativeOpen, setNativeOpen] = useState(false);
		const [ariakitOpen, setAriakitOpen] = useState(false);

		// Open the native dialog after the menu closed and focus went back to the button, like the app
		// opens its dialogs through state. The dialog then returns focus to the button when it closes.
		useEffect(() => {
			if (nativeOpen) dialog.current?.showModal();
		}, [nativeOpen]);

		return (
			<div className="story-row">
				<Drop label="File">
					<MenuItem className="story-MenuItem" onClick={() => setNativeOpen(true)}>
						Rename…
					</MenuItem>
					<MenuItem className="story-MenuItem" onClick={() => setAriakitOpen(true)}>
						Archive…
					</MenuItem>
				</Drop>
				<dialog ref={dialog} aria-label="Rename" onClose={() => setNativeOpen(false)}>
					<input aria-label="New name" />
					<button type="button" onClick={() => dialog.current?.close()}>
						Close
					</button>
				</dialog>
				{/* Rendered outside the menu, like t3-chat modals that a provider owns. */}
				<AriakitDialogProvider open={ariakitOpen} setOpen={setAriakitOpen}>
					<AriakitDialog className="story-dialog" aria-label="Archive">
						<button type="button" onClick={() => setAriakitOpen(false)}>
							Confirm
						</button>
					</AriakitDialog>
				</AriakitDialogProvider>
			</div>
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
					<p>Escape closes the menu first, then the dialog.</p>
					<Drop label="Options">
						<MenuItem className="story-MenuItem">Option</MenuItem>
					</Drop>
				</dialog>
			</>
		);
	},
};

export const InAriakitDialog: Story = {
	render: function Render() {
		const [open, setOpen] = useState(false);

		// Like t3-chat's organization switcher: a row menu inside an Ariakit modal.
		return (
			<>
				<button type="button" onClick={() => setOpen(true)}>
					Open dialog
				</button>
				<AriakitDialogProvider open={open} setOpen={setOpen}>
					<AriakitDialog className="story-dialog" aria-label="Organizations">
						<p>Escape closes the menu first, then the dialog.</p>
						<Drop label="Options">
							<MenuItem className="story-MenuItem">Leave</MenuItem>
						</Drop>
					</AriakitDialog>
				</AriakitDialogProvider>
			</>
		);
	},
};
// #endregion layers

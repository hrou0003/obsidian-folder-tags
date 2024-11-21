import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	TFolder,
	TFile,
	EventRef,
	Modal,
} from "obsidian";

interface FolderTags {
	path: string;
	tags: FolderTag[];
}

interface FolderTagsSettings {
	folderTags: FolderTags[];
}

const DEFAULT_SETTINGS: FolderTagsSettings = {
	folderTags: [],
};

export default class FolderTagsPlugin extends Plugin {
	settings: FolderTagsSettings;
	fileCreateRef: EventRef;
	fileModifyRef: EventRef;
	isApplyingTags = false;

	async onload() {
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new FolderTagsSettingTab(this.app, this));

		// Add command to add tags to current folder
		this.addCommand({
			id: "add-tags-to-folder",
			name: "Add tags to current folder",
			callback: () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile?.parent) {
					this.addTagsToFolder(activeFile.parent);
				}
			},
		});

		// Add folder context menu item
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFolder) {
					menu.addItem((item) => {
						item.setTitle("Add folder tags")
							.setIcon("tag")
							.onClick(() => {
								this.addTagsToFolder(file);
							});
					});
				}
			}),
		);

		// Monitor file creation only
		this.fileCreateRef = this.app.vault.on("create", (file) => {
			if (file instanceof TFile) {
				// Only apply inherited tags to new files
				const folderPath = file.parent?.path || "";
				const inheritedTags = new Set(this.getFolderTags(folderPath));
				if (inheritedTags.size > 0) {
					this.addTagsToFileContent(file, inheritedTags);
				}
			}
		});
	}

	onunload() {
		this.app.vault.offref(this.fileCreateRef);
		this.app.metadataCache.offref(this.fileModifyRef);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update all file tags when settings change
	}

	getFolderTags(folderPath: string): FolderTag[] {
		// Get direct tags for this folder
		const folderTag = this.settings.folderTags.find(
			(ft) => ft.path === folderPath,
		);
		const directTags = folderTag ? folderTag.tags : [];

		// Get inherited tags from parent folders
		const parentTags = this.getInheritedTags(folderPath);

		// Combine and deduplicate tags
		return Array.from(new Set([...directTags, ...parentTags]));
	}

	getInheritedTags(path: string) {
		const pathParts = path.split("/");
		pathParts.pop();
		let inheritedTags: FolderTag[] = [];
		let currentPath = "";

		// Build up path progressively to check each parent folder
		for (const part of pathParts) {
			if (currentPath) {
				currentPath += "/";
			}
			currentPath += part;

			const folderTag = this.settings.folderTags.find(
				(ft) => ft.path === currentPath,
			);
			if (folderTag) {
				inheritedTags = [
					...inheritedTags.map(
						(t) => ({ tag: t.tag, inherited: true }) as FolderTag,
					),
					...folderTag.tags.map(
						(t) => ({ tag: t.tag, inherited: true }) as FolderTag,
					),
				];
			}
		}

		return inheritedTags;
	}

	async saveFolderTags(folderPath: string, tags: FolderTag[]) {
		const existingIndex = this.settings.folderTags.findIndex(
			(ft) => ft.path === folderPath,
		);

		if (existingIndex >= 0) {
			this.settings.folderTags[existingIndex].tags = tags;
		} else {
			this.settings.folderTags.push({
				path: folderPath,
				tags: tags,
			});
		}

		await this.saveSettings();
	}

	private async addTagsToFileContent(file: TFile, newTags: Set<FolderTag>) {
		if (newTags.size === 0) return;

		const content = await this.app.vault.read(file);
		const metadata = this.app.metadataCache.getFileCache(file);

		// Get all existing tags in the file
		const existingTags = new Set<string>();

		console.log(metadata?.tags);

		// Get inline tags
		if (metadata?.tags) {
			metadata.tags?.forEach((tag) => {
				console.log(tag);
				existingTags.add(tag.tag.substring(1));
			});
		}

		console.log(existingTags);
		console.log(newTags);
		// Filter out tags that already exist
		const tagsToAdd = new Set(
			[...newTags].filter((tag) => !existingTags.has(tag.tag)),
		);
		if (tagsToAdd.size === 0) return;

		// If frontmatter exists, add tags there
		if (metadata?.frontmatter) {
			const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
			const frontmatterMatch = content.match(frontmatterRegex);

			if (frontmatterMatch) {
				const yaml = this.parseYaml(frontmatterMatch[1]);
				const existingTags = yaml.tags || [];
				const allTags = Array.from(
					new Set([
						...(Array.isArray(existingTags)
							? existingTags
							: [existingTags]),
						...tagsToAdd,
					]),
				);

				yaml.tags = allTags;
				const newFrontmatter = this.stringifyYaml(yaml);
				const newContent = content.replace(
					frontmatterRegex,
					`---\n${newFrontmatter}---`,
				);

				console.log(newContent);
				await this.app.vault.modify(file, newContent);
			}
		}
		// Else add it to the bottom of the file
		else {
			const tagString = Array.from(tagsToAdd)
				.map((tag) => `#${tag.tag}`)
				.join(" ");

			const newContent = `${content.trimEnd()}\n\n${tagString}`;
			console.log(newContent);
			await this.app.vault.modify(file, newContent);
		}
	}

	private async removeTagsFromFileContent(
		file: TFile,
		tagsForRemoval: Set<FolderTag>,
	) {
		if (tagsForRemoval.size === 0) return;

		const content = await this.app.vault.read(file);
		const metadata = this.app.metadataCache.getFileCache(file);
		let newContent = content;

		// Remove from frontmatter if it exists
		if (metadata?.frontmatter) {
			const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
			const frontmatterMatch = content.match(frontmatterRegex);

			if (frontmatterMatch) {
				const yaml = this.parseYaml(frontmatterMatch[1]);
				if (yaml.tags) {
					const existingTags = Array.isArray(yaml.tags)
						? yaml.tags
						: [yaml.tags];
					yaml.tags = existingTags.filter(
						(tag: string) =>
							!new Array(...tagsForRemoval).some(
								(t) => t.tag == tag,
							),
					);

					// If tags array is empty, remove the tags property
					if (yaml.tags.length === 0) {
						delete yaml.tags;
					}

					const newFrontmatter = this.stringifyYaml(yaml);
					newContent = content.replace(
						frontmatterRegex,
						`---\n${newFrontmatter}---`,
					);
				}
			}
		}

		// Remove inline tags
		const tagsToRemovePattern = Array.from(tagsForRemoval)
			.map((tag) => `#${tag.tag}`)
			.join("|");
		if (tagsToRemovePattern) {
			const tagRegex = new RegExp(`\\s*(${tagsToRemovePattern})\\b`, "g");
			newContent = newContent.replace(tagRegex, " "); // Replace with a single space instead of empty string
		}

		if (newContent !== content) {
			console.log(newContent);
			await this.app.vault.modify(file, newContent);
		}
	}

	private parseYaml(yaml: string): any {
		try {
			// Simple YAML parser for frontmatter
			const result: any = {};
			const lines = yaml.split("\n");
			for (const line of lines) {
				const [key, ...values] = line.split(":").map((s) => s.trim());
				if (key && values.length) {
					const value = values.join(":").trim();
					if (value.startsWith("[") && value.endsWith("]")) {
						result[key] = value
							.slice(1, -1)
							.split(",")
							.map((s) => s.trim());
					} else {
						result[key] = value;
					}
				}
			}
			return result;
		} catch (e) {
			console.error("Error parsing YAML:", e);
			return {};
		}
	}

	private stringifyYaml(obj: any): string {
		// Simple YAML stringifier for frontmatter
		return Object.entries(obj)
			.map(([key, value]) => {
				if (Array.isArray(value)) {
					return `${key}: [${value.join(", ")}]`;
				}
				return `${key}: ${value}`;
			})
			.join("\n");
	}

	async addTagsToFolder(folder: TFolder) {
		const currentFolderTag = this.settings.folderTags.find(
			(ft) => ft.path === folder.path,
		);
		const currentTags = currentFolderTag ? currentFolderTag.tags : [];
		const inheritedTags = this.getInheritedTags(folder.path);

		// Convert to FolderTag array
		const folderTags: Set<FolderTag> = new Set([
			...inheritedTags,
			...currentTags,
		]);

		const modal = new TagInputModal(
			this.app,
			new Array(...folderTags),
			async (newTags) => {
				// Find tags that were removed
				const removedTags = new Set(
					currentTags.filter(
						(tag) =>
							!newTags.some(
								(t) =>
									t.tag == tag.tag &&
									t.inherited == tag.inherited,
							),
					),
				);

				// Update folder settings
				await this.saveFolderTags(folder.path, newTags);

				const addedTags = new Set(newTags);
				const files = this.app.vault
					.getFiles()
					.filter((file) => file.path.startsWith(folder.path));

				for (const file of files) {
					if (removedTags.size > 0) {
						await this.removeTagsFromFileContent(file, removedTags);
					}
					if (addedTags.size > 0) {
						await this.addTagsToFileContent(file, addedTags);
					}
				}
			},
		);
		modal.open();
	}
}

interface FolderTag {
	inherited: boolean;
	tag: string;
}

class TagInputModal extends Modal {
	tags: FolderTag[];
	onSubmit: (tags: FolderTag[]) => void;

	constructor(
		app: App,
		tags: FolderTag[],
		onSubmit: (tags: FolderTag[]) => void,
	) {
		super(app);
		this.tags = tags;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: "Enter folder tags" });

		const inputContainer = contentEl.createEl("div", {
			cls: "tag-input-container",
		});

		const tagContainer = inputContainer.createEl("div", {
			cls: "tag-container",
		});

		const inputEl = inputContainer.createEl("input", {
			type: "text",
			placeholder: "Type and press space to add tags",
		});

		// Add all tags, handling inherited and current differently
		this.tags.forEach((folderTag) =>
			this.createTagPill(tagContainer, folderTag),
		);

		const buttonContainer = contentEl.createEl("div", {
			cls: "button-container",
		});

		const buttonEl = buttonContainer.createEl("button", {
			text: "Save",
			cls: "tag-save-button",
		});

		inputEl.addEventListener("keydown", (e) => {
			if (e.key === " " && inputEl.value.trim()) {
				e.preventDefault();
				const newTagStr = inputEl.value.trim();
				if (!this.tags.some((t) => t.tag === newTagStr)) {
					this.tags.push({ tag: newTagStr, inherited: false });
					this.createTagPill(tagContainer, {
						tag: newTagStr,
						inherited: false,
					});
				}
				inputEl.value = "";
			} else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				const finalInput = inputEl.value.trim();
				if (
					finalInput &&
					!this.tags.some((t) => t.tag === finalInput)
				) {
					this.tags.push({ tag: finalInput, inherited: false });
				}
				this.onSubmit(this.tags.filter((t) => !t.inherited));
				this.close();
			}
		});

		buttonEl.onclick = () => {
			const finalInput = inputEl.value.trim();
			if (finalInput && !this.tags.some((t) => t.tag === finalInput)) {
				this.tags.push({ tag: finalInput, inherited: false });
			}
			this.onSubmit(this.tags.filter((t) => !t.inherited));
			this.close();
		};

		this.addStyles();
	}

	createTagPill(container: HTMLElement, folderTag: FolderTag) {
		const pillEl = container.createEl("div", {
			cls: `tag-pill ${folderTag.inherited ? "inherited" : ""}`,
			text: folderTag.tag,
		});

		if (!folderTag.inherited) {
			const deleteBtn = pillEl.createEl("span", {
				cls: "tag-delete",
				text: "×",
			});

			deleteBtn.onclick = () => {
				this.tags = this.tags.filter((t) => t.tag !== folderTag.tag);
				pillEl.remove();
			};
		}
	}

	addStyles() {
		document.head.appendChild(
			createEl("style", {
				attr: {
					type: "text/css",
				},
				text: `
                .tag-input-container {
                    border: 1px solid var(--background-modifier-border);
                    border-radius: 4px;
                    padding: 8px;
                    margin-bottom: 16px;
                    min-height: 36px;
                }
                .tag-container {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 8px;
                }
                .tag-pill {
                    background-color: var(--interactive-accent);
                    color: var(--text-on-accent);
                    padding: 4px 8px;
                    border-radius: 16px;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }
                .tag-delete {
                    cursor: pointer;
                    font-weight: bold;
                    padding: 0 4px;
                }
                .tag-delete:hover {
                    opacity: 0.8;
                }
                input {
                    width: 100%;
                    border: none;
                    outline: none;
                    background: transparent;
                }
                .button-container {
                    display: flex;
                    justify-content: flex-end;
                }
                .tag-save-button {
                    margin-top: 8px;
                }
            `,
			}),
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class FolderTagsSettingTab extends PluginSettingTab {
	plugin: FolderTagsPlugin;

	constructor(app: App, plugin: FolderTagsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Folder Tags Settings" });

		this.plugin.settings.folderTags.forEach((folderTag) => {
			new Setting(containerEl)
				.setName(folderTag.path)
				.setDesc(`Tags: ${folderTag.tags.map((t) => t.tag).join(", ")}`)
				.addButton((button) =>
					button.setButtonText("Edit").onClick(async () => {
						const modal = new TagInputModal(
							this.app,
							folderTag.tags,
							async (newTags) => {
								await this.plugin.saveFolderTags(
									folderTag.path,
									newTags,
								);
								this.display();
							},
						);
						modal.open();
					}),
				)
				.addButton((button) =>
					button.setButtonText("Remove").onClick(async () => {
						this.plugin.settings.folderTags =
							this.plugin.settings.folderTags.filter(
								(ft) => ft.path !== folderTag.path,
							);
						await this.plugin.saveSettings();
						this.display();
					}),
				);
		});
	}
}

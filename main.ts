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

interface FolderTag {
	path: string;
	tags: string[];
}

interface FolderTagsSettings {
	folderTags: FolderTag[];
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

	getFolderTags(folderPath: string): string[] {
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

	getInheritedTags(path: string): string[] {
		const pathParts = path.split("/");
		let inheritedTags: string[] = [];
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
				inheritedTags = [...inheritedTags, ...folderTag.tags];
			}
		}

		return inheritedTags;
	}

	async setFolderTags(folderPath: string, tags: string[]) {
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

	private async addTagsToFileContent(file: TFile, newTags: Set<string>) {
		if (newTags.size === 0) return;

		const content = await this.app.vault.read(file);
		const metadata = this.app.metadataCache.getFileCache(file);

		// Get all existing tags in the file
		const existingTags = new Set<string>();

		// Get tags from frontmatter
		if (metadata?.frontmatter?.tags) {
			const fmTags = metadata.frontmatter.tags;
			if (Array.isArray(fmTags)) {
				fmTags.forEach((tag) => existingTags.add(tag));
			} else {
				existingTags.add(fmTags);
			}
		}

		// Get inline tags
		if (metadata?.tags) {
			Object.keys(metadata.tags).forEach((tag) => {
				existingTags.add(tag.substring(1));
			});
		}

		// Filter out tags that already exist
		const tagsToAdd = new Set(
			[...newTags].filter((tag) => !existingTags.has(tag)),
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
						...newTags,
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
			const tagString = Array.from(newTags)
				.map((tag) => `#${tag}`)
				.join(" ");

			const newContent = `${content.trimEnd()}\n\n${tagString}`;
			console.log(newContent);
			await this.app.vault.modify(file, newContent);
		}
	}

	private async removeTagsFromFileContent(
		file: TFile,
		tagsForRemoval: Set<string>,
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
						(tag: string) => !tagsForRemoval.has(tag),
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
			.map((tag) => `#${tag}`)
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
		const existingTags = this.getFolderTags(folder.path);
		const modal = new TagInputModal(
			this.app,
			existingTags,
			async (newTags) => {
				// Find tags that were removed
				const removedTags = new Set(
					existingTags.filter((tag) => !newTags.includes(tag)),
				);

				// Find tags that were added
				const addedTags = new Set(
					newTags.filter((tag) => !existingTags.includes(tag)),
				);

				// Update folder settings
				await this.setFolderTags(folder.path, newTags);

				// Update all files in the folder and subfolders
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

class TagInputModal extends Modal {
	tags: string[];
	onSubmit: (tags: string[]) => void;

	constructor(
		app: App,
		existingTags: string[],
		onSubmit: (tags: string[]) => void,
	) {
		super(app);
		this.tags = existingTags;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: "Enter folder tags" });

		const inputEl = contentEl.createEl("input", {
			type: "text",
			value: this.tags.join(", "),
		});

		const buttonEl = contentEl.createEl("button", {
			text: "Save",
		});

		buttonEl.onclick = () => {
			const newTags = inputEl.value
				.split(",")
				.map((tag) => tag.trim())
				.filter((tag) => tag.length > 0);
			this.onSubmit(newTags);
			this.close();
		};
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
				.setDesc(`Tags: ${folderTag.tags.join(", ")}`)
				.addButton((button) =>
					button.setButtonText("Edit").onClick(async () => {
						const modal = new TagInputModal(
							this.app,
							folderTag.tags,
							async (newTags) => {
								await this.plugin.setFolderTags(
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

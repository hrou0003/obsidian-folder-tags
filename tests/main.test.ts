import FolderTagsPlugin from "../main";
import { App, PluginManifest, TFile, TFolder } from "obsidian";

jest.mock("obsidian", () => ({
	App: jest.fn(),
	TFile: jest.fn(),
	TFolder: jest.fn(),
	Plugin: jest.fn(),
	Notice: jest.fn(),
	Modal: jest.fn(),
	PluginSettingTab: jest.fn(),
}));

describe("FolderTagsPlugin", () => {
	let plugin: FolderTagsPlugin;
	let mockApp: App;
	let mockFolder: TFolder;
	let mockFile: TFile;
	let mockManifest: PluginManifest;

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks();

		// Create mock objects
		mockApp = {
			vault: {
				getFiles: jest.fn().mockReturnValue([]),
				read: jest.fn().mockResolvedValue(""),
				modify: jest.fn().mockResolvedValue(undefined),
				trigger: jest.fn(),
			},
			workspace: {
				getActiveFile: jest.fn(),
			},
			metadataCache: {
				getFileCache: jest.fn(),
			},
		} as unknown as App;

		mockFolder = {
			path: "test/folder",
			name: "folder",
		} as TFolder;

		mockFile = {
			path: "test/folder/file.md",
			parent: mockFolder,
			name: "file.md",
		} as TFile;
		mockManifest = {
			id: "test-plugin",
			name: "Test Plugin",
			version: "1.0.0",
			minAppVersion: "0.15.0",
			author: "test",
			description: "testing",
		};

		// Create plugin instance
		plugin = new FolderTagsPlugin(mockApp, mockManifest);
		plugin.settings = {
			folderTags: [],
		};
	});

	describe("getFolderTags", () => {
		it("should return direct tags for folder", () => {
			plugin.settings.folderTags = [
				{
					path: "test/folder",
					tags: [
						{ tag: "tag1", inherited: false },
						{ tag: "tag2", inherited: false },
					],
				},
			];

			const tags = plugin.getFolderTags("test/folder");
			expect(tags).toEqual([
				{ tag: "tag1", inherited: false },
				{ tag: "tag2", inherited: false },
			]);
		});

		it("should return inherited tags from parent folders", () => {
			plugin.settings.folderTags = [
				{
					path: "test",
					tags: [{ tag: "parent", inherited: false }],
				},
				{
					path: "test/folder",
					tags: [{ tag: "child", inherited: false }],
				},
			];

			const tags = plugin.getFolderTags("test/folder");
			expect(tags).toContainEqual({ tag: "parent", inherited: true });
			expect(tags).toContainEqual({ tag: "child", inherited: false });
		});
	});

	describe("addTagsToFileContent", () => {
		it("should add tags to file without frontmatter", async () => {
			const folder = mockFolder;
			const content = "Some content";
			(mockApp.vault.read as jest.Mock).mockResolvedValue(content);

			await plugin.addTagsToFolder(folder);

			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				mockFile,
				expect.stringContaining("#newtag"),
			);
		});

		it("should add tags to existing frontmatter", async () => {
			const content =
				"---\ntitle: Test\ntags: [existingtag]\n---\nContent";
			(mockApp.vault.read as jest.Mock).mockResolvedValue(content);
			(mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
				frontmatter: { tags: ["existingtag"] },
			});

			await plugin.addTagsToFileContent(
				mockFile,
				new Set([{ tag: "newtag", inherited: false }]),
			);

			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				mockFile,
				expect.stringContaining("tags: [existingtag, newtag]"),
			);
		});
	});

	describe("removeTagsFromFileContent", () => {
		it("should remove tags from inline content", async () => {
			const content = "Content #tag1 #tag2";
			(mockApp.vault.read as jest.Mock).mockResolvedValue(content);

			await plugin.removeTagsFromFileContent(
				mockFile,
				new Set([{ tag: "tag1", inherited: false }]),
			);

			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				mockFile,
				expect.not.stringContaining("#tag1"),
			);
		});

		it("should remove tags from frontmatter", async () => {
			const content = "---\ntags: [tag1, tag2]\n---\nContent";
			(mockApp.vault.read as jest.Mock).mockResolvedValue(content);
			(mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
				frontmatter: { tags: ["tag1", "tag2"] },
			});

			await plugin.removeTagsFromFileContent(
				mockFile,
				new Set([{ tag: "tag1", inherited: false }]),
			);

			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				mockFile,
				expect.stringContaining("tags: [tag2]"),
			);
		});
	});

	describe("Event handling", () => {
		it("should add tags to new files in tagged folders", async () => {
			plugin.settings.folderTags = [
				{
					path: "test/folder",
					tags: [{ tag: "foldertag", inherited: false }],
				},
			];

			// Simulate file creation event
			await plugin.app.vault.trigger("create", mockFile);

			expect(mockApp.vault.modify).toHaveBeenCalled();
		});
	});
});

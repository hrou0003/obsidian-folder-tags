# Obsidian Folder Tags Plugin

This plugin allows you to add tags to folders in Obsidian and automatically apply those tags to files within those folders. Tags are inherited by subfolders and can be managed through the interface.

## Features

- Add tags to folders that automatically apply to all files within
- Tags are inherited by subfolders and their contents
- New files automatically receive folder tags when created
- Edit or remove folder tags through the settings panel
- Folder context menu integration for quick tag management
- Support for both frontmatter and inline tags
- Handles tag inheritance throughout the folder hierarchy

## Usage

### Adding Tags to a Folder

There are two ways to add tags to a folder:

1. **Context Menu**
   - Right-click on any folder
   - Select "Add folder tags"
   - Enter your tags separated by commas

2. **Command Palette**
   - Open the command palette (Ctrl/Cmd + P)
   - Search for "Add tags to current folder"
   - Enter your tags separated by commas

### Managing Tags

You can manage all folder tags through the plugin settings:
1. Go to Settings > Plugin Options > Folder Tags
2. Each folder with tags will be listed
3. Use the "Edit" button to modify tags
4. Use the "Remove" button to delete folder tags

## Installation

1. Open Obsidian Settings
2. Go to Community Plugins and turn off Restricted Mode
3. Click Browse and search for "Folder Tags"
4. Install the plugin
5. Enable the plugin in your Community Plugins settings

## Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create a new folder in your vault: `.obsidian/plugins/obsidian-folder-tags/`
3. Copy the downloaded files into this folder
4. Reload Obsidian
5. Enable the plugin in Community Plugins settings

## Development

- Clone this repository to `.obsidian/plugins/obsidian-folder-tags/`
- `npm install` to install dependencies
- `npm run dev` to start compilation in watch mode
- Make changes to `main.ts`
- Reload Obsidian to see changes

## Support

If you find any bugs or have feature requests, please create an issue on the GitHub repository.

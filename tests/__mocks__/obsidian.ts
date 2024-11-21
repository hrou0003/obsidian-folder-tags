const mockVault = {
	read: jest.fn(),
	modify: jest.fn(),
	getMarkdownFiles: jest.fn(),
	trigger: jest.fn(),
};

const mockMetadataCache = {
	getFileCache: jest.fn(),
};

const mockModal = {
	open: jest.fn(),
	close: jest.fn(),
};

export const App = jest.fn().mockImplementation(() => ({
	vault: mockVault,
	metadataCache: mockMetadataCache,
}));

export const Modal = jest.fn().mockImplementation(() => mockModal);
export const Plugin = jest.fn();

// Export mocks for test manipulation
export { mockVault, mockMetadataCache, mockModal };

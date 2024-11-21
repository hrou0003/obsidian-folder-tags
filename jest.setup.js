global.console = {
	...console,
	// Uncomment to debug:
	// log: jest.fn(),
	// debug: jest.fn(),
	// info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
};

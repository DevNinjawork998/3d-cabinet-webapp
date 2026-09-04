import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": new URL("./src", import.meta.url).pathname,
			// `server-only` throws unless the bundler picks its "react-server"
			// condition, which vitest does not. Point it at the no-op that
			// condition would have resolved to, so a server module is testable.
			"server-only": new URL(
				"./node_modules/server-only/empty.js",
				import.meta.url,
			).pathname,
		},
	},
});

import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Same precedence Next.js uses: .env first, then .env.local overrides it —
// that's where `vercel env pull` (BLOB_READ_WRITE_TOKEN, etc.) writes.
config();
config({ path: ".env.local", override: true });

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
		seed: "tsx prisma/seed.ts",
	},
	datasource: {
		url: process.env.DATABASE_URL,
	},
});

/**
 * API Server entry point.
 * Build Spec §29.
 */

import { app } from "./app";

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 Policy Assignment API running at http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});

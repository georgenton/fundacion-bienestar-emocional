import { prisma } from "@fbe/database";
import { dispatchReminders } from "./reminders.js";

try {
  if (process.env.SYNTHETIC_DATA_ONLY !== "true" || process.env.ALLOW_SYNTHETIC_SEED !== "false") {
    throw new Error("SYNTHETIC_MODE_REQUIRED");
  }
  const { attempted, delivered, skipped } = await dispatchReminders();
  console.log(`fbe_reminders=verified attempted=${attempted} delivered=${delivered} skipped=${skipped}`);
} catch {
  console.error("fbe_reminders=failed");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

// One anonymous browser workspace contains the four fictional demo profiles.
export const kitchens = pgTable('kitchens', {
  id: text('id').primaryKey(),
  data: jsonb('data').$type<Record<string, string>>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

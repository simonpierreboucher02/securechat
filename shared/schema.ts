import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  recoveryKey: text("recovery_key").notNull(),
  publicKey: text("public_key").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull().default("direct"), // 'direct' or 'group'
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversationParticipants = pgTable("conversation_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  senderId: varchar("sender_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  encryptedContent: text("encrypted_content").notNull(),
  messageType: text("message_type").notNull().default("text"), // 'text', 'image', 'file', 'voice'
  metadata: jsonb("metadata"), // For file info, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messageStatus = pgTable("message_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").references(() => messages.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  status: text("status").notNull().default("sent"), // 'sent', 'delivered', 'read'
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const typingStatus = pgTable("typing_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  isTyping: boolean("is_typing").default(false).notNull(),
  lastUpdate: timestamp("last_update").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  conversationParticipants: many(conversationParticipants),
  messages: many(messages),
  messageStatuses: many(messageStatus),
  typingStatuses: many(typingStatus),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  participants: many(conversationParticipants),
  messages: many(messages),
  typingStatuses: many(typingStatus),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationParticipants.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [conversationParticipants.userId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
  statuses: many(messageStatus),
}));

export const messageStatusRelations = relations(messageStatus, ({ one }) => ({
  message: one(messages, {
    fields: [messageStatus.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [messageStatus.userId],
    references: [users.id],
  }),
}));

// Schemas for validation
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  recoveryKey: true,
  publicKey: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const recoverySchema = z.object({
  username: z.string().min(1),
  recoveryKey: z.string().min(1),
  newPassword: z.string().min(6),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type LoginData = z.infer<typeof loginSchema>;
export type RecoveryData = z.infer<typeof recoverySchema>;

export type User = typeof users.$inferSelect;
export type UserWithRecoveryKey = User & { recoveryKey: string }; // For registration response
export type Conversation = typeof conversations.$inferSelect;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type MessageStatus = typeof messageStatus.$inferSelect;
export type TypingStatus = typeof typingStatus.$inferSelect;

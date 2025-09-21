import { users, conversations, conversationParticipants, messages, messageStatus, typingStatus, type User, type InsertUser, type Conversation, type InsertConversation, type Message, type InsertMessage, type ConversationParticipant, type MessageStatus, type TypingStatus } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import session, { Store as SessionStore } from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser & { recoveryKey: string; publicKey: string }): Promise<User>;
  updateUserPassword(id: string, password: string): Promise<void>;
  updateUserPublicKey(id: string, publicKey: string): Promise<void>;
  
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getUserConversations(userId: string): Promise<Array<Conversation & { participants: Array<User>; lastMessage?: Message & { sender: User } }>>;
  getConversationParticipants(conversationId: string): Promise<Array<User>>;
  addConversationParticipant(conversationId: string, userId: string): Promise<ConversationParticipant>;
  
  createMessage(message: InsertMessage): Promise<Message>;
  getConversationMessages(conversationId: string, limit?: number): Promise<Array<Message & { sender: User }>>;
  updateMessageStatus(messageId: string, userId: string, status: 'sent' | 'delivered' | 'read'): Promise<void>;
  
  updateTypingStatus(conversationId: string, userId: string, isTyping: boolean): Promise<void>;
  getTypingUsers(conversationId: string): Promise<Array<User>>;
  
  sessionStore: SessionStore;
}

export class DatabaseStorage implements IStorage {
  sessionStore: SessionStore;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser & { recoveryKey: string; publicKey: string }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUserPassword(id: string, password: string): Promise<void> {
    await db
      .update(users)
      .set({ password })
      .where(eq(users.id, id));
  }

  async updateUserPublicKey(id: string, publicKey: string): Promise<void> {
    await db
      .update(users)
      .set({ publicKey })
      .where(eq(users.id, id));
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const [conversation] = await db
      .insert(conversations)
      .values(insertConversation)
      .returning();
    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation || undefined;
  }

  async getUserConversations(userId: string): Promise<Array<Conversation & { participants: Array<User>; lastMessage?: Message & { sender: User } }>> {
    // Get conversations where user is a participant
    const userConversations = await db
      .select({
        conversation: conversations,
      })
      .from(conversations)
      .innerJoin(conversationParticipants, eq(conversations.id, conversationParticipants.conversationId))
      .where(eq(conversationParticipants.userId, userId))
      .orderBy(desc(conversations.createdAt));

    const result = [];
    
    for (const { conversation } of userConversations) {
      // Get participants for this conversation
      const participants = await db
        .select({ user: users })
        .from(users)
        .innerJoin(conversationParticipants, eq(users.id, conversationParticipants.userId))
        .where(eq(conversationParticipants.conversationId, conversation.id));

      // Get last message for this conversation
      const [lastMessage] = await db
        .select({
          message: messages,
          sender: users,
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      result.push({
        ...conversation,
        participants: participants.map(p => p.user),
        lastMessage: lastMessage ? { ...lastMessage.message, sender: lastMessage.sender } : undefined,
      });
    }

    return result;
  }

  async addConversationParticipant(conversationId: string, userId: string): Promise<ConversationParticipant> {
    const [participant] = await db
      .insert(conversationParticipants)
      .values({ conversationId, userId })
      .returning();
    return participant;
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values(insertMessage)
      .returning();
    return message;
  }

  async getConversationMessages(conversationId: string, limit = 50): Promise<Array<Message & { sender: User }>> {
    const result = await db
      .select({
        message: messages,
        sender: users,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return result.map(r => ({ ...r.message, sender: r.sender })).reverse();
  }

  async updateMessageStatus(messageId: string, userId: string, status: 'sent' | 'delivered' | 'read'): Promise<void> {
    await db
      .insert(messageStatus)
      .values({ messageId, userId, status })
      .onConflictDoNothing();
  }

  async updateTypingStatus(conversationId: string, userId: string, isTyping: boolean): Promise<void> {
    await db
      .insert(typingStatus)
      .values({ conversationId, userId, isTyping })
      .onConflictDoNothing();
  }

  async getTypingUsers(conversationId: string): Promise<Array<User>> {
    const result = await db
      .select({ user: users })
      .from(users)
      .innerJoin(typingStatus, eq(users.id, typingStatus.userId))
      .where(
        and(
          eq(typingStatus.conversationId, conversationId),
          eq(typingStatus.isTyping, true),
          sql`${typingStatus.lastUpdate} > NOW() - INTERVAL '5 seconds'`
        )
      );

    return result.map(r => r.user);
  }

  async getConversationParticipants(conversationId: string): Promise<Array<User>> {
    const result = await db
      .select({ user: users })
      .from(users)
      .innerJoin(conversationParticipants, eq(users.id, conversationParticipants.userId))
      .where(eq(conversationParticipants.conversationId, conversationId));

    return result.map(r => r.user);
  }
}

export const storage = new DatabaseStorage();

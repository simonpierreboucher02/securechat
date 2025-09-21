import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { z } from "zod";
import { insertMessageSchema, loginSchema, recoverySchema } from "@shared/schema";
import { generateRecoveryKey, generateKeyPair, verifyRecoveryKey } from "./encryption";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage";
import { ObjectPermission } from "./objectAcl";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication routes
  setupAuth(app);

  // Chat API routes
  app.get("/api/conversations", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    try {
      const conversations = await storage.getUserConversations(req.user.id);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.post("/api/conversations", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    try {
      const { participantUsernames } = req.body;
      
      if (!participantUsernames || !Array.isArray(participantUsernames)) {
        return res.status(400).json({ error: "participantUsernames is required and must be an array" });
      }

      // Get participant users
      const participants = [];
      for (const username of participantUsernames) {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return res.status(400).json({ error: `User ${username} not found` });
        }
        participants.push(user);
      }

      // Create conversation
      const conversation = await storage.createConversation({
        type: participants.length > 2 ? "group" : "direct",
        name: participants.length > 2 ? `Group with ${participants.map(p => p.username).join(", ")}` : null,
      });

      // Add participants
      await storage.addConversationParticipant(conversation.id, req.user.id);
      for (const participant of participants) {
        if (participant.id !== req.user.id) {
          await storage.addConversationParticipant(conversation.id, participant.id);
        }
      }

      res.json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.get("/api/conversations/:id/messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    try {
      const messages = await storage.getConversationMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // POST route for sending messages (REST API alternative to WebSocket)
  app.post("/api/conversations/:id/messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    try {
      const validatedMessage = insertMessageSchema.parse({
        conversationId: req.params.id,
        senderId: req.user.id,
        encryptedContent: req.body.encryptedContent,
        messageType: req.body.messageType || 'text',
        metadata: req.body.metadata,
      });

      const savedMessage = await storage.createMessage(validatedMessage);
      
      // Get conversation participants for broadcasting
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Send the response immediately
      res.status(201).json({
        ...savedMessage,
        sender: req.user,
      });

      // Broadcast to WebSocket clients (non-blocking)
      const participants = await storage.getUserConversations(req.user.id);
      const targetConversation = participants.find(c => c.id === req.params.id);
      
      if (targetConversation) {
        const messageWithSender = {
          ...savedMessage,
          sender: req.user,
        };

        for (const participant of targetConversation.participants) {
          const userSockets = authenticatedClients.get(participant.id);
          if (userSockets) {
            userSockets.forEach(socket => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                  type: 'new_message',
                  message: messageWithSender,
                }));
              }
            });
          }
        }
      }
    } catch (error) {
      console.error('Error sending message via REST:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Get conversation participants with their public keys for E2EE
  app.get("/api/conversations/:id/keys", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    try {
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Verify user is participant in conversation
      const userConversations = await storage.getUserConversations(req.user.id);
      const userInConversation = userConversations.some(c => c.id === req.params.id);
      
      if (!userInConversation) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get all participants with their public keys
      const participants = await storage.getConversationParticipants(req.params.id);
      const participantsWithKeys = participants.map(p => ({
        id: p.id,
        username: p.username,
        publicKey: p.publicKey
      }));

      res.json({ participants: participantsWithKeys });
    } catch (error) {
      console.error("Error getting conversation keys:", error);
      res.status(500).json({ error: "Failed to get conversation keys" });
    }
  });

  app.post("/api/recovery", async (req, res) => {
    try {
      const validatedData = recoverySchema.parse(req.body);
      const user = await storage.getUserByUsername(validatedData.username);

      if (!user) {
        return res.status(400).json({ error: "Invalid username or recovery key" });
      }

      if (!verifyRecoveryKey(validatedData.recoveryKey, user.recoveryKey)) {
        return res.status(400).json({ error: "Invalid username or recovery key" });
      }

      // Hash new password and update
      const { hashPassword } = await import("./auth");
      const hashedPassword = await hashPassword(validatedData.newPassword);
      await storage.updateUserPassword(user.id, hashedPassword);

      res.json({ success: true });
    } catch (error) {
      console.error("Error in recovery:", error);
      res.status(500).json({ error: "Recovery failed" });
    }
  });

  // Object storage endpoints for media uploads
  app.get("/objects/:objectPath(*)", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const userId = req.user?.id;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(
        req.path,
      );
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(403);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.post("/api/objects/upload", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.put("/api/media-messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    if (!req.body.mediaURL) {
      return res.status(400).json({ error: "mediaURL is required" });
    }

    const userId = req.user?.id;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.mediaURL,
        {
          owner: userId,
          // Messages media should be private but accessible to conversation participants
          visibility: "private",
        },
      );

      res.status(200).json({
        objectPath: objectPath,
      });
    } catch (error) {
      console.error("Error setting media message:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);

  // WebSocket server for real-time messaging
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws' 
  });

  const authenticatedClients = new Map<string, Set<AuthenticatedWebSocket>>();

  wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
    console.log('WebSocket connection established');

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'authenticate':
            // In a real implementation, you'd validate the JWT token here
            // For now, we'll use session-based auth
            ws.userId = message.userId;
            
            if (!authenticatedClients.has(message.userId)) {
              authenticatedClients.set(message.userId, new Set());
            }
            authenticatedClients.get(message.userId)!.add(ws);
            
            ws.send(JSON.stringify({ type: 'authenticated', userId: message.userId }));
            break;

          case 'send_message':
            if (!ws.userId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
              return;
            }

            try {
              const validatedMessage = insertMessageSchema.parse({
                conversationId: message.conversationId,
                senderId: ws.userId,
                encryptedContent: message.encryptedContent,
                messageType: message.messageType || 'text',
                metadata: message.metadata,
              });

              const savedMessage = await storage.createMessage(validatedMessage);
              
              // Get conversation participants
              const conversation = await storage.getConversation(message.conversationId);
              if (!conversation) {
                ws.send(JSON.stringify({ type: 'error', message: 'Conversation not found' }));
                return;
              }

              // Get all participants in the conversation
              const participants = await storage.getUserConversations(ws.userId);
              const targetConversation = participants.find(c => c.id === message.conversationId);
              
              if (targetConversation) {
                // Send message to all participants
                for (const participant of targetConversation.participants) {
                  const userSockets = authenticatedClients.get(participant.id);
                  if (userSockets) {
                    const messageWithSender = {
                      ...savedMessage,
                      sender: await storage.getUser(ws.userId),
                    };

                    userSockets.forEach(socket => {
                      if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({
                          type: 'new_message',
                          message: messageWithSender,
                        }));
                      }
                    });
                  }
                }
              }
            } catch (error) {
              console.error('Error sending message:', error);
              ws.send(JSON.stringify({ type: 'error', message: 'Failed to send message' }));
            }
            break;

          case 'typing':
            if (!ws.userId) return;

            try {
              await storage.updateTypingStatus(message.conversationId, ws.userId, message.isTyping);
              
              // Get conversation participants and broadcast typing status
              const conversation = await storage.getConversation(message.conversationId);
              if (conversation) {
                const participants = await storage.getUserConversations(ws.userId);
                const targetConversation = participants.find(c => c.id === message.conversationId);
                
                if (targetConversation) {
                  for (const participant of targetConversation.participants) {
                    if (participant.id !== ws.userId) {
                      const userSockets = authenticatedClients.get(participant.id);
                      if (userSockets) {
                        const user = await storage.getUser(ws.userId);
                        userSockets.forEach(socket => {
                          if (socket.readyState === WebSocket.OPEN) {
                            socket.send(JSON.stringify({
                              type: 'typing_status',
                              conversationId: message.conversationId,
                              userId: ws.userId,
                              username: user?.username,
                              isTyping: message.isTyping,
                            }));
                          }
                        });
                      }
                    }
                  }
                }
              }
            } catch (error) {
              console.error('Error updating typing status:', error);
            }
            break;

          case 'message_status':
            if (!ws.userId) return;

            try {
              await storage.updateMessageStatus(message.messageId, ws.userId, message.status);
              
              // Broadcast status update to sender
              const messageData = await storage.getConversationMessages(message.conversationId, 1);
              if (messageData.length > 0) {
                const sender = messageData[0].sender;
                const senderSockets = authenticatedClients.get(sender.id);
                
                if (senderSockets) {
                  senderSockets.forEach(socket => {
                    if (socket.readyState === WebSocket.OPEN) {
                      socket.send(JSON.stringify({
                        type: 'message_status_update',
                        messageId: message.messageId,
                        userId: ws.userId,
                        status: message.status,
                      }));
                    }
                  });
                }
              }
            } catch (error) {
              console.error('Error updating message status:', error);
            }
            break;
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      if (ws.userId) {
        const userSockets = authenticatedClients.get(ws.userId);
        if (userSockets) {
          userSockets.delete(ws);
          if (userSockets.size === 0) {
            authenticatedClients.delete(ws.userId);
          }
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  return httpServer;
}

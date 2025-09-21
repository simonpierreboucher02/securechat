import { useState, useEffect, useRef } from "react";
import { useAuth } from "./use-auth";
import { websocketService, WebSocketMessage } from "@/lib/websocket";
import { encryptionService } from "@/lib/encryption";
import { Message, User } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

interface MessageWithSender extends Message {
  sender: User;
}

export function useChat(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [typingUsers, setTypingUsers] = useState<User[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const isConnecting = useRef(false);

  // Connect to WebSocket when user is available
  useEffect(() => {
    if (user && !isConnected && !isConnecting.current) {
      isConnecting.current = true;
      
      websocketService.connect(user.id)
        .then(() => {
          setIsConnected(true);
          isConnecting.current = false;
        })
        .catch((error) => {
          console.error('Failed to connect to WebSocket:', error);
          isConnecting.current = false;
        });
    }

    return () => {
      websocketService.disconnect();
      setIsConnected(false);
    };
  }, [user]);

  // Set up message handlers
  useEffect(() => {
    const handleNewMessage = (data: WebSocketMessage) => {
      if (data.message && (!conversationId || data.message.conversationId === conversationId)) {
        setMessages(prev => {
          // Check if message already exists to prevent duplicates
          const exists = prev.some(m => m.id === data.message.id);
          if (exists) return prev;
          
          return [...prev, data.message].sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });
      }
    };

    const handleTypingStatus = (data: WebSocketMessage) => {
      if (!conversationId || data.conversationId !== conversationId) return;
      
      setTypingUsers(prev => {
        const filtered = prev.filter(u => u.id !== data.userId);
        
        if (data.isTyping) {
          // Add user to typing list
          return [...filtered, { id: data.userId, username: data.username, createdAt: new Date(), password: '', recoveryKey: '', publicKey: '', privateKey: '' }];
        } else {
          // Remove user from typing list
          return filtered;
        }
      });
    };

    const handleMessageStatusUpdate = (data: WebSocketMessage) => {
      // Handle message read/delivery receipts
      console.log('Message status update:', data);
    };

    websocketService.onMessage('new_message', handleNewMessage);
    websocketService.onMessage('typing_status', handleTypingStatus);
    websocketService.onMessage('message_status_update', handleMessageStatusUpdate);

    return () => {
      websocketService.offMessage('new_message');
      websocketService.offMessage('typing_status');
      websocketService.offMessage('message_status_update');
    };
  }, [conversationId]);

  // Clear messages when conversation changes
  useEffect(() => {
    setMessages([]);
    setTypingUsers([]);
  }, [conversationId]);

  const sendMessage = async (content: string, messageType: string = 'text', metadata?: any) => {
    if (!conversationId || !user || !isConnected) {
      throw new Error('Cannot send message: not connected or no conversation selected');
    }

    try {
      // Get recipient public keys for encryption - use simple fetch for now
      const response = await fetch(`/api/conversations/${conversationId}/keys`);
      if (!response.ok) {
        throw new Error('Failed to get conversation keys');
      }
      const conversationData = await response.json();

      if (!conversationData) {
        throw new Error('Failed to get conversation encryption keys');
      }

      // For E2EE, we need to encrypt for each recipient
      // For now, using a simplified hybrid encryption approach
      const { encryptionService } = await import('@/lib/encryption');
      
      // Generate AES key for this message
      const messageKey = await encryptionService.generateAESKey();
      const { encryptedData, iv } = await encryptionService.encryptMessage(content, messageKey);
      
      // Encrypt the message key for each recipient using their public key
      const encryptedKeys: Record<string, string> = {};
      
      for (const participant of conversationData.participants) {
        const publicKey = await encryptionService.importPublicKey(participant.publicKey);
        const encryptedMessageKey = await encryptionService.encryptAESKey(messageKey, publicKey);
        encryptedKeys[participant.id] = encryptedMessageKey;
      }

      const encryptedContent = JSON.stringify({
        encryptedData,
        iv,
        encryptedKeys,
      });
      
      websocketService.sendMessage(conversationId, encryptedContent, messageType, metadata);
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  };

  const sendTypingStatus = (isTyping: boolean) => {
    if (!conversationId || !isConnected) return;
    
    websocketService.sendTypingStatus(conversationId, isTyping);
  };

  const sendMessageStatus = (messageId: string, status: 'delivered' | 'read') => {
    if (!conversationId || !isConnected) return;
    
    websocketService.sendMessageStatus(messageId, conversationId, status);
  };

  return {
    messages,
    typingUsers,
    isConnected,
    sendMessage,
    sendTypingStatus,
    sendMessageStatus,
  };
}

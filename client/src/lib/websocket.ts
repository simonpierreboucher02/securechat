import { User, Message, Conversation } from "@shared/schema";

export interface WebSocketMessage {
  type: 'authenticate' | 'send_message' | 'typing' | 'message_status' | 'new_message' | 'typing_status' | 'message_status_update' | 'authenticated' | 'error';
  [key: string]: any;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers = new Map<string, (data: any) => void>();
  private isAuthenticated = false;
  private userId: string | null = null;

  connect(userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      this.ws = new WebSocket(wsUrl);
      this.userId = userId;

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        
        // Authenticate immediately after connection
        this.send({
          type: 'authenticate',
          userId: userId,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          if (message.type === 'authenticated') {
            this.isAuthenticated = true;
            resolve();
          } else if (message.type === 'error') {
            console.error('WebSocket error:', message.message);
            if (!this.isAuthenticated) {
              reject(new Error(message.message));
            }
          }

          // Handle message with registered handlers
          const handler = this.messageHandlers.get(message.type);
          if (handler) {
            handler(message);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.isAuthenticated = false;
        
        if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
          setTimeout(() => {
            this.reconnectAttempts++;
            console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
            if (this.userId) {
              this.connect(this.userId);
            }
          }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts));
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (!this.isAuthenticated) {
          reject(error);
        }
      };
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.isAuthenticated = false;
    this.userId = null;
  }

  send(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket not connected');
    }
  }

  sendMessage(conversationId: string, encryptedContent: string, messageType: string = 'text', metadata?: any): void {
    this.send({
      type: 'send_message',
      conversationId,
      encryptedContent,
      messageType,
      metadata,
    });
  }

  sendTypingStatus(conversationId: string, isTyping: boolean): void {
    this.send({
      type: 'typing',
      conversationId,
      isTyping,
    });
  }

  sendMessageStatus(messageId: string, conversationId: string, status: 'delivered' | 'read'): void {
    this.send({
      type: 'message_status',
      messageId,
      conversationId,
      status,
    });
  }

  onMessage(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  offMessage(type: string): void {
    this.messageHandlers.delete(type);
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.isAuthenticated;
  }
}

export const websocketService = new WebSocketService();

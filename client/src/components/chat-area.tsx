import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Menu, Phone, Video, MoreVertical, Paperclip, Image, Mic, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Message, User } from "@shared/schema";
import MessageBubble from "./message-bubble";
import { useChat } from "@/hooks/use-chat";
import { format } from "date-fns";
import { MediaUpload } from "./media-upload";
import { useToast } from "@/hooks/use-toast";

interface ChatAreaProps {
  conversationId: string | null;
  onShowMobileSidebar: () => void;
}

interface MessageWithSender extends Message {
  sender: User;
}

export default function ChatArea({ conversationId, onShowMobileSidebar }: ChatAreaProps) {
  const { user } = useAuth();
  const [messageText, setMessageText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const { toast } = useToast();
  
  const { 
    sendMessage, 
    sendTypingStatus, 
    messages, 
    typingUsers, 
    isConnected 
  } = useChat(conversationId);

  const { data: conversationData } = useQuery({
    queryKey: ['/api/conversations'],
    enabled: !!conversationId,
  });

  const { data: messagesData = [] } = useQuery<MessageWithSender[]>({
    queryKey: ['/api/conversations', conversationId, 'messages'],
    enabled: !!conversationId,
  });

  // Combine server messages with real-time messages
  const allMessages = [...messagesData, ...messages];

  // Get conversation details
  const currentConversation = Array.isArray(conversationData) ? conversationData.find((c: any) => c.id === conversationId) : undefined;
  const otherParticipant = currentConversation?.participants?.find((p: User) => p.id !== user?.id);
  const displayName = currentConversation?.type === 'group' 
    ? currentConversation.name || 'Group Chat'
    : otherParticipant?.username || 'Unknown';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [allMessages]);

  const handleSendMessage = async () => {
    if ((!messageText.trim() && !selectedFile) || !conversationId) return;

    try {
      if (selectedFile) {
        // Handle media message
        await handleMediaMessage();
      } else {
        // Handle text message
        await sendMessage(messageText, 'text');
        setMessageText("");
      }
      
      // Stop typing indicator
      if (isTyping) {
        setIsTyping(false);
        sendTypingStatus(false);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleMediaMessage = async () => {
    if (!selectedFile || !conversationId) return;

    try {
      // Import encryption service
      const { encryptionService } = await import('@/lib/encryption');
      
      // Generate AES key for this media file
      const mediaKey = await encryptionService.generateAESKey();
      
      // Encrypt the file blob
      const { encryptedBlob, iv } = await encryptionService.encryptBlob(selectedFile, mediaKey);
      
      // Convert encrypted blob to base64 for transport (temporary solution)
      const reader = new FileReader();
      reader.onload = async () => {
        const encryptedBase64 = reader.result as string;
        const fileType = selectedFile.type.startsWith('image/') ? 'image' 
                        : selectedFile.type.startsWith('video/') ? 'video'
                        : selectedFile.type.startsWith('audio/') ? 'voice'
                        : 'file';

        // Store encrypted metadata (no plaintext file content)
        const encryptedMetadata = {
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileType: selectedFile.type,
          encryptedData: encryptedBase64,
          iv, // IV for decryption
          // No plaintext base64Data - security fix!
        };

        // Export the media key as base64 for inclusion in message encryption
        const mediaKeyRaw = await crypto.subtle.exportKey("raw", mediaKey);
        const mediaKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(mediaKeyRaw)));
        
        // Include media key in the message content for E2E encryption
        const messageContent = JSON.stringify({
          type: 'media',
          fileName: selectedFile.name,
          mediaKey: mediaKeyBase64 // This will be encrypted with message encryption
        });

        await sendMessage(
          messageContent, // Encrypted message content with media key
          fileType as any,
          encryptedMetadata // Encrypted file data
        );

        // Clear selected file and preview
        setSelectedFile(null);
        setFilePreview(null);
        
        toast({
          title: "Encrypted media sent",
          description: `${selectedFile.name} has been sent securely`,
        });
      };
      
      reader.readAsDataURL(encryptedBlob);
    } catch (error) {
      console.error('Failed to send encrypted media:', error);
      throw error;
    }
  };

  const handleFileSelect = (file: File, type: 'image' | 'video' | 'audio' | 'file') => {
    setSelectedFile(file);
    
    // Create preview for images
    if (type === 'image') {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFilePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }

    toast({
      title: "File selected",
      description: `${file.name} is ready to send`,
    });
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
  };

  const handleTyping = (text: string) => {
    setMessageText(text);

    if (!conversationId) return;

    // Send typing indicator
    if (!isTyping && text.length > 0) {
      setIsTyping(true);
      sendTypingStatus(true);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping) {
        setIsTyping(false);
        sendTypingStatus(false);
      }
    }, 3000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col bg-background">
        {/* Header with menu button for mobile */}
        <div className="bg-card border-b border-border p-4 md:p-4 safe-area-insets mobile-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={onShowMobileSidebar}
                className="md:hidden p-2 text-muted-foreground hover:text-foreground touch-target"
                data-testid="button-show-sidebar"
              >
                <Menu className="w-4 h-4" />
              </Button>
              <h3 className="font-semibold text-card-foreground">SecureChat</h3>
            </div>
          </div>
        </div>
        
        {/* Welcome content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <h3 className="text-lg font-medium text-foreground mb-2">Welcome to SecureChat</h3>
            <p className="text-muted-foreground mb-4">Select a conversation to start messaging</p>
            <Button
              onClick={onShowMobileSidebar}
              className="md:hidden"
              data-testid="button-open-conversations"
            >
              Open Conversations
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const groupMessagesByDate = (messages: MessageWithSender[]) => {
    const groups: { [date: string]: MessageWithSender[] } = {};
    
    messages.forEach(message => {
      const date = format(new Date(message.createdAt), 'yyyy-MM-dd');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
    });

    return groups;
  };

  const messageGroups = groupMessagesByDate(allMessages);
  const sortedDates = Object.keys(messageGroups).sort();

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Chat Header */}
      <div className="bg-card border-b border-border p-4 md:p-4 safe-area-insets mobile-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowMobileSidebar}
              className="md:hidden p-2 text-muted-foreground hover:text-foreground touch-target touch-area"
              data-testid="button-show-sidebar"
            >
              <Menu className="w-4 h-4" />
            </Button>
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-primary font-medium text-sm">{getInitials(displayName)}</span>
            </div>
            <div>
              <h3 className="font-semibold text-card-foreground" data-testid="text-conversation-title">
                {displayName}
              </h3>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                <span className="text-sm text-muted-foreground">
                  {typingUsers.length > 0 
                    ? `${typingUsers.map(u => u.username).join(', ')} typing...`
                    : `${isConnected ? 'Online' : 'Offline'} • End-to-end encrypted`
                  }
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              className="p-2 text-muted-foreground hover:text-foreground"
              data-testid="button-call"
            >
              <Phone className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="p-2 text-muted-foreground hover:text-foreground"
              data-testid="button-video"
            >
              <Video className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="p-2 text-muted-foreground hover:text-foreground"
              data-testid="button-more"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 mobile-scroll chat-scroll keyboard-safe" data-testid="messages-container">
        {sortedDates.map(date => (
          <div key={date}>
            {/* Date Separator */}
            <div className="flex justify-center mb-4">
              <span className="bg-muted text-muted-foreground text-xs px-3 py-1 rounded-full">
                {format(new Date(date), 'MMMM d, yyyy')}
              </span>
            </div>
            
            {/* Messages for this date */}
            {messageGroups[date].map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={message.sender.id === user?.id}
                showAvatar={
                  index === 0 || 
                  messageGroups[date][index - 1]?.sender.id !== message.sender.id
                }
                data-testid={`message-${message.id}`}
              />
            ))}
          </div>
        ))}

        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-end space-x-2">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-primary text-xs font-medium">
                {getInitials(typingUsers[0].username)}
              </span>
            </div>
            <div className="bg-card border border-border rounded-lg px-4 py-3">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="bg-card border-t border-border p-4 safe-area-insets mobile-spacing">
        {/* File preview */}
        {selectedFile && (
          <div className="mb-3 p-3 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {filePreview ? (
                  <img 
                    src={filePreview} 
                    alt="Preview" 
                    className="w-12 h-12 rounded object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 bg-primary/10 rounded flex items-center justify-center">
                    <Paperclip className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium truncate max-w-[200px]">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelectedFile}
                className="p-1"
                data-testid="button-clear-file"
              >
                ✕
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-end space-x-3">
          <MediaUpload onFileSelect={handleFileSelect} />
          
          <div className="flex-1 bg-input border border-border rounded-lg flex items-center">
            <Input
              type="text"
              placeholder={selectedFile ? "Add a caption..." : "Type a message..."}
              value={messageText}
              onChange={(e) => handleTyping(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 bg-transparent border-none focus:ring-0 mobile-chat-input"
              data-testid="input-message"
            />
            <Button
              variant="ghost"
              size="sm"
              className="p-2 text-muted-foreground hover:text-foreground touch-target touch-area"
              data-testid="button-voice"
            >
              <Mic className="w-5 h-5" />
            </Button>
          </div>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90 touch-target touch-area"
            onClick={handleSendMessage}
            disabled={!messageText.trim() && !selectedFile}
            data-testid="button-send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-center">
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span>Messages are end-to-end encrypted</span>
          </div>
        </div>
      </div>
    </div>
  );
}

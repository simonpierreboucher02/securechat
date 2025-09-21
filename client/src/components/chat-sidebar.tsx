import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { Shield, Search, Plus, Settings, Moon, Sun, X, UserPlus } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Conversation, User } from "@shared/schema";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ChatSidebarProps {
  selectedConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
  onShowSettings: () => void;
  isMobile: boolean;
  showMobileSidebar: boolean;
  onCloseMobileSidebar: () => void;
}

interface ConversationWithDetails extends Conversation {
  participants: Array<User>;
  lastMessage?: {
    id: string;
    encryptedContent: string;
    createdAt: string;
    sender: User;
  };
}

export default function ChatSidebar({
  selectedConversationId,
  onSelectConversation,
  onShowSettings,
  isMobile,
  showMobileSidebar,
  onCloseMobileSidebar,
}: ChatSidebarProps) {
  const { user, logoutMutation } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [newChatUsername, setNewChatUsername] = useState("");
  const { toast } = useToast();

  const { data: conversations = [], isLoading } = useQuery<ConversationWithDetails[]>({
    queryKey: ['/api/conversations'],
  });

  const createConversationMutation = useMutation({
    mutationFn: async (participantUsernames: string[]) => {
      const response = await apiRequest('POST', '/api/conversations', { participantUsernames });
      return response.json();
    },
    onSuccess: (newConversation) => {
      // Invalidate conversations to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      
      // Select the new conversation
      onSelectConversation(newConversation.id);
      
      // Close dialog and clear form
      setShowNewChatDialog(false);
      setNewChatUsername("");
      
      // Close mobile sidebar if open
      if (isMobile) onCloseMobileSidebar();
      
      toast({
        title: "Conversation created",
        description: "New conversation started successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create conversation",
        variant: "destructive",
      });
    },
  });

  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true;
    
    const otherParticipants = conv.participants.filter(p => p.id !== user?.id);
    const displayName = conv.type === 'group' 
      ? conv.name || `Group with ${otherParticipants.map(p => p.username).join(", ")}`
      : otherParticipants[0]?.username || 'Unknown';
    
    return displayName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getConversationDisplayName = (conv: ConversationWithDetails) => {
    if (conv.type === 'group') {
      return conv.name || `Group Chat`;
    }
    const otherParticipant = conv.participants.find(p => p.id !== user?.id);
    return otherParticipant?.username || 'Unknown';
  };

  const getLastMessagePreview = (conv: ConversationWithDetails) => {
    if (!conv.lastMessage) return "No messages yet";
    
    // For now, show encrypted content indicator
    const senderName = conv.lastMessage.sender.id === user?.id 
      ? "You" 
      : conv.lastMessage.sender.username;
    
    return `${senderName}: [Encrypted message]`;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'h:mm a');
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleCreateConversation = async () => {
    if (!newChatUsername.trim()) {
      toast({
        title: "Error",
        description: "Please enter a username",
        variant: "destructive",
      });
      return;
    }

    createConversationMutation.mutate([newChatUsername.trim()]);
  };

  const sidebarContent = (
    <div className={`${isMobile ? 'w-80' : 'w-80'} bg-card border-r border-border flex flex-col h-full safe-area-insets`}>
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-semibold text-card-foreground" data-testid="text-username">
                {user?.username}
              </h2>
              <p className="text-xs text-muted-foreground">End-to-end encrypted</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {isMobile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCloseMobileSidebar}
                className="p-2"
                data-testid="button-close-sidebar"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="p-2 text-muted-foreground hover:text-foreground"
              data-testid="button-toggle-theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowSettings}
              className="p-2 text-muted-foreground hover:text-foreground"
              data-testid="button-settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">Loading conversations...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </div>
          ) : (
            filteredConversations.map((conversation) => {
              const displayName = getConversationDisplayName(conversation);
              const initials = getInitials(displayName);
              const isSelected = selectedConversationId === conversation.id;

              return (
                <Button
                  key={conversation.id}
                  variant="ghost"
                  className={`w-full p-3 h-auto rounded-lg hover:bg-accent transition-colors text-left justify-start touch-control mobile-conversation-item ${
                    isSelected ? 'bg-accent' : ''
                  }`}
                  onClick={() => {
                    onSelectConversation(conversation.id);
                    if (isMobile) onCloseMobileSidebar();
                  }}
                  data-testid={`button-conversation-${conversation.id}`}
                >
                  <div className="flex items-center space-x-3 w-full">
                    <div className="relative">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-primary font-medium text-sm">{initials}</span>
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-card"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-card-foreground truncate" data-testid={`text-conversation-name-${conversation.id}`}>
                          {displayName}
                        </h3>
                        {conversation.lastMessage && (
                          <span className="text-xs text-muted-foreground">
                            {formatTime(conversation.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-sm text-muted-foreground truncate" data-testid={`text-last-message-${conversation.id}`}>
                          {getLastMessagePreview(conversation)}
                        </p>
                        <div className="flex items-center space-x-1">
                          <Shield className="w-3 h-3 text-primary" />
                        </div>
                      </div>
                    </div>
                  </div>
                </Button>
              );
            })
          )}
        </div>
      </div>

      {/* New Chat Button */}
      <div className="p-4 border-t border-border">
        <Button
          className="w-full"
          onClick={() => setShowNewChatDialog(true)}
          data-testid="button-new-chat"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>
    </div>
  );

  const newChatDialog = (
    <Dialog open={showNewChatDialog} onOpenChange={setShowNewChatDialog}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <UserPlus className="w-5 h-5" />
            <span>Start New Conversation</span>
          </DialogTitle>
          <DialogDescription>
            Enter the username of the person you want to chat with.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              Username
            </Label>
            <Input
              id="username"
              value={newChatUsername}
              onChange={(e) => setNewChatUsername(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateConversation()}
              className="col-span-3"
              placeholder="Enter username"
              disabled={createConversationMutation.isPending}
              data-testid="input-new-chat-username"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setShowNewChatDialog(false)}
            disabled={createConversationMutation.isPending}
            data-testid="button-cancel-new-chat"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateConversation}
            disabled={createConversationMutation.isPending || !newChatUsername.trim()}
            data-testid="button-create-conversation"
          >
            {createConversationMutation.isPending ? "Creating..." : "Start Chat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isMobile) {
    return (
      <>
        {newChatDialog}
        {showMobileSidebar ? (
          <div 
            className="fixed inset-0 bg-background/50 backdrop-blur-sm z-40 md:hidden flex"
            onClick={onCloseMobileSidebar}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div 
              className="w-80 h-full"
              onClick={(e) => e.stopPropagation()}
            >
              {sidebarContent}
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      {newChatDialog}
      {sidebarContent}
    </>
  );
}

import { useState } from "react";
import ChatSidebar from "@/components/chat-sidebar";
import ChatArea from "@/components/chat-area";
import SettingsPanel from "@/components/settings-panel";
import { useIsMobile } from "@/hooks/use-mobile";

export default function ChatPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const isMobile = useIsMobile();

  return (
    <div className="flex h-screen overflow-hidden bg-background mobile-viewport" data-testid="chat-page">
      {/* Desktop Sidebar or Mobile Overlay */}
      {(!isMobile || showMobileSidebar) && (
        <ChatSidebar
          selectedConversationId={selectedConversationId}
          onSelectConversation={setSelectedConversationId}
          onShowSettings={() => setShowSettings(true)}
          isMobile={isMobile}
          showMobileSidebar={showMobileSidebar}
          onCloseMobileSidebar={() => setShowMobileSidebar(false)}
          data-testid="chat-sidebar"
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        <ChatArea
          conversationId={selectedConversationId}
          onShowMobileSidebar={() => setShowMobileSidebar(true)}
          data-testid="chat-area"
        />
      </div>

      {/* Settings Panel Overlay */}
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          data-testid="settings-panel"
        />
      )}
    </div>
  );
}

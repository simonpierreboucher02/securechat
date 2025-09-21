import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Check, CheckCheck, Lock, FileIcon, Image, Video, Music, Download } from "lucide-react";
import { Message, User } from "@shared/schema";
import { Button } from "@/components/ui/button";

interface MessageBubbleProps {
  message: Message & { sender: User };
  isOwn: boolean;
  showAvatar: boolean;
}

export default function MessageBubble({ message, isOwn, showAvatar }: MessageBubbleProps) {
  const formatTime = (dateString: string) => {
    return format(new Date(dateString), 'h:mm a');
  };

  const getInitials = (username: string) => {
    return username.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Decrypt message content
  const [decryptedContent, setDecryptedContent] = useState<string>("");
  const [isDecrypting, setIsDecrypting] = useState(true);

  useEffect(() => {
    const decryptMessage = async () => {
      try {
        if (!message.encryptedContent) {
          setDecryptedContent("Message content unavailable");
          setIsDecrypting(false);
          return;
        }

        // Try to parse as new encrypted format
        let encryptedData;
        try {
          encryptedData = JSON.parse(message.encryptedContent);
        } catch (e) {
          // Old format or plain text for demo
          if (message.encryptedContent.startsWith('[ENCRYPTED]')) {
            setDecryptedContent(message.encryptedContent.substring(11));
          } else {
            setDecryptedContent(message.encryptedContent);
          }
          setIsDecrypting(false);
          return;
        }

        // Get user's private key from localStorage
        const username = localStorage.getItem('currentUsername'); // We'll need to set this during login
        if (!username) {
          setDecryptedContent("Unable to decrypt: user not found");
          setIsDecrypting(false);
          return;
        }

        const privateKeyData = localStorage.getItem(`privateKey_${username}`);
        if (!privateKeyData) {
          setDecryptedContent("Unable to decrypt: private key not found");
          setIsDecrypting(false);
          return;
        }

        const { encryptionService } = await import('@/lib/encryption');
        
        // Import private key and get current user ID
        const privateKey = await encryptionService.importPrivateKey(privateKeyData);
        const currentUserId = localStorage.getItem('currentUserId');
        
        if (!currentUserId || !encryptedData.encryptedKeys[currentUserId]) {
          setDecryptedContent("Unable to decrypt: key not available for this user");
          setIsDecrypting(false);
          return;
        }

        // Decrypt the message key with our private key
        const messageKey = await encryptionService.decryptAESKey(
          encryptedData.encryptedKeys[currentUserId], 
          privateKey
        );
        
        // Decrypt the message content
        const content = await encryptionService.decryptMessage(
          encryptedData.encryptedData, 
          encryptedData.iv, 
          messageKey
        );
        
        setDecryptedContent(content);
      } catch (error) {
        console.error('Failed to decrypt message:', error);
        setDecryptedContent("Failed to decrypt message");
      } finally {
        setIsDecrypting(false);
      }
    };

    decryptMessage();
  }, [message.encryptedContent]);

  const displayContent = isDecrypting ? "Decrypting..." : decryptedContent;

  // Decrypt and render media content from encrypted metadata
  const [decryptedMediaUrl, setDecryptedMediaUrl] = useState<string | null>(null);
  const [mediaDecryptionStatus, setMediaDecryptionStatus] = useState<'idle' | 'decrypting' | 'success' | 'error'>('idle');

  useEffect(() => {
    const decryptMedia = async () => {
      if (!message.metadata || message.messageType === 'text') return;
      if (!decryptedContent || decryptedContent === "Decrypting...") return;

      const metadata = message.metadata as any;
      if (!metadata.encryptedData || !metadata.iv) return;

      try {
        setMediaDecryptionStatus('decrypting');

        // Parse the decrypted message content to get media key
        let mediaInfo;
        try {
          mediaInfo = JSON.parse(decryptedContent);
        } catch (e) {
          // Old format or not JSON - skip media decryption
          setMediaDecryptionStatus('error');
          return;
        }

        if (mediaInfo.type !== 'media' || !mediaInfo.mediaKey) {
          setMediaDecryptionStatus('error');
          return;
        }

        // Import encryption service
        const { encryptionService } = await import('@/lib/encryption');
        
        // Reconstruct media key from base64
        const mediaKeyBytes = Uint8Array.from(atob(mediaInfo.mediaKey), c => c.charCodeAt(0));
        const mediaKey = await crypto.subtle.importKey(
          "raw",
          mediaKeyBytes,
          { name: "AES-GCM" },
          false,
          ["encrypt", "decrypt"]
        );

        // Convert encrypted base64 back to blob
        const response = await fetch(metadata.encryptedData);
        const encryptedBlob = await response.blob();

        // Decrypt the media blob
        const decryptedBlob = await encryptionService.decryptBlob(
          encryptedBlob, 
          metadata.iv, 
          mediaKey
        );

        // Create object URL for decrypted content
        const blobUrl = URL.createObjectURL(new Blob([decryptedBlob], { type: metadata.fileType }));
        setDecryptedMediaUrl(blobUrl);
        setMediaDecryptionStatus('success');

        // Cleanup URL when component unmounts
        return () => {
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
          }
        };

      } catch (error) {
        console.error('Failed to decrypt media:', error);
        setMediaDecryptionStatus('error');
      }
    };

    decryptMedia();
  }, [message.metadata, decryptedContent, message.messageType]);

  const renderMediaContent = () => {
    if (!message.metadata || message.messageType === 'text') return null;

    const metadata = message.metadata as any;
    
    if (mediaDecryptionStatus === 'decrypting') {
      return (
        <div className="mt-2 p-3 bg-opacity-20 bg-white rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full"></div>
            <p className="text-sm">Decrypting media...</p>
          </div>
        </div>
      );
    }

    if (mediaDecryptionStatus === 'error') {
      return (
        <div className="mt-2 p-3 bg-opacity-20 bg-red-500 rounded-lg">
          <div className="flex items-center space-x-3">
            <Lock className="w-5 h-5" />
            <div>
              <p className="text-sm font-medium">Encrypted Media</p>
              <p className="text-xs opacity-70">
                {metadata.fileName} ({metadata.fileSize ? `${(metadata.fileSize / 1024 / 1024).toFixed(2)} MB` : 'File'})
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (mediaDecryptionStatus === 'success' && decryptedMediaUrl) {
      if (message.messageType === 'image') {
        return (
          <div className="mt-2">
            <img 
              src={decryptedMediaUrl} 
              alt={metadata.fileName || "Image"}
              className="max-w-full rounded-lg cursor-pointer hover:opacity-90"
              style={{ maxHeight: '300px', objectFit: 'contain' }}
              onClick={() => window.open(decryptedMediaUrl, '_blank')}
            />
            {metadata.fileName && (
              <p className="text-xs mt-1 opacity-70">{metadata.fileName}</p>
            )}
          </div>
        );
      }

      if (message.messageType === 'video') {
        return (
          <div className="mt-2">
            <video 
              controls
              className="max-w-full rounded-lg"
              style={{ maxHeight: '300px' }}
            >
              <source src={decryptedMediaUrl} type={metadata.fileType} />
              Your browser does not support video playback.
            </video>
            {metadata.fileName && (
              <p className="text-xs mt-1 opacity-70">{metadata.fileName}</p>
            )}
          </div>
        );
      }

      if (message.messageType === 'voice') {
        return (
          <div className="mt-2 p-3 bg-opacity-20 bg-white rounded-lg">
            <div className="flex items-center space-x-3">
              <Music className="w-5 h-5" />
              <div className="flex-1">
                <audio controls className="w-full">
                  <source src={decryptedMediaUrl} type={metadata.fileType} />
                  Your browser does not support audio playbook.
                </audio>
                {metadata.fileName && (
                  <p className="text-xs mt-1 opacity-70">{metadata.fileName}</p>
                )}
              </div>
            </div>
          </div>
        );
      }

      // Generic file with download
      const getFileIcon = (fileType: string) => {
        if (fileType.startsWith('image/')) return <Image className="w-5 h-5" />;
        if (fileType.startsWith('video/')) return <Video className="w-5 h-5" />;
        if (fileType.startsWith('audio/')) return <Music className="w-5 h-5" />;
        return <FileIcon className="w-5 h-5" />;
      };

      return (
        <div className="mt-2 p-3 bg-opacity-20 bg-white rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              {getFileIcon(metadata.fileType || '')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{metadata.fileName}</p>
              <p className="text-xs opacity-70">
                {metadata.fileSize ? `${(metadata.fileSize / 1024 / 1024).toFixed(2)} MB` : 'File'}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const link = document.createElement('a');
                link.href = decryptedMediaUrl;
                link.download = metadata.fileName;
                link.click();
              }}
              className="flex-shrink-0"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      );
    }

    return null;
  };

  if (isOwn) {
    // Sent message
    return (
      <div className="flex items-end justify-end space-x-2" data-testid="message-sent">
        <div className="max-w-xs lg:max-w-md bg-primary text-primary-foreground rounded-lg px-4 py-2 mobile-message-bubble message-bubble sent">
          {message.messageType === 'text' && (
            <p data-testid="message-content" className="message-content">{displayContent}</p>
          )}
          {message.messageType !== 'text' && displayContent && displayContent !== "Decrypting..." && (
            <p className="text-sm opacity-90 mb-1">{displayContent}</p>
          )}
          {renderMediaContent()}
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-primary-foreground/70" data-testid="message-time">
              {formatTime(message.createdAt.toString())}
            </span>
            <div className="flex items-center space-x-1">
              <Lock className="w-3 h-3 text-primary-foreground/70" />
              <CheckCheck className="w-3 h-3 text-primary-foreground/70" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Received message
  return (
    <div className="flex items-end space-x-2" data-testid="message-received">
      {showAvatar && (
        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center touch-target">
          <span className="text-primary text-xs font-medium">
            {getInitials(message.sender.username)}
          </span>
        </div>
      )}
      {!showAvatar && <div className="w-8"></div>}
      <div className="max-w-xs lg:max-w-md bg-card border border-border rounded-lg px-4 py-2 mobile-message-bubble message-bubble">
        {message.messageType === 'text' && (
          <p className="text-card-foreground message-content" data-testid="message-content">{displayContent}</p>
        )}
        {message.messageType !== 'text' && displayContent && displayContent !== "Decrypting..." && (
          <p className="text-sm text-muted-foreground mb-1">{displayContent}</p>
        )}
        {renderMediaContent()}
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground" data-testid="message-time">
            {formatTime(message.createdAt.toString())}
          </span>
          <Lock className="w-3 h-3 text-primary" />
        </div>
      </div>
    </div>
  );
}

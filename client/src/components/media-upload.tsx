import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Paperclip, Image, Mic, Video } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface MediaUploadProps {
  onFileSelect: (file: File, type: 'image' | 'video' | 'audio' | 'file') => void;
}

export function MediaUpload({ onFileSelect }: MediaUploadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
    type: 'image' | 'video' | 'audio' | 'file'
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file, type);
      setIsOpen(false);
      // Reset input
      event.target.value = '';
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' }
      });
      
      // Create a simple camera capture interface
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.style.maxWidth = '100%';
      video.style.borderRadius = '8px';

      // Create capture button
      const captureBtn = document.createElement('button');
      captureBtn.textContent = 'Capture Photo';
      captureBtn.className = 'w-full mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90';
      
      captureBtn.onclick = () => {
        // Create canvas to capture frame
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0);
        
        // Convert to blob and trigger file selection
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
            onFileSelect(file, 'image');
          }
        }, 'image/jpeg', 0.8);
        
        // Stop stream and close
        stream.getTracks().forEach(track => track.stop());
        dialog.remove();
        setIsOpen(false);
      };

      // Create dialog container
      const dialog = document.createElement('div');
      dialog.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      dialog.onclick = (e) => {
        if (e.target === dialog) {
          stream.getTracks().forEach(track => track.stop());
          dialog.remove();
          setIsOpen(false);
        }
      };

      const content = document.createElement('div');
      content.className = 'bg-background p-4 rounded-lg max-w-md w-full';
      content.appendChild(video);
      content.appendChild(captureBtn);
      dialog.appendChild(content);
      
      document.body.appendChild(dialog);

    } catch (error) {
      console.error('Camera access error:', error);
      alert('Could not access camera. Please check permissions.');
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="*"
        onChange={(e) => handleFileSelect(e, 'file')}
        style={{ display: 'none' }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFileSelect(e, 'image')}
        style={{ display: 'none' }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={(e) => handleFileSelect(e, 'video')}
        style={{ display: 'none' }}
      />

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost" 
            size="sm"
            className="p-2 text-muted-foreground hover:text-foreground touch-target"
            data-testid="button-media-upload"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => imageInputRef.current?.click()}
              className="flex flex-col items-center p-3 h-auto"
              data-testid="button-select-image"
            >
              <Image className="w-5 h-5 mb-1" />
              <span className="text-xs">Photo</span>
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={startCamera}
              className="flex flex-col items-center p-3 h-auto"
              data-testid="button-camera"
            >
              <Camera className="w-5 h-5 mb-1" />
              <span className="text-xs">Camera</span>
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => videoInputRef.current?.click()}
              className="flex flex-col items-center p-3 h-auto"
              data-testid="button-select-video"
            >
              <Video className="w-5 h-5 mb-1" />
              <span className="text-xs">Video</span>
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center p-3 h-auto"
              data-testid="button-select-file"
            >
              <Paperclip className="w-5 h-5 mb-1" />
              <span className="text-xs">File</span>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
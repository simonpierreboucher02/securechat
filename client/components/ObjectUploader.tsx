import React, { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ObjectUploaderProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxFileSize?: number;
  buttonClassName?: string;
  children: ReactNode;
}

/**
 * Simple file upload component for media messages
 */
export function ObjectUploader({
  onFileSelect,
  accept = "image/*,video/*,audio/*,.pdf,.doc,.docx",
  maxFileSize = 10485760, // 10MB default
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxFileSize) {
      alert(`File size must be less than ${Math.round(maxFileSize / 1024 / 1024)}MB`);
      return;
    }

    onFileSelect(file);
    // Reset input
    e.target.value = '';
  };

  return (
    <>
      <input
        type="file"
        accept={accept}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        id="file-upload-input"
      />
      <Button 
        onClick={() => document.getElementById('file-upload-input')?.click()}
        className={buttonClassName}
        type="button"
      >
        {children}
      </Button>
    </>
  );
}
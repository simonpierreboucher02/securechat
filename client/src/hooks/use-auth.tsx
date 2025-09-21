import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser, UserWithRecoveryKey } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<UserWithRecoveryKey, Error, InsertUser>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      return await res.json();
    },
    onSuccess: async (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      // Store user data for encryption
      localStorage.setItem('currentUserId', user.id);
      localStorage.setItem('currentUsername', user.username);
      
      // Check if we have a private key for this user
      const existingPrivateKey = localStorage.getItem(`privateKey_${user.username}`);
      
      console.log('🔑 Key management check:', {
        username: user.username,
        hasLocalPrivateKey: !!existingPrivateKey,
        hasServerPublicKey: !!user.publicKey,
        userPublicKey: user.publicKey ? 'present' : 'missing'
      });
      
      if (!existingPrivateKey && user.publicKey) {
        // User has a public key in database but no private key locally
        // This suggests the user is logging in from a different device or cleared storage
        console.log('⚠️ Private key missing for existing user');
        toast({
          title: "Encryption key missing",
          description: "Your private encryption key is not available on this device. Messages cannot be decrypted without it.",
          variant: "destructive",
        });
      } else if (!existingPrivateKey && !user.publicKey) {
        // User has no encryption keys at all - generate them now
        console.log('🔄 Generating new encryption keys for user without keys');
        try {
          const { encryptionService } = await import('@/lib/encryption');
          const keyPair = await encryptionService.generateKeyPair();
          const publicKey = await encryptionService.exportPublicKey(keyPair.publicKey);
          const privateKey = await encryptionService.exportPrivateKey(keyPair.privateKey);
          
          console.log('✅ Keys generated, storing locally and updating server');
          
          // Store private key locally
          localStorage.setItem(`privateKey_${user.username}`, privateKey);
          
          // Update user's public key on server
          await apiRequest("POST", "/api/user/update-keys", { publicKey });
          
          console.log('✅ Keys successfully stored and server updated');
          
          toast({
            title: "Encryption keys generated",
            description: "Your encryption keys have been created for secure messaging.",
          });
        } catch (error) {
          console.error('❌ Failed to generate encryption keys:', error);
          toast({
            title: "Key generation failed",
            description: "Could not create encryption keys. Secure messaging may not work.",
            variant: "destructive",
          });
        }
      } else if (existingPrivateKey) {
        console.log('✅ User has existing private key, encryption ready');
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const res = await apiRequest("POST", "/api/register", credentials);
      return await res.json();
    },
    onSuccess: (user: UserWithRecoveryKey) => {
      // Remove recovery key before storing in cache (for security)
      const { recoveryKey, ...userForCache } = user;
      queryClient.setQueryData(["/api/user"], userForCache);
      // Store user data for encryption
      localStorage.setItem('currentUserId', user.id);
      localStorage.setItem('currentUsername', user.username);
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      // Clear stored user data and encryption keys for security
      const currentUsername = localStorage.getItem('currentUsername');
      if (currentUsername) {
        localStorage.removeItem(`privateKey_${currentUsername}`);
      }
      localStorage.removeItem('currentUserId');
      localStorage.removeItem('currentUsername');
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

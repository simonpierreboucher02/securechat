import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/components/theme-provider";
import { Shield, Moon, Sun, Key } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertUserSchema, loginSchema, recoverySchema } from "@shared/schema";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { encryptionService } from "@/lib/encryption";

type AuthMode = 'login' | 'signup' | 'recovery';

const signupSchema = insertUserSchema.extend({
  confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<AuthMode>('login');
  const [recoveryKey, setRecoveryKey] = useState<string>('');
  const [showRecoveryKey, setShowRecoveryKey] = useState<boolean>(false);
  const [blockRedirect, setBlockRedirect] = useState<boolean>(false);
  
  // Redirect if already authenticated - BUT don't redirect if we need to show recovery key first OR if blocked
  useEffect(() => {
    if (user && !showRecoveryKey && !blockRedirect) {
      setLocation('/');
    }
  }, [user, showRecoveryKey, blockRedirect, setLocation]);

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const signupForm = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      username: '',
      password: '',
      confirmPassword: '',
    },
  });

  const recoveryForm = useForm({
    resolver: zodResolver(recoverySchema),
    defaultValues: {
      username: '',
      recoveryKey: '',
      newPassword: '',
    },
  });

  const recoveryMutation = useMutation({
    mutationFn: async (data: z.infer<typeof recoverySchema>) => {
      const res = await apiRequest("POST", "/api/recovery", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Password reset successful",
        description: "You can now login with your new password",
      });
      setMode('login');
      recoveryForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Recovery failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onLogin = (data: z.infer<typeof loginSchema>) => {
    loginMutation.mutate(data);
  };

  const onSignup = async (data: z.infer<typeof signupSchema>) => {
    const { confirmPassword, ...signupData } = data;
    // Block redirect until user acknowledges recovery key
    setBlockRedirect(true);
    
    try {
      // Generate encryption keys on client side (E2EE)
      const keyPair = await encryptionService.generateKeyPair();
      const publicKey = await encryptionService.exportPublicKey(keyPair.publicKey);
      const privateKey = await encryptionService.exportPrivateKey(keyPair.privateKey);
      
      // Store private key securely in localStorage (encrypted in production)
      localStorage.setItem(`privateKey_${signupData.username}`, privateKey);
      
      // Only send public key to server (never private key)
      const registrationData = {
        ...signupData,
        publicKey
      };
      
      registerMutation.mutate(registrationData, {
        onSuccess: (user) => {
          // Show recovery key to user
          setRecoveryKey(user.recoveryKey || '');
          setShowRecoveryKey(true);
          toast({
            title: "Account created successfully!",
            description: "Please save your recovery key securely",
          });
        },
      });
    } catch (error) {
      toast({
        title: "Key generation failed",
        description: "Please try again",
        variant: "destructive",
      });
      setBlockRedirect(false);
    }
  };

  const onRecovery = (data: z.infer<typeof recoverySchema>) => {
    recoveryMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/10 p-4 safe-area-insets" data-testid="auth-page">
      <div className="w-full max-w-md space-y-8 mobile-spacing">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-primary rounded-2xl">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">SecureChat</h1>
          <p className="mt-2 text-muted-foreground">End-to-end encrypted messaging</p>
        </div>

        <Card className="shadow-lg touch-area" data-testid="auth-card">
          <CardContent className="pt-6 mobile-spacing">
            {/* Recovery Key Display */}
            {recoveryKey && (
              <div className="mb-6 p-4 bg-accent/50 border border-accent rounded-lg">
                <div className="flex items-start space-x-3">
                  <Key className="w-5 h-5 text-primary mt-1" />
                  <div>
                    <h4 className="font-medium text-accent-foreground">Your Recovery Key</h4>
                    <p className="text-sm text-muted-foreground mt-1 mb-3">
                      Save this key securely - it's your only way to recover your account without a password.
                    </p>
                    <div className="bg-background p-3 rounded border font-mono text-sm break-all">
                      {recoveryKey}
                    </div>
                    <Button
                      className="mt-3 w-full"
                      onClick={() => {
                        navigator.clipboard.writeText(recoveryKey);
                        toast({ title: "Recovery key copied to clipboard" });
                      }}
                      data-testid="copy-recovery-key"
                    >
                      Copy to Clipboard
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Login Form */}
            {mode === 'login' && (
              <div data-testid="login-form">
                <h2 className="text-xl font-semibold mb-6 text-center text-card-foreground">Sign In</h2>
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter your username"
                              data-testid="input-username"
                              className="touch-target mobile-chat-input"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Enter your password"
                              data-testid="input-password"
                              className="touch-target mobile-chat-input"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={loginMutation.isPending}
                      data-testid="button-signin"
                    >
                      {loginMutation.isPending ? "Signing in..." : "Sign In"}
                    </Button>
                  </form>
                </Form>

                <div className="mt-6 text-center">
                  <Button
                    variant="link"
                    onClick={() => setMode('recovery')}
                    className="text-primary hover:text-primary/80 text-sm font-medium"
                    data-testid="link-recovery"
                  >
                    Lost password? Use recovery key
                  </Button>
                </div>

                <div className="mt-4 text-center">
                  <span className="text-muted-foreground text-sm">Don't have an account? </span>
                  <Button
                    variant="link"
                    onClick={() => setMode('signup')}
                    className="text-primary hover:text-primary/80 text-sm font-medium p-0"
                    data-testid="link-signup"
                  >
                    Sign up
                  </Button>
                </div>
              </div>
            )}

            {/* Signup Form */}
            {mode === 'signup' && (
              <div data-testid="signup-form">
                <h2 className="text-xl font-semibold mb-6 text-center text-card-foreground">Create Account</h2>
                <Form {...signupForm}>
                  <form onSubmit={signupForm.handleSubmit(onSignup)} className="space-y-4">
                    <FormField
                      control={signupForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Choose a username"
                              data-testid="input-new-username"
                              className="touch-target mobile-chat-input"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={signupForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Create a strong password"
                              data-testid="input-new-password"
                              className="touch-target mobile-chat-input"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={signupForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Confirm your password"
                              data-testid="input-confirm-password"
                              className="touch-target mobile-chat-input"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="bg-accent/50 border border-accent rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <Key className="w-5 h-5 text-primary mt-1" />
                        <div>
                          <h4 className="font-medium text-accent-foreground">Recovery Key</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Your recovery key will be generated after account creation. Save it securely - it's your only way to recover your account without a password.
                          </p>
                        </div>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={registerMutation.isPending}
                      data-testid="button-create-account"
                    >
                      {registerMutation.isPending ? "Creating Account..." : "Create Account"}
                    </Button>
                  </form>
                </Form>

                <div className="mt-6 text-center">
                  <span className="text-muted-foreground text-sm">Already have an account? </span>
                  <Button
                    variant="link"
                    onClick={() => setMode('login')}
                    className="text-primary hover:text-primary/80 text-sm font-medium p-0"
                    data-testid="link-signin"
                  >
                    Sign in
                  </Button>
                </div>
              </div>
            )}

            {/* Recovery Form */}
            {mode === 'recovery' && (
              <div data-testid="recovery-form">
                <h2 className="text-xl font-semibold mb-6 text-center text-card-foreground">Account Recovery</h2>
                <Form {...recoveryForm}>
                  <form onSubmit={recoveryForm.handleSubmit(onRecovery)} className="space-y-4">
                    <FormField
                      control={recoveryForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter your username"
                              data-testid="input-recovery-username"
                              className="touch-target mobile-chat-input"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={recoveryForm.control}
                      name="recoveryKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Recovery Key</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Enter your recovery key"
                              rows={3}
                              data-testid="input-recovery-key"
                              className="touch-target mobile-chat-input"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground">
                            This is the recovery key you saved when creating your account
                          </p>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={recoveryForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Enter new password"
                              data-testid="input-new-password-recovery"
                              className="touch-target mobile-chat-input"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={recoveryMutation.isPending}
                      data-testid="button-recover-account"
                    >
                      {recoveryMutation.isPending ? "Recovering..." : "Recover Account"}
                    </Button>
                  </form>
                </Form>

                <div className="mt-6 text-center">
                  <Button
                    variant="link"
                    onClick={() => setMode('login')}
                    className="text-primary hover:text-primary/80 text-sm font-medium"
                    data-testid="link-back-to-login"
                  >
                    Back to login
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recovery Key Display */}
        {showRecoveryKey && recoveryKey && (
          <Card className="w-full max-w-md bg-card/50 backdrop-blur-sm border-border/50 shadow-2xl">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                <Key className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl font-bold text-card-foreground">
                Account Created Successfully!
              </CardTitle>
              <p className="text-muted-foreground">
                Please save your recovery key securely. This is the only time it will be shown.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Your Recovery Key</Label>
                <div className="relative">
                  <Textarea
                    value={recoveryKey}
                    readOnly
                    className="min-h-[100px] bg-muted/50 border-2 font-mono text-sm resize-none"
                    data-testid="text-recovery-key"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      navigator.clipboard.writeText(recoveryKey);
                      toast({
                        title: "Copied!",
                        description: "Recovery key copied to clipboard",
                      });
                    }}
                    data-testid="button-copy-recovery-key"
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-900/50">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    ⚠️ <strong>Important:</strong> Save this key in a secure location. It's needed to recover your account if you forget your password.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setShowRecoveryKey(false); // Clear recovery key display
                    setBlockRedirect(false); // Allow redirect
                    setLocation('/'); // Navigate to chat
                  }}
                  className="w-full"
                  data-testid="button-continue-to-chat"
                >
                  Continue to SecureChat
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Theme Toggle */}
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="flex items-center space-x-2 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-toggle-theme"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            <span className="text-sm">Toggle theme</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

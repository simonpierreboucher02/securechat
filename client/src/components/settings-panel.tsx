import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { X, Key, Shield, Lock, Bell, Download, ExternalLink } from "lucide-react";

interface SettingsPanelProps {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { user, logoutMutation } = useAuth();

  const handleLogout = () => {
    logoutMutation.mutate();
    onClose();
  };

  const getInitials = (username: string) => {
    return username.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="fixed inset-0 bg-background/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-testid="settings-overlay">
      <Card className="w-full max-w-md max-h-[80vh] overflow-y-auto shadow-xl">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle>Settings</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground"
              data-testid="button-close-settings"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Profile Section */}
          <div>
            <h3 className="font-medium text-card-foreground mb-4">Profile</h3>
            <div className="flex items-center space-x-4 mb-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                <span className="text-primary-foreground text-xl font-medium">
                  {user ? getInitials(user.username) : 'U'}
                </span>
              </div>
              <div>
                <p className="font-medium text-card-foreground" data-testid="text-profile-username">
                  {user?.username}
                </p>
                <p className="text-sm text-muted-foreground">
                  Active since {user ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-primary hover:text-primary/80"
              data-testid="button-change-profile"
            >
              Change Profile Picture
            </Button>
          </div>

          {/* Security Section */}
          <div>
            <h3 className="font-medium text-card-foreground mb-4">Security</h3>
            <div className="space-y-3">
              <Button
                variant="ghost"
                className="w-full justify-start p-3 h-auto hover:bg-accent"
                data-testid="button-change-password"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center space-x-3">
                    <Key className="w-5 h-5 text-primary" />
                    <div className="text-left">
                      <p className="font-medium text-card-foreground">Change Password</p>
                      <p className="text-sm text-muted-foreground">Update your account password</p>
                    </div>
                  </div>
                  <div className="w-4 h-4 border-t-2 border-r-2 border-muted-foreground transform rotate-45"></div>
                </div>
              </Button>

              <Button
                variant="ghost"
                className="w-full justify-start p-3 h-auto hover:bg-accent"
                data-testid="button-recovery-key"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center space-x-3">
                    <Shield className="w-5 h-5 text-primary" />
                    <div className="text-left">
                      <p className="font-medium text-card-foreground">Recovery Key</p>
                      <p className="text-sm text-muted-foreground">View or regenerate recovery key</p>
                    </div>
                  </div>
                  <div className="w-4 h-4 border-t-2 border-r-2 border-muted-foreground transform rotate-45"></div>
                </div>
              </Button>

              <Button
                variant="ghost"
                className="w-full justify-start p-3 h-auto hover:bg-accent"
                data-testid="button-encryption-keys"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center space-x-3">
                    <Lock className="w-5 h-5 text-primary" />
                    <div className="text-left">
                      <p className="font-medium text-card-foreground">Encryption Keys</p>
                      <p className="text-sm text-muted-foreground">Manage encryption settings</p>
                    </div>
                  </div>
                  <div className="w-4 h-4 border-t-2 border-r-2 border-muted-foreground transform rotate-45"></div>
                </div>
              </Button>
            </div>
          </div>

          {/* Preferences Section */}
          <div>
            <h3 className="font-medium text-card-foreground mb-4">Preferences</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors">
                <div className="flex items-center space-x-3">
                  <Bell className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-card-foreground">Notifications</p>
                    <p className="text-sm text-muted-foreground">Enable push notifications</p>
                  </div>
                </div>
                <Switch defaultChecked data-testid="switch-notifications" />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors">
                <div className="flex items-center space-x-3">
                  <Download className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-card-foreground">Auto-download</p>
                    <p className="text-sm text-muted-foreground">Automatically download media</p>
                  </div>
                </div>
                <Switch data-testid="switch-auto-download" />
              </div>
            </div>
          </div>

          {/* About Section */}
          <div>
            <h3 className="font-medium text-card-foreground mb-4">About</h3>
            <div className="space-y-3">
              <div className="p-3 bg-accent/50 rounded-lg">
                <p className="text-sm text-accent-foreground">SecureChat v1.0.0</p>
                <p className="text-xs text-muted-foreground mt-1">End-to-end encrypted messaging platform</p>
              </div>
              
              <Button
                variant="ghost"
                className="w-full justify-between p-3 h-auto hover:bg-accent"
                data-testid="button-privacy-policy"
              >
                <span className="text-card-foreground">Privacy Policy</span>
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </Button>
              
              <Button
                variant="ghost"
                className="w-full justify-between p-3 h-auto hover:bg-accent"
                data-testid="button-terms"
              >
                <span className="text-card-foreground">Terms of Service</span>
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          </div>

          {/* Logout Button */}
          <div className="pt-4 border-t border-border">
            <Button
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-logout"
            >
              {logoutMutation.isPending ? "Signing out..." : "Sign Out"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

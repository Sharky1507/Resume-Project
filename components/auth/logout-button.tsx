'use client'

import { logout } from "@/app/auth/login/actions";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

export function LogoutButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    // Development bypass - skip logout
    if (process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true') {
      toast({
        title: "Development Mode",
        description: "Logout bypassed in development mode",
      });
      return;
    }

    try {
      setIsLoading(true);
      await logout();
    } catch {
      toast({
        title: "Error signing out",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      variant="ghost" 
      onClick={handleLogout}
      disabled={isLoading}
      className="relative group px-4 py-2 hover:bg-transparent"
    >
      <span className="relative z-10 flex items-center gap-2 text-purple-600/80 group-hover:text-purple-700 transition-colors duration-500">
        <LogOut className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        <span>{isLoading ? 'Signing out...' : 'Logout'}</span>
      </span>
    </Button>
  );
} 
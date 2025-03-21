"use client";

import "@/lib/styles/globals.css";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ChevronDown, PlusCircle } from "lucide-react";
import { Session } from "@/lib/auth-types";
import { authClient, useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function AccountSwitcher({ sessions }: { sessions: Session[] }) {
  const { data: currentUser } = useSession();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select a user"
          className="w-[250px] justify-between"
        >
          <Avatar className="mr-2 h-6 w-6">
            <AvatarImage
              src={currentUser?.user?.image || ""}
              alt={currentUser?.user?.name}
            />
            <AvatarFallback>{currentUser?.user?.name?.charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="truncate">{currentUser?.user?.name}</span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0 bg-background border border-border shadow-md">
        <Command>
          <CommandList>
            <CommandGroup heading="Current Account">
              <CommandItem
                onSelect={() => {}}
                className="text-sm w-full justify-between hover:bg-accent/50"
                key={currentUser?.user.id}
              >
                <div className="flex items-center">
                  <Avatar className="mr-2 h-5 w-5">
                    <AvatarImage
                      src={currentUser?.user?.image || ""}
                      alt={currentUser?.user?.name}
                    />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {currentUser?.user?.name?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{currentUser?.user?.name}</span>
                </div>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Switch Account">
              {sessions
                .filter((s) => s.user.id !== currentUser?.user.id)
                .map((u, i) => (
                  <CommandItem
                    key={i}
                    onSelect={async () => {
                      await authClient.multiSession.setActive({
                        sessionToken: u.session.token,
                      });
                      setOpen(false);
                    }}
                    className="text-sm hover:bg-accent hover:text-accent-foreground transition-colors duration-200"
                  >
                    <Avatar className="mr-2 h-5 w-5">
                      <AvatarImage src={u.user.image || ""} alt={u.user.name} />
                      <AvatarFallback className="bg-secondary/20 text-secondary">
                        {u.user.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col w-full">
                      <span className="font-medium">{u.user.name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {u.user.email}
                      </span>
                    </div>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
          <CommandSeparator />
          <CommandList>
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  router.push("/sign-in");
                  setOpen(false);
                }}
                className="cursor-pointer text-sm hover:bg-accent hover:text-accent-foreground transition-colors duration-200 group"
              >
                <PlusCircle className="mr-2 h-5 w-5 text-primary group-hover:text-primary/80 transition-colors duration-200" />
                <span className="font-medium">Add Account</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
